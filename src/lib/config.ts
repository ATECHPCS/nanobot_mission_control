import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** Clamp a number to [min, max], falling back to `fallback` if NaN. */
function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (isNaN(value)) return fallback
  return Math.max(min, Math.min(max, Math.floor(value)))
}

const isBuildPhase = process.env.NEXT_PHASE === 'phase-production-build'
const runtimeCwd = process.cwd()
const normalizedCwd = runtimeCwd.endsWith(path.join('.next', 'standalone'))
  ? path.resolve(runtimeCwd, '..', '..')
  : runtimeCwd
const defaultDataDir = path.join(normalizedCwd, '.data')
const configuredDataDir = process.env.MISSION_CONTROL_DATA_DIR || defaultDataDir
const buildScratchRoot =
  process.env.MISSION_CONTROL_BUILD_DATA_DIR ||
  path.join(os.tmpdir(), 'mission-control-build')
const resolvedDataDir = isBuildPhase
  ? path.join(buildScratchRoot, `worker-${process.pid}`)
  : configuredDataDir
const resolvedDbPath = isBuildPhase
  ? (process.env.MISSION_CONTROL_BUILD_DB_PATH ||
      path.join(resolvedDataDir, 'mission-control.db'))
  : (process.env.MISSION_CONTROL_DB_PATH ||
      path.join(resolvedDataDir, 'mission-control.db'))
const resolvedTokensPath = isBuildPhase
  ? (process.env.MISSION_CONTROL_BUILD_TOKENS_PATH ||
      path.join(resolvedDataDir, 'mission-control-tokens.json'))
  : (process.env.MISSION_CONTROL_TOKENS_PATH ||
      path.join(resolvedDataDir, 'mission-control-tokens.json'))
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
  dataDir: resolvedDataDir,
  dbPath: resolvedDbPath,
  tokensPath: resolvedTokensPath,
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

  nanobotBin: process.env.NANOBOT_BIN || 'nanobot',
  clawdbotBin: process.env.NANOBOT_BIN || 'nanobot',
  nanobotConfigPath: process.env.NANOBOT_CONFIG_PATH || '',
  nanobotGatewayHost: process.env.NANOBOT_GATEWAY_HOST || '127.0.0.1',
  nanobotGatewayPort: clampInt(Number(process.env.NANOBOT_GATEWAY_PORT || process.env.GATEWAY_PORT || '0'), 0, 65535, 0),
  gatewayHost: process.env.NANOBOT_GATEWAY_HOST || '127.0.0.1',
  gatewayPort: clampInt(Number(process.env.NANOBOT_GATEWAY_PORT || process.env.GATEWAY_PORT || '18789'), 1, 65535, 18789),

  // Data retention (days). 0 = keep forever. Negative values are clamped to 0.
  retention: {
    activities: clampInt(Number(process.env.MC_RETAIN_ACTIVITIES_DAYS || '90'), 0, 3650, 90),
    auditLog: clampInt(Number(process.env.MC_RETAIN_AUDIT_DAYS || '365'), 0, 3650, 365),
    logs: clampInt(Number(process.env.MC_RETAIN_LOGS_DAYS || '30'), 0, 3650, 30),
    notifications: clampInt(Number(process.env.MC_RETAIN_NOTIFICATIONS_DAYS || '60'), 0, 3650, 60),
    pipelineRuns: clampInt(Number(process.env.MC_RETAIN_PIPELINE_RUNS_DAYS || '90'), 0, 3650, 90),
    tokenUsage: clampInt(Number(process.env.MC_RETAIN_TOKEN_USAGE_DAYS || '90'), 0, 3650, 90),
    gatewaySessions: clampInt(Number(process.env.MC_RETAIN_GATEWAY_SESSIONS_DAYS || '90'), 0, 3650, 90),
  },

  // Backward-compat aliases for upstream openclaw property names
  get openclawStateDir() { return this.nanobotStateDir },
  get openclawHome() { return this.nanobotHome },
  get openclawConfigPath() { return this.nanobotConfigPath },
  get openclawBin() { return this.nanobotBin },
}

export function ensureDirExists(dirPath: string) {
  if (!dirPath) return
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true })
  }
}
