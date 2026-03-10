import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import Database from 'better-sqlite3'

/**
 * Token aggregation tests.
 *
 * These test the SQL query logic used by the /api/token-stats route.
 * We create an in-memory SQLite database with the same schema as the
 * production tables and run the aggregation functions against test data.
 */

// -- Helper: create in-memory DB with the three relevant tables ----------

function createTestDb(): Database.Database {
  const db = new Database(':memory:')

  db.exec(`
    CREATE TABLE claude_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL UNIQUE,
      project_slug TEXT NOT NULL,
      project_path TEXT,
      model TEXT,
      git_branch TEXT,
      user_messages INTEGER NOT NULL DEFAULT 0,
      assistant_messages INTEGER NOT NULL DEFAULT 0,
      tool_uses INTEGER NOT NULL DEFAULT 0,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      estimated_cost REAL NOT NULL DEFAULT 0,
      first_message_at TEXT,
      last_message_at TEXT,
      last_user_prompt TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      scanned_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE token_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      model TEXT NOT NULL,
      session_id TEXT NOT NULL,
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE nanobot_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id TEXT NOT NULL,
      filename TEXT NOT NULL,
      session_key TEXT NOT NULL,
      channel_type TEXT NOT NULL,
      channel_identifier TEXT NOT NULL,
      message_count INTEGER NOT NULL DEFAULT 0,
      first_message_at TEXT,
      last_message_at TEXT,
      last_user_message TEXT,
      file_size_bytes INTEGER NOT NULL DEFAULT 0,
      scanned_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(agent_id, filename)
    );
  `)

  return db
}

// -- Helper: seed test data ------------------------------------------------

function seedClaudeSessions(db: Database.Database) {
  const insert = db.prepare(`
    INSERT INTO claude_sessions (session_id, project_slug, model, input_tokens, output_tokens, estimated_cost, first_message_at, last_message_at, scanned_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  // Two sessions for project "mc-project" (same model)
  insert.run('sess-1', 'mc-project', 'claude-sonnet-4-6', 5000, 2000, 0.045, '2026-03-08T10:00:00Z', '2026-03-08T12:00:00Z', 1000)
  insert.run('sess-2', 'mc-project', 'claude-sonnet-4-6', 3000, 1000, 0.030, '2026-03-09T08:00:00Z', '2026-03-09T10:00:00Z', 1000)

  // One session for a different project with different model
  insert.run('sess-3', 'bookkeeping-bot', 'claude-haiku-4-5', 1000, 500, 0.005, '2026-03-09T14:00:00Z', '2026-03-09T15:00:00Z', 1000)

  // Old session outside typical "week" range
  insert.run('sess-old', 'mc-project', 'claude-sonnet-4-6', 10000, 5000, 0.2, '2026-02-01T10:00:00Z', '2026-02-01T12:00:00Z', 1000)
}

function seedTokenUsage(db: Database.Database) {
  const insert = db.prepare(`
    INSERT INTO token_usage (model, session_id, input_tokens, output_tokens, created_at)
    VALUES (?, ?, ?, ?, ?)
  `)

  // Recent MC API usage (unix epoch for 2026-03-09)
  const mar9 = Math.floor(new Date('2026-03-09T12:00:00Z').getTime() / 1000)
  insert.run('claude-sonnet-4-6', 'api-sess-1', 2000, 800, mar9)
  insert.run('claude-haiku-4-5', 'api-sess-2', 500, 200, mar9)

  // Old usage
  const feb1 = Math.floor(new Date('2026-02-01T12:00:00Z').getTime() / 1000)
  insert.run('claude-sonnet-4-6', 'api-sess-old', 8000, 4000, feb1)
}

function seedNanobotSessions(db: Database.Database) {
  const insert = db.prepare(`
    INSERT INTO nanobot_sessions (agent_id, filename, session_key, channel_type, channel_identifier, message_count, first_message_at, last_message_at, scanned_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  insert.run('stefany', 'telegram_123.jsonl', 'telegram:123', 'telegram', '123', 42, '2026-03-08T09:00:00Z', '2026-03-09T16:00:00Z', 1000)
  insert.run('cody', 'cron_daily-check.jsonl', 'cron:daily-check', 'cron', 'daily-check', 15, '2026-03-09T06:00:00Z', '2026-03-09T18:00:00Z', 1000)

  // Old session
  insert.run('stefany', 'telegram_old.jsonl', 'telegram:old', 'telegram', 'old', 100, '2026-01-15T10:00:00Z', '2026-01-15T18:00:00Z', 1000)
}

// -- Import aggregation helpers (to be created) ----------------------------

// These functions will live in the route handler but we extract the pure
// query logic into testable helpers in a shared module.
import {
  aggregateTokenStats,
  type UnifiedTokenStats,
} from '@/lib/token-aggregation'

// -- Tests -----------------------------------------------------------------

describe('token aggregation', () => {
  let db: Database.Database

  beforeEach(() => {
    db = createTestDb()
  })

  afterEach(() => {
    db.close()
  })

  describe('with populated data', () => {
    beforeEach(() => {
      seedClaudeSessions(db)
      seedTokenUsage(db)
      seedNanobotSessions(db)
    })

    it('computes correct summary totals for week range', () => {
      // Using a fixed "now" of 2026-03-10T00:00:00Z so "week" captures Mar 3-10
      const stats = aggregateTokenStats(db, 'week', new Date('2026-03-10T00:00:00Z'))

      // Claude sessions in range: sess-1 (5000+2000=7K), sess-2 (3000+1000=4K), sess-3 (1000+500=1.5K)
      // token_usage in range: api-sess-1 (2000+800=2.8K), api-sess-2 (500+200=0.7K)
      // Input total: 5000+3000+1000 + 2000+500 = 11500
      // Output total: 2000+1000+500 + 800+200 = 4500
      expect(stats.summary.totalInputTokens).toBe(11500)
      expect(stats.summary.totalOutputTokens).toBe(4500)
    })

    it('counts sessions from claude_sessions and nanobot_sessions', () => {
      const stats = aggregateTokenStats(db, 'week', new Date('2026-03-10T00:00:00Z'))

      // claude_sessions in range: 3 (sess-1, sess-2, sess-3)
      // nanobot_sessions in range: 2 (stefany telegram_123, cody cron_daily-check)
      expect(stats.summary.totalSessions).toBe(5)
    })

    it('counts nanobot message totals', () => {
      const stats = aggregateTokenStats(db, 'week', new Date('2026-03-10T00:00:00Z'))

      // stefany: 42, cody: 15 = 57
      expect(stats.summary.totalMessages).toBe(57)
    })

    it('identifies most active agent by token count', () => {
      const stats = aggregateTokenStats(db, 'week', new Date('2026-03-10T00:00:00Z'))

      // mc-project has most tokens: 5000+3000 input + 2000+1000 output = 11000
      expect(stats.summary.mostActiveAgent).toBe('mc-project')
    })

    it('computes average tokens per session', () => {
      const stats = aggregateTokenStats(db, 'week', new Date('2026-03-10T00:00:00Z'))

      // Total tokens: 11500+4500 = 16000
      // Total sessions: 5
      // Avg: 3200
      expect(stats.summary.avgTokensPerSession).toBe(3200)
    })

    it('groups by agent with correct source labels', () => {
      const stats = aggregateTokenStats(db, 'week', new Date('2026-03-10T00:00:00Z'))

      const mcAgent = stats.byAgent.find(a => a.agent === 'mc-project')
      expect(mcAgent).toBeDefined()
      expect(mcAgent!.source).toBe('claude-code')
      expect(mcAgent!.inputTokens).toBe(8000) // 5000+3000
      expect(mcAgent!.outputTokens).toBe(3000) // 2000+1000

      const bbAgent = stats.byAgent.find(a => a.agent === 'bookkeeping-bot')
      expect(bbAgent).toBeDefined()
      expect(bbAgent!.source).toBe('claude-code')
      expect(bbAgent!.inputTokens).toBe(1000)
      expect(bbAgent!.outputTokens).toBe(500)

      const stefany = stats.byAgent.find(a => a.agent === 'stefany')
      expect(stefany).toBeDefined()
      expect(stefany!.source).toBe('nanobot')
      expect(stefany!.messageCount).toBe(42)
      expect(stefany!.inputTokens).toBe(0) // nanobot has no token data
      expect(stefany!.outputTokens).toBe(0)
    })

    it('groups by model merging both claude_sessions and token_usage', () => {
      const stats = aggregateTokenStats(db, 'week', new Date('2026-03-10T00:00:00Z'))

      const sonnet = stats.byModel.find(m => m.model === 'claude-sonnet-4-6')
      expect(sonnet).toBeDefined()
      // claude_sessions: 5000+3000=8000 input, 2000+1000=3000 output
      // token_usage: 2000 input, 800 output
      expect(sonnet!.inputTokens).toBe(10000)
      expect(sonnet!.outputTokens).toBe(3800)

      const haiku = stats.byModel.find(m => m.model === 'claude-haiku-4-5')
      expect(haiku).toBeDefined()
      // claude_sessions: 1000 input, 500 output
      // token_usage: 500 input, 200 output
      expect(haiku!.inputTokens).toBe(1500)
      expect(haiku!.outputTokens).toBe(700)
    })

    it('produces timeline with merged date-bucketed data', () => {
      const stats = aggregateTokenStats(db, 'week', new Date('2026-03-10T00:00:00Z'))

      expect(stats.timeline.length).toBeGreaterThan(0)

      // Check Mar 9 has data from both sources
      const mar9 = stats.timeline.find(t => t.date === '2026-03-09')
      expect(mar9).toBeDefined()
      // claude_sessions on mar 9: sess-2 (3000i,1000o) + sess-3 (1000i,500o)
      // token_usage on mar 9: 2000i+800o + 500i+200o
      expect(mar9!.inputTokens).toBe(3000 + 1000 + 2000 + 500) // 6500
      expect(mar9!.outputTokens).toBe(1000 + 500 + 800 + 200) // 2500

      // Timeline should be sorted by date
      for (let i = 1; i < stats.timeline.length; i++) {
        expect(stats.timeline[i].date >= stats.timeline[i - 1].date).toBe(true)
      }
    })

    it('filters by "today" range correctly', () => {
      // "today" = last 24 hours from 2026-03-10T00:00:00Z means >= 2026-03-09T00:00:00Z
      const stats = aggregateTokenStats(db, 'today', new Date('2026-03-10T00:00:00Z'))

      // Claude sessions: sess-2 (last_message_at 2026-03-09T10:00:00Z), sess-3 (2026-03-09T15:00:00Z) - both in range
      // sess-1 (2026-03-08T12:00:00Z) - out of range
      // token_usage: mar9 entries in range, feb1 out
      // nanobot: stefany (last 2026-03-09T16:00:00Z) in range, cody (2026-03-09T18:00:00Z) in range
      expect(stats.summary.totalInputTokens).toBe(3000 + 1000 + 2000 + 500) // 6500
      expect(stats.summary.totalOutputTokens).toBe(1000 + 500 + 800 + 200)   // 2500
    })

    it('filters by "month" range correctly', () => {
      const stats = aggregateTokenStats(db, 'month', new Date('2026-03-10T00:00:00Z'))

      // Month = 30 days from 2026-03-10 = includes everything from Feb 8+
      // This catches all our recent data plus sess-old on Feb 1 is 37 days ago - EXCLUDED
      // BUT token_usage feb1 is also excluded
      expect(stats.summary.totalInputTokens).toBe(5000 + 3000 + 1000 + 2000 + 500) // 11500
      expect(stats.summary.totalOutputTokens).toBe(2000 + 1000 + 500 + 800 + 200)   // 4500
    })

    it('filters by "year" range includes old data', () => {
      const stats = aggregateTokenStats(db, 'year', new Date('2026-03-10T00:00:00Z'))

      // Year = 365 days - should include everything
      // claude_sessions input: 5000+3000+1000+10000 = 19000
      // token_usage input: 2000+500+8000 = 10500
      expect(stats.summary.totalInputTokens).toBe(19000 + 10500)
    })

    it('includes range in response', () => {
      const stats = aggregateTokenStats(db, 'week', new Date('2026-03-10T00:00:00Z'))
      expect(stats.range).toBe('week')
    })
  })

  describe('with empty tables', () => {
    it('returns zeroed stats', () => {
      const stats = aggregateTokenStats(db, 'week', new Date('2026-03-10T00:00:00Z'))

      expect(stats.summary.totalInputTokens).toBe(0)
      expect(stats.summary.totalOutputTokens).toBe(0)
      expect(stats.summary.totalSessions).toBe(0)
      expect(stats.summary.totalMessages).toBe(0)
      expect(stats.summary.mostActiveAgent).toBe('')
      expect(stats.summary.avgTokensPerSession).toBe(0)
      expect(stats.byAgent).toEqual([])
      expect(stats.byModel).toEqual([])
      expect(stats.timeline).toEqual([])
      expect(stats.range).toBe('week')
    })
  })

  describe('with only nanobot sessions (no token data)', () => {
    beforeEach(() => {
      seedNanobotSessions(db)
    })

    it('shows nanobot agents with zero tokens but message counts', () => {
      const stats = aggregateTokenStats(db, 'week', new Date('2026-03-10T00:00:00Z'))

      expect(stats.summary.totalInputTokens).toBe(0)
      expect(stats.summary.totalOutputTokens).toBe(0)
      expect(stats.summary.totalMessages).toBe(57)
      expect(stats.byAgent.length).toBe(2)
      expect(stats.byAgent.every(a => a.source === 'nanobot')).toBe(true)
      expect(stats.byAgent.every(a => a.inputTokens === 0 && a.outputTokens === 0)).toBe(true)
    })
  })
})
