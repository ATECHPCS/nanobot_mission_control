import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const runtimeCwd = process.cwd()
const normalizedCwd = runtimeCwd.endsWith(path.join('.next', 'standalone'))
  ? path.resolve(runtimeCwd, '..', '..')
  : runtimeCwd
const defaultDataDir = path.join(normalizedCwd, '.data')
const defaultNanobotStateDir = path.join(os.homedir(), '.nanobot')
const nanobotStateDir =
  process.env.NANOBOT_STATE_DIR ||
  process.env.NANOBOT_HOME ||
  defaultNanobotStateDir
const nanobotWorkspaceDir =
  process.env.NANOBOT_WORKSPACE_DIR ||
  process.env.MISSION_CONTROL_WORKSPACE_DIR ||
  (nanobotStateDir ? path.join(nanobotStateDir, 'workspace') : '')
const defaultMemoryDir = (() => {
  if (process.env.NANOBOT_MEMORY_DIR) return process.env.NANOBOT_MEMORY_DIR
  // Prefer workspace memory context (daily notes + knowledge-base)
  // when available; fallback to legacy sqlite memory path.
  if (
    nanobotWorkspaceDir &&
    (fs.existsSync(path.join(nanobotWorkspaceDir, 'memory')) ||
      fs.existsSync(path.join(nanobotWorkspaceDir, 'knowledge-base')))
  ) {
    return nanobotWorkspaceDir
  }
  return (nanobotStateDir ? path.join(nanobotStateDir, 'memory') : '') || path.join(defaultDataDir, 'memory')
})()

export const config = {
  claudeHome:
    process.env.MC_CLAUDE_HOME ||
    path.join(os.homedir(), '.claude'),
  dataDir: process.env.MISSION_CONTROL_DATA_DIR || defaultDataDir,
  dbPath:
    process.env.MISSION_CONTROL_DB_PATH ||
    path.join(defaultDataDir, 'mission-control.db'),
  tokensPath:
    process.env.MISSION_CONTROL_TOKENS_PATH ||
    path.join(defaultDataDir, 'mission-control-tokens.json'),
  nanobotHome: nanobotStateDir,
  nanobotStateDir,
  logsDir:
    process.env.NANOBOT_LOG_DIR ||
    (nanobotStateDir ? path.join(nanobotStateDir, 'logs') : ''),
  tempLogsDir: process.env.NANOBOT_TMP_LOG_DIR || '',
  memoryDir: defaultMemoryDir,
  memoryAllowedPrefixes:
    defaultMemoryDir === nanobotWorkspaceDir
      ? ['memory/', 'knowledge-base/']
      : [],
  soulTemplatesDir:
    process.env.NANOBOT_SOUL_TEMPLATES_DIR ||
    (nanobotStateDir ? path.join(nanobotStateDir, 'templates', 'souls') : ''),
  homeDir: os.homedir(),

  // --- Legacy aliases (consumed by files not yet migrated; will be removed in later plans) ---
  /** @deprecated Use nanobotStateDir */
  openclawHome: nanobotStateDir,
  /** @deprecated Use nanobotStateDir */
  openclawStateDir: nanobotStateDir,
  /** @deprecated Will be removed once command.ts is cleaned up */
  openclawBin: process.env.NANOBOT_BIN || 'nanobot',
  /** @deprecated Will be removed once command.ts is cleaned up */
  clawdbotBin: process.env.NANOBOT_BIN || 'nanobot',
  /** @deprecated No gateway in nanobot; will be removed */
  openclawConfigPath: '',
  /** @deprecated No gateway in nanobot; will be removed */
  gatewayHost: '127.0.0.1',
  /** @deprecated No gateway in nanobot; will be removed */
  gatewayPort: 0,

  // Data retention (days). 0 = keep forever.
  retention: {
    activities: Number(process.env.MC_RETAIN_ACTIVITIES_DAYS || '90'),
    auditLog: Number(process.env.MC_RETAIN_AUDIT_DAYS || '365'),
    logs: Number(process.env.MC_RETAIN_LOGS_DAYS || '30'),
    notifications: Number(process.env.MC_RETAIN_NOTIFICATIONS_DAYS || '60'),
    pipelineRuns: Number(process.env.MC_RETAIN_PIPELINE_RUNS_DAYS || '90'),
    tokenUsage: Number(process.env.MC_RETAIN_TOKEN_USAGE_DAYS || '90'),
  },
}

export function ensureDirExists(dirPath: string) {
  if (!dirPath) return
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}
