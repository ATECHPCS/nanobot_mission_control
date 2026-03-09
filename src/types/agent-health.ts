/**
 * Type definitions for agent discovery and health monitoring.
 *
 * These types represent nanobot agents discovered from the filesystem
 * at ~/.nanobot/workspace/agents/ and their real-time health status.
 */

// ---------------------------------------------------------------------------
// Agent Discovery
// ---------------------------------------------------------------------------

/** An agent discovered from the filesystem workspace */
export interface DiscoveredAgent {
  /** Directory name, e.g. "stefany" */
  id: string
  /** Display name (directory name, titlecased) */
  name: string
  /** Absolute path to agent workspace directory */
  workspacePath: string
  /** Absolute path to agent HOME directory (parsed from launch script) */
  homePath: string
  /** Absolute path to .nanobot/config.json in agent's HOME */
  configPath: string
  /** Absolute path to launch script */
  launchScript: string
  /** LLM model from config agents.defaults.model */
  model: string
  /** Gateway HTTP port from config gateway.port */
  gatewayPort: number
  /** Gateway host from config gateway.host */
  gatewayHost: string
  /** Enabled channels from config */
  channels: Record<string, { enabled: boolean }>
  /** Custom icon from config or IDENTITY.md Emoji field */
  icon?: string
}

// ---------------------------------------------------------------------------
// Health Assessment
// ---------------------------------------------------------------------------

/** Traffic-light health level */
export type HealthLevel = 'green' | 'yellow' | 'red'

/** A single health dimension with level and human-readable reason */
export interface HealthDimension {
  level: HealthLevel
  reason: string
}

/** Composite health score across four dimensions */
export interface CompositeHealth {
  overall: HealthLevel
  dimensions: {
    process: HealthDimension
    activity: HealthDimension
    errors: HealthDimension
    channels: HealthDimension
  }
}

// ---------------------------------------------------------------------------
// Session Activity
// ---------------------------------------------------------------------------

/** Latest activity extracted from JSONL session files */
export interface SessionActivity {
  /** ISO 8601 timestamp from JSONL entry */
  timestamp: string
  /** Assistant message content (truncated for display), null if no assistant message found */
  content: string | null
  /** Role of the JSONL entry (user/assistant/tool) */
  role: string
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/** An error detected from JSONL sessions or error log files */
export interface AgentError {
  /** ISO 8601 timestamp */
  timestamp: string
  /** Error category */
  type: 'tool_error' | 'rate_limit' | 'channel_error' | 'crash'
  /** Error message (truncated) */
  message: string
  /** Source file name (session JSONL or error log) */
  source: string
}

// ---------------------------------------------------------------------------
// Channels
// ---------------------------------------------------------------------------

/** Status of a single communication channel */
export interface ChannelStatus {
  /** Channel name (e.g., "telegram", "discord") */
  name: string
  /** Whether the channel is enabled in config */
  enabled: boolean
  /** Whether the channel appears to be connected (gateway alive) */
  connected: boolean
  /** Most recent error message for this channel, if any */
  lastError: string | null
}

// ---------------------------------------------------------------------------
// Health Snapshot
// ---------------------------------------------------------------------------

/** Complete health snapshot for a discovered agent at a point in time */
export interface AgentHealthSnapshot {
  /** Agent directory name */
  id: string
  /** Agent display name */
  name: string
  /** Full discovered agent info */
  agent: DiscoveredAgent
  /** Composite health assessment */
  health: CompositeHealth
  /** Latest session activity, null if none found */
  lastActivity: SessionActivity | null
  /** Recent errors (last 24 hours) */
  errors: AgentError[]
  /** Channel statuses */
  channels: ChannelStatus[]
  /** Unix timestamp (ms) when this snapshot was taken */
  checkedAt: number
  /** Whether errors have been dismissed by an operator */
  errorsDismissed?: boolean
}
