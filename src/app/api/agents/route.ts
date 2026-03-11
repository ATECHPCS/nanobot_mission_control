import { NextRequest, NextResponse } from 'next/server';
import { getDatabase, Agent, db_helpers } from '@/lib/db';
import { eventBus } from '@/lib/event-bus';
import { getTemplate, buildAgentConfig } from '@/lib/agent-templates';
import { logAuditEvent } from '@/lib/db';
import { requireRole } from '@/lib/auth';
import { mutationLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { validateBody, createAgentSchema } from '@/lib/validation';
import { config as appConfig } from '@/lib/config';
import { runOpenClaw } from '@/lib/command';
import { resolveWithin } from '@/lib/paths';
import path from 'node:path';

/**
 * GET /api/agents - List all agents with optional filtering
 * Query params: status, role, limit, offset
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  try {
    const db = getDatabase();
    const { searchParams } = new URL(request.url);
    const workspaceId = auth.user.workspace_id ?? 1;

    // Parse query parameters
    const status = searchParams.get('status');
    const role = searchParams.get('role');
    const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 200);
    const offset = parseInt(searchParams.get('offset') || '0');

    // Build dynamic query
    let query = 'SELECT * FROM agents WHERE workspace_id = ?';
    const params: unknown[] = [workspaceId];

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (role) {
      query += ' AND role = ?';
      params.push(role);
    }

    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const stmt = db.prepare(query);
    const agents = stmt.all(...params) as Agent[];

    // Parse JSON config field
    const agentsWithParsedData = agents.map(agent => ({
      ...agent,
      config: agent.config ? JSON.parse(agent.config) : {}
    }));

    // Get task counts for each agent (prepare once, reuse per agent)
    const taskCountStmt = db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'assigned' THEN 1 ELSE 0 END) as assigned,
        SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress,
        SUM(CASE WHEN status = 'quality_review' THEN 1 ELSE 0 END) as quality_review,
        SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) as done
      FROM tasks
      WHERE assigned_to = ? AND workspace_id = ?
    `);

    const agentsWithStats = agentsWithParsedData.map(agent => {
      const taskStats = taskCountStmt.get(agent.name, workspaceId) as Record<string, number>;

      return {
        ...agent,
        taskStats: {
          total: taskStats.total || 0,
          assigned: taskStats.assigned || 0,
          in_progress: taskStats.in_progress || 0,
          quality_review: taskStats.quality_review || 0,
          done: taskStats.done || 0,
          completed: taskStats.done || 0
        }
      };
    });

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) as total FROM agents WHERE workspace_id = ?';
    const countParams: unknown[] = [workspaceId];
    if (status) {
      countQuery += ' AND status = ?';
      countParams.push(status);
    }
    if (role) {
      countQuery += ' AND role = ?';
      countParams.push(role);
    }
    const countRow = db.prepare(countQuery).get(...countParams) as { total: number };

    return NextResponse.json({
      agents: agentsWithStats,
      total: countRow.total,
      page: Math.floor(offset / limit) + 1,
      limit
    });
  } catch (error) {
    logger.error({ err: error }, 'GET /api/agents error');
    return NextResponse.json({ error: 'Failed to fetch agents' }, { status: 500 });
  }
}

/**
 * POST /api/agents - Create a new agent
 */
export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const rateCheck = mutationLimiter(request);
  if (rateCheck) return rateCheck;

  try {
    const db = getDatabase();
    const workspaceId = auth.user.workspace_id ?? 1;
    const validated = await validateBody(request, createAgentSchema);
    if ('error' in validated) return validated.error;
    const body = validated.data;

    const {
      name,
      role,
      session_key,
      soul_content,
      status = 'offline',
      config = {},
      template,
    } = body;

    // Resolve template if specified
    let finalRole = role;
    let finalConfig: Record<string, unknown> = { ...config };
    if (template) {
      const tpl = getTemplate(template);
      if (tpl) {
        const builtConfig = buildAgentConfig(tpl, {} as Parameters<typeof buildAgentConfig>[1]);
        finalConfig = { ...builtConfig, ...finalConfig };
        if (!finalRole) finalRole = tpl.config.identity?.theme || tpl.type;
      }
    }

    if (!name || !finalRole) {
      return NextResponse.json({ error: 'Name and role are required' }, { status: 400 });
    }

    // Check if agent name already exists
    const existingAgent = db
      .prepare('SELECT id FROM agents WHERE name = ? AND workspace_id = ?')
      .get(name, workspaceId);
    if (existingAgent) {
      return NextResponse.json({ error: 'Agent name already exists' }, { status: 409 });
    }

    // Optional: provision a nanobot workspace on disk via CLI
    const { provision_workspace, workspace_path } = body
    const nanobotId = String(config?.nanobotId || config?.openclawId || name || '')
      .toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || name
    if (provision_workspace) {
      const stateDir = appConfig.nanobotStateDir || appConfig.openclawStateDir
      if (!stateDir) {
        return NextResponse.json(
          { error: 'NANOBOT_STATE_DIR is not configured; cannot provision workspace' },
          { status: 500 }
        );
      }

      const resolvedWorkspacePath = workspace_path
        ? path.resolve(workspace_path)
        : resolveWithin(stateDir, path.join('workspaces', nanobotId));

      try {
        await runOpenClaw(
          ['agents', 'add', nanobotId, '--workspace', resolvedWorkspacePath, '--non-interactive'],
          { timeoutMs: 20000 }
        );
      } catch (provisionError: any) {
        logger.error({ err: provisionError, nanobotId, workspacePath: resolvedWorkspacePath }, 'Workspace provisioning failed');
        return NextResponse.json(
          { error: provisionError?.message || 'Failed to provision agent workspace' },
          { status: 502 }
        );
      }
    }

    const now = Math.floor(Date.now() / 1000);

    const stmt = db.prepare(`
      INSERT INTO agents (
        name, role, session_key, soul_content, status,
        created_at, updated_at, config, workspace_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const dbResult = stmt.run(
      name,
      finalRole,
      session_key,
      soul_content,
      status,
      now,
      now,
      JSON.stringify(finalConfig),
      workspaceId
    );

    const agentId = dbResult.lastInsertRowid as number;

    // Log activity
    db_helpers.logActivity(
      'agent_created',
      'agent',
      agentId,
      auth.user.username,
      `Created agent: ${name} (${finalRole})${template ? ` from template: ${template}` : ''}`,
      {
        name,
        role: finalRole,
        status,
        session_key,
        template: template || null
      },
      workspaceId
    );

    // Fetch the created agent
    const createdAgent = db
      .prepare('SELECT * FROM agents WHERE id = ? AND workspace_id = ?')
      .get(agentId, workspaceId) as Agent;
    const parsedAgent = {
      ...createdAgent,
      config: JSON.parse(createdAgent.config || '{}'),
      taskStats: { total: 0, assigned: 0, in_progress: 0, quality_review: 0, done: 0, completed: 0 }
    };

    // Broadcast to SSE clients
    eventBus.broadcast('agent.created', parsedAgent);

    return NextResponse.json({ agent: parsedAgent }, { status: 201 });
  } catch (error) {
    logger.error({ err: error }, 'POST /api/agents error');
    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 });
  }
}

/**
 * PUT /api/agents - Update agent status (bulk operation for status updates)
 */
export async function PUT(request: NextRequest) {
  const auth = requireRole(request, 'operator');
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const rateCheck = mutationLimiter(request);
  if (rateCheck) return rateCheck;

  try {
    const db = getDatabase();
    const workspaceId = auth.user.workspace_id ?? 1;
    const body = await request.json();

    // Handle single agent update or bulk updates
    if (body.name) {
      // Single agent update
      const { name, status, last_activity, config, session_key, soul_content, role } = body;

      const agent = db
        .prepare('SELECT * FROM agents WHERE name = ? AND workspace_id = ?')
        .get(name, workspaceId) as Agent;
      if (!agent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
      }

      const now = Math.floor(Date.now() / 1000);

      // Build dynamic update query
      const fieldsToUpdate = [];
      const params: unknown[] = [];

      if (status !== undefined) {
        fieldsToUpdate.push('status = ?');
        params.push(status);

        fieldsToUpdate.push('last_seen = ?');
        params.push(now);
      }

      if (last_activity !== undefined) {
        fieldsToUpdate.push('last_activity = ?');
        params.push(last_activity);
      }

      if (config !== undefined) {
        fieldsToUpdate.push('config = ?');
        params.push(JSON.stringify(config));
      }

      if (session_key !== undefined) {
        fieldsToUpdate.push('session_key = ?');
        params.push(session_key);
      }

      if (soul_content !== undefined) {
        fieldsToUpdate.push('soul_content = ?');
        params.push(soul_content);
      }

      if (role !== undefined) {
        fieldsToUpdate.push('role = ?');
        params.push(role);
      }

      fieldsToUpdate.push('updated_at = ?');
      params.push(now);
      params.push(name, workspaceId);

      if (fieldsToUpdate.length === 1) { // Only updated_at
        return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
      }

      const stmt = db.prepare(`
        UPDATE agents
        SET ${fieldsToUpdate.join(', ')}
        WHERE name = ? AND workspace_id = ?
      `);

      stmt.run(...params);

      // Log status change if status was updated
      if (status !== undefined && status !== agent.status) {
        db_helpers.logActivity(
          'agent_status_change',
          'agent',
          agent.id,
          name,
          `Agent status changed from ${agent.status} to ${status}`,
          {
            oldStatus: agent.status,
            newStatus: status,
            last_activity
          },
          workspaceId
        );
      }

      // Broadcast update to SSE clients
      eventBus.broadcast('agent.updated', {
        id: agent.id,
        name,
        ...(status !== undefined && { status }),
        ...(last_activity !== undefined && { last_activity }),
        ...(role !== undefined && { role }),
        updated_at: now,
      });

      return NextResponse.json({ success: true });
    } else {
      return NextResponse.json({ error: 'Agent name is required' }, { status: 400 });
    }
  } catch (error) {
    logger.error({ err: error }, 'PUT /api/agents error');
    return NextResponse.json({ error: 'Failed to update agent' }, { status: 500 });
  }
}
