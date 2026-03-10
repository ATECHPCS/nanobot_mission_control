/**
 * Token aggregation helpers.
 *
 * Pure-query module that aggregates token data from three SQLite tables:
 *   - claude_sessions  (Claude Code session tokens)
 *   - token_usage      (MC API request tokens)
 *   - nanobot_sessions (nanobot agent message counts, NOT token counts)
 *
 * Extracted from the API route for unit-testability.
 */

import type Database from 'better-sqlite3'

// -- Public types ----------------------------------------------------------

export interface UnifiedTokenStats {
  summary: {
    totalInputTokens: number
    totalOutputTokens: number
    totalSessions: number       // claude_sessions count + nanobot_sessions count
    totalMessages: number       // nanobot session message sum
    mostActiveAgent: string     // agent/project with most tokens (or messages for nanobot)
    avgTokensPerSession: number
  }
  byAgent: Array<{
    agent: string               // agent_id for nanobot, project_slug for claude code
    source: 'nanobot' | 'claude-code'
    inputTokens: number
    outputTokens: number
    sessionCount: number
    messageCount: number        // only for nanobot agents
  }>
  byModel: Array<{
    model: string
    inputTokens: number
    outputTokens: number
  }>
  timeline: Array<{
    date: string                // YYYY-MM-DD
    inputTokens: number
    outputTokens: number
  }>
  range: string
}

// -- Range helpers ---------------------------------------------------------

type Range = 'today' | 'week' | 'month' | 'year'

const RANGE_DAYS: Record<Range, number> = {
  today: 1,
  week: 7,
  month: 30,
  year: 365,
}

function cutoffDate(range: Range, now: Date): string {
  const days = RANGE_DAYS[range] ?? 7
  const cutoff = new Date(now)
  cutoff.setHours(0, 0, 0, 0) // midnight today
  cutoff.setDate(cutoff.getDate() - (days - 1)) // "today" = since midnight, "week" = 7 days back from midnight
  return cutoff.toISOString()
}

function cutoffEpoch(range: Range, now: Date): number {
  const days = RANGE_DAYS[range] ?? 7
  const cutoff = new Date(now)
  cutoff.setHours(0, 0, 0, 0)
  cutoff.setDate(cutoff.getDate() - (days - 1))
  return Math.floor(cutoff.getTime() / 1000)
}

// -- Row types for query results -------------------------------------------

interface ClaudeAgentRow {
  project_slug: string
  input_tokens: number
  output_tokens: number
  session_count: number
}

interface TokenUsageModelRow {
  model: string
  input_tokens: number
  output_tokens: number
}

interface ClaudeModelRow {
  model: string
  input_tokens: number
  output_tokens: number
}

interface NanobotAgentRow {
  agent_id: string
  total_messages: number
  session_count: number
}

interface TimelineDateRow {
  date_bucket: string
  input_tokens: number
  output_tokens: number
}

// -- Display name helpers --------------------------------------------------

/**
 * Clean a Claude Code project_slug into a human-readable name.
 * Slugs look like: "-Users-designmac-Nanobot-Bookkeeping-Bot"
 * Strip the home dir prefix and format the remainder.
 */
function cleanProjectSlug(slug: string): string {
  // Remove leading dash and split by dash
  const parts = slug.replace(/^-/, '').split('-')

  // Find where the home dir prefix ends (Users/username pattern)
  // Typical: ["Users", "designmac", ...rest]
  let startIdx = 0
  if (parts[0] === 'Users' && parts.length > 1) {
    startIdx = 2 // skip "Users" and username
  }

  const remainder = parts.slice(startIdx).filter(Boolean)

  // If nothing left, it's the home directory itself
  if (remainder.length === 0) return 'Claude Code'

  // For hidden dir paths (e.g. .nanobot/workspace/agents/cody),
  // use the agent name if present, otherwise the top-level dir name
  if (parts[startIdx] === '') {
    const agentsIdx = remainder.indexOf('agents')
    const name = agentsIdx >= 0 && agentsIdx < remainder.length - 1
      ? remainder[remainder.length - 1] // agent name after "agents/"
      : remainder[0]                     // top-level dir name (e.g. "nanobot")
    return name.charAt(0).toUpperCase() + name.slice(1)
  }

  // For regular project dirs, join with spaces and title-case
  // e.g. "Nanobot-Bookkeeping-Bot" -> "Nanobot Bookkeeping Bot"
  return remainder.join(' ').replace(/\b\w/g, c => c.toUpperCase())
}

// -- Main aggregation function ---------------------------------------------

export function aggregateTokenStats(
  db: Database.Database,
  range: Range | string,
  now: Date = new Date(),
): UnifiedTokenStats {
  const validRange = (RANGE_DAYS[range as Range] ? range : 'week') as Range
  const isoCutoff = cutoffDate(validRange, now)
  const epochCutoff = cutoffEpoch(validRange, now)

  // Query 1: Claude Code session tokens grouped by project_slug
  const claudeByAgent = db.prepare(`
    SELECT project_slug,
           SUM(input_tokens) as input_tokens,
           SUM(output_tokens) as output_tokens,
           COUNT(*) as session_count
    FROM claude_sessions
    WHERE last_message_at >= ?
    GROUP BY project_slug
  `).all(isoCutoff) as ClaudeAgentRow[]

  // Query 2: Claude Code session tokens grouped by model
  const claudeByModel = db.prepare(`
    SELECT model,
           SUM(input_tokens) as input_tokens,
           SUM(output_tokens) as output_tokens
    FROM claude_sessions
    WHERE last_message_at >= ? AND model IS NOT NULL
    GROUP BY model
  `).all(isoCutoff) as ClaudeModelRow[]

  // Query 3: MC API token_usage grouped by model
  const apiByModel = db.prepare(`
    SELECT model,
           SUM(input_tokens) as input_tokens,
           SUM(output_tokens) as output_tokens
    FROM token_usage
    WHERE created_at >= ?
    GROUP BY model
  `).all(epochCutoff) as TokenUsageModelRow[]

  // Query 4: Nanobot session counts (message counts, NOT tokens)
  const nanobotAgents = db.prepare(`
    SELECT agent_id,
           SUM(message_count) as total_messages,
           COUNT(*) as session_count
    FROM nanobot_sessions
    WHERE last_message_at >= ?
    GROUP BY agent_id
  `).all(isoCutoff) as NanobotAgentRow[]

  // Query 5: Timeline - Claude Code sessions by date
  const claudeTimeline = db.prepare(`
    SELECT date(last_message_at) as date_bucket,
           SUM(input_tokens) as input_tokens,
           SUM(output_tokens) as output_tokens
    FROM claude_sessions
    WHERE last_message_at >= ?
    GROUP BY date(last_message_at)
  `).all(isoCutoff) as TimelineDateRow[]

  // Query 6: Timeline - token_usage by date
  const apiTimeline = db.prepare(`
    SELECT date(created_at, 'unixepoch') as date_bucket,
           SUM(input_tokens) as input_tokens,
           SUM(output_tokens) as output_tokens
    FROM token_usage
    WHERE created_at >= ?
    GROUP BY date(created_at, 'unixepoch')
  `).all(epochCutoff) as TimelineDateRow[]

  // -- Aggregate byAgent ---------------------------------------------------

  // Nanobot agent tokens are already captured in claude_sessions (they run via Claude Code).
  // Only show claude_sessions data in byAgent to avoid duplicates with mismatched names.
  const agentMap = new Map<string, UnifiedTokenStats['byAgent'][number]>()

  for (const row of claudeByAgent) {
    const name = cleanProjectSlug(row.project_slug)
    const existing = agentMap.get(name)
    if (existing) {
      existing.inputTokens += row.input_tokens
      existing.outputTokens += row.output_tokens
      existing.sessionCount += row.session_count
    } else {
      agentMap.set(name, {
        agent: name,
        source: 'claude-code',
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        sessionCount: row.session_count,
        messageCount: 0,
      })
    }
  }

  const byAgent: UnifiedTokenStats['byAgent'] = Array.from(agentMap.values())

  // -- Aggregate byModel (merge claude_sessions + token_usage) -------------

  const modelMap = new Map<string, { inputTokens: number; outputTokens: number }>()

  for (const row of claudeByModel) {
    const key = row.model
    const existing = modelMap.get(key) ?? { inputTokens: 0, outputTokens: 0 }
    existing.inputTokens += row.input_tokens
    existing.outputTokens += row.output_tokens
    modelMap.set(key, existing)
  }

  for (const row of apiByModel) {
    const key = row.model
    const existing = modelMap.get(key) ?? { inputTokens: 0, outputTokens: 0 }
    existing.inputTokens += row.input_tokens
    existing.outputTokens += row.output_tokens
    modelMap.set(key, existing)
  }

  const byModel: UnifiedTokenStats['byModel'] = Array.from(modelMap.entries()).map(
    ([model, data]) => ({ model, ...data }),
  )

  // -- Aggregate timeline (merge both sources) -----------------------------

  const dateMap = new Map<string, { inputTokens: number; outputTokens: number }>()

  for (const row of claudeTimeline) {
    if (!row.date_bucket) continue
    const existing = dateMap.get(row.date_bucket) ?? { inputTokens: 0, outputTokens: 0 }
    existing.inputTokens += row.input_tokens
    existing.outputTokens += row.output_tokens
    dateMap.set(row.date_bucket, existing)
  }

  for (const row of apiTimeline) {
    if (!row.date_bucket) continue
    const existing = dateMap.get(row.date_bucket) ?? { inputTokens: 0, outputTokens: 0 }
    existing.inputTokens += row.input_tokens
    existing.outputTokens += row.output_tokens
    dateMap.set(row.date_bucket, existing)
  }

  const timeline: UnifiedTokenStats['timeline'] = Array.from(dateMap.entries())
    .map(([date, data]) => ({ date, ...data }))
    .sort((a, b) => a.date.localeCompare(b.date))

  // -- Compute summary -----------------------------------------------------

  const totalInputTokens = byAgent
    .filter(a => a.source === 'claude-code')
    .reduce((sum, a) => sum + a.inputTokens, 0)
    + Array.from(modelMap.values()).reduce((sum, m) => sum + m.inputTokens, 0)
    - claudeByModel.reduce((sum, r) => sum + r.input_tokens, 0) // avoid double-counting claude_sessions

  // Actually, let's compute directly from the merged model map which already has both
  // and from claude agent data. But model map already merges both. Let's be precise:
  // Total input = sum of claude_sessions input + sum of token_usage input
  const claudeTotalInput = claudeByAgent.reduce((s, r) => s + r.input_tokens, 0)
  const claudeTotalOutput = claudeByAgent.reduce((s, r) => s + r.output_tokens, 0)
  const apiTotalInput = apiByModel.reduce((s, r) => s + r.input_tokens, 0)
  const apiTotalOutput = apiByModel.reduce((s, r) => s + r.output_tokens, 0)

  const totalInput = claudeTotalInput + apiTotalInput
  const totalOutput = claudeTotalOutput + apiTotalOutput

  const claudeSessionCount = claudeByAgent.reduce((s, r) => s + r.session_count, 0)
  const nanobotSessionCount = nanobotAgents.reduce((s, r) => s + r.session_count, 0)
  const totalSessions = claudeSessionCount + nanobotSessionCount

  const totalMessages = nanobotAgents.reduce((s, r) => s + r.total_messages, 0)

  const totalTokens = totalInput + totalOutput
  const avgTokensPerSession = totalSessions > 0 ? Math.round(totalTokens / totalSessions) : 0

  // Most active agent: by token count for claude-code, by message count for nanobot
  // We compare total activity score: tokens for claude agents, scale messages for nanobot
  // Per the plan: "agent/project with most total tokens"
  let mostActiveAgent = ''
  let maxTokens = 0

  for (const a of byAgent) {
    const score = a.inputTokens + a.outputTokens
    if (score > maxTokens) {
      maxTokens = score
      mostActiveAgent = a.agent
    }
  }

  // If no agent had tokens (only nanobot agents), fall back to most messages
  if (!mostActiveAgent && nanobotAgents.length > 0) {
    let maxMsg = 0
    for (const a of nanobotAgents) {
      if (a.total_messages > maxMsg) {
        maxMsg = a.total_messages
        mostActiveAgent = a.agent_id.charAt(0).toUpperCase() + a.agent_id.slice(1)
      }
    }
  }

  return {
    summary: {
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
      totalSessions,
      totalMessages,
      mostActiveAgent,
      avgTokensPerSession,
    },
    byAgent,
    byModel,
    timeline,
    range: validRange,
  }
}
