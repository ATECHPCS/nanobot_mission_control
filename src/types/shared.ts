/**
 * Canonical entity type definitions for Mission Control.
 *
 * These are the "client-facing" shapes used by the Zustand store, React
 * components, and API response serialization.  Server-side code that reads
 * raw SQLite rows should use the `Db*Row` aliases defined in src/lib/db.ts
 * (where JSON-column fields are typed as `string`).
 *
 * Keeping a single source of truth here prevents drift between server and
 * client type definitions.
 */

// ---------------------------------------------------------------------------
// Kanban / Task Management
// ---------------------------------------------------------------------------

export interface Task {
  id: number
  title: string
  description?: string
  status: 'inbox' | 'assigned' | 'in_progress' | 'review' | 'quality_review' | 'done'
  priority: 'low' | 'medium' | 'high' | 'critical' | 'urgent'
  project_id?: number
  project_ticket_no?: number
  project_name?: string
  project_prefix?: string
  ticket_ref?: string
  assigned_to?: string
  created_by: string
  created_at: number
  updated_at: number
  due_date?: number
  estimated_hours?: number
  actual_hours?: number
  outcome?: 'success' | 'failed' | 'partial' | 'abandoned'
  error_message?: string
  resolution?: string
  feedback_rating?: number
  feedback_notes?: string
  retry_count?: number
  completed_at?: number
  tags?: string[]
  metadata?: Record<string, unknown>
}

export interface Comment {
  id: number
  task_id: number
  author: string
  content: string
  created_at: number
  parent_id?: number
  mentions?: string[]
  replies?: Comment[]
}

// ---------------------------------------------------------------------------
// Agents
// ---------------------------------------------------------------------------

export interface Agent {
  id: number
  name: string
  role: string
  session_key?: string
  soul_content?: string
  status: 'offline' | 'idle' | 'busy' | 'error'
  last_seen?: number
  last_activity?: string
  created_at: number
  updated_at: number
  config?: Record<string, unknown>
  taskStats?: {
    total: number
    assigned: number
    in_progress: number
    completed: number
  }
}

// ---------------------------------------------------------------------------
// Activity Feed
// ---------------------------------------------------------------------------

export interface Activity {
  id: number
  type: string
  entity_type: string
  entity_id: number
  actor: string
  description: string
  data?: Record<string, unknown>
  created_at: number
  /** Enriched entity info (populated by JOIN in API responses) */
  entity?: {
    type: string
    id?: number
    title?: string
    name?: string
    status?: string
    content_preview?: string
    task_title?: string
  }
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export interface Notification {
  id: number
  recipient: string
  type: string
  title: string
  message: string
  source_type?: string
  source_id?: number
  read_at?: number
  delivered_at?: number
  created_at: number
  /** Enriched source info (populated by JOIN in API responses) */
  source?: {
    type: string
    id?: number
    title?: string
    name?: string
    status?: string
    content_preview?: string
    task_title?: string
  }
}

// ---------------------------------------------------------------------------
// Chat / Messaging
// ---------------------------------------------------------------------------

export interface ChatMessage {
  id: number
  conversation_id: string
  from_agent: string
  to_agent: string | null
  content: string
  message_type: 'text' | 'system' | 'handoff' | 'status' | 'command'
  metadata?: Record<string, unknown>
  read_at?: number
  created_at: number
  pendingStatus?: 'sending' | 'sent' | 'failed'
}

export interface Conversation {
  id: string
  name?: string
  participants: string[]
  lastMessage?: ChatMessage
  unreadCount: number
  updatedAt: number
}

// ---------------------------------------------------------------------------
// Sessions & Logs
// ---------------------------------------------------------------------------

export interface Session {
  id: string
  key: string
  kind: string
  age: string
  model: string
  tokens: string
  flags: string[]
  active: boolean
  startTime?: number
  lastActivity?: number
  messageCount?: number
  cost?: number
}

export interface LogEntry {
  id: string
  timestamp: number
  level: 'info' | 'warn' | 'error' | 'debug'
  source: string
  session?: string
  message: string
  data?: Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Cron
// ---------------------------------------------------------------------------

export interface CronJob {
  id?: string
  name: string
  schedule: string
  command: string
  model?: string
  agentId?: string
  timezone?: string
  delivery?: string
  enabled: boolean
  lastRun?: number
  nextRun?: number
  lastStatus?: 'success' | 'error' | 'running'
  lastError?: string
}

// ---------------------------------------------------------------------------
// Agent Spawning
// ---------------------------------------------------------------------------

export interface SpawnRequest {
  id: string
  task: string
  model: string
  label: string
  timeoutSeconds: number
  status: 'pending' | 'running' | 'completed' | 'failed'
  createdAt: number
  completedAt?: number
  result?: string
  error?: string
}

// ---------------------------------------------------------------------------
// Memory Browser
// ---------------------------------------------------------------------------

export interface MemoryFile {
  path: string
  name: string
  type: 'file' | 'directory'
  size?: number
  modified?: number
  children?: MemoryFile[]
}

// ---------------------------------------------------------------------------
// Token Usage & Models
// ---------------------------------------------------------------------------

export interface TokenUsage {
  model: string
  sessionId: string
  date: string
  inputTokens: number
  outputTokens: number
  totalTokens: number
  cost: number
}

export interface ModelConfig {
  alias: string
  name: string
  provider: string
  description: string
  costPer1k: number
}

// ---------------------------------------------------------------------------
// Standup Reports
// ---------------------------------------------------------------------------

export interface StandupReport {
  date: string
  generatedAt: string
  summary: {
    totalAgents: number
    totalCompleted: number
    totalInProgress: number
    totalAssigned: number
    totalReview: number
    totalBlocked: number
    totalActivity: number
    overdue: number
  }
  agentReports: Array<{
    agent: {
      name: string
      role: string
      status: string
      last_seen?: number
      last_activity?: string
    }
    completedToday: Task[]
    inProgress: Task[]
    assigned: Task[]
    review: Task[]
    blocked: Task[]
    activity: {
      actionCount: number
      commentsCount: number
    }
  }>
  teamAccomplishments: Task[]
  teamBlockers: Task[]
  overdueTasks: Task[]
}

// ---------------------------------------------------------------------------
// Auth / Users
// ---------------------------------------------------------------------------

export interface CurrentUser {
  id: number
  username: string
  display_name: string
  role: 'admin' | 'operator' | 'viewer'
  provider?: 'local' | 'google'
  email?: string | null
  avatar_url?: string | null
}

// ---------------------------------------------------------------------------
// Connection / SSE Status
// ---------------------------------------------------------------------------

export interface ConnectionStatus {
  isConnected: boolean
  url: string
  lastConnected?: Date
  reconnectAttempts: number
  latency?: number
  sseConnected?: boolean
}

// ---------------------------------------------------------------------------
// Database Row Types
//
// These mirror the shared types above but use `string` for JSON columns,
// matching what better-sqlite3 returns from raw queries.  Server-side code
// that reads rows directly from the database should use these.
// ---------------------------------------------------------------------------

export interface DbTaskRow {
  id: number
  title: string
  description?: string
  status: 'inbox' | 'assigned' | 'in_progress' | 'review' | 'quality_review' | 'done'
  priority: 'low' | 'medium' | 'high' | 'critical' | 'urgent'
  project_id?: number
  project_ticket_no?: number
  project_name?: string
  project_prefix?: string
  ticket_ref?: string
  assigned_to?: string
  created_by: string
  created_at: number
  updated_at: number
  due_date?: number
  estimated_hours?: number
  actual_hours?: number
  outcome?: 'success' | 'failed' | 'partial' | 'abandoned'
  error_message?: string
  resolution?: string
  feedback_rating?: number
  feedback_notes?: string
  retry_count?: number
  completed_at?: number
  tags?: string       // JSON string
  metadata?: string   // JSON string
}

export interface DbAgentRow {
  id: number
  name: string
  role: string
  session_key?: string
  soul_content?: string
  status: 'offline' | 'idle' | 'busy' | 'error'
  last_seen?: number
  last_activity?: string
  created_at: number
  updated_at: number
  config?: string     // JSON string
}

export interface DbCommentRow {
  id: number
  task_id: number
  author: string
  content: string
  created_at: number
  parent_id?: number
  mentions?: string   // JSON string
}

export interface DbActivityRow {
  id: number
  type: string
  entity_type: string
  entity_id: number
  actor: string
  description: string
  data?: string       // JSON string
  created_at: number
}

export interface DbMessageRow {
  id: number
  conversation_id: string
  from_agent: string
  to_agent?: string
  content: string
  message_type: string
  metadata?: string   // JSON string
  read_at?: number
  created_at: number
}

export interface DbNotificationRow {
  id: number
  recipient: string
  type: string
  title: string
  message: string
  source_type?: string
  source_id?: number
  read_at?: number
  delivered_at?: number
  created_at: number
}
