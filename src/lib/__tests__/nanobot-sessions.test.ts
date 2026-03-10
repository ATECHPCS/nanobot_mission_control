import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'path'
import {
  parseSessionFilename,
  parseMetadataKey,
} from '@/types/nanobot-session'

// These will be imported from the implementation module once created
import {
  scanAgentSessions,
  readSessionContent,
  readSessionContentStream,
} from '@/lib/nanobot-sessions'

const FIXTURES_DIR = path.join(__dirname, '..', '..', 'test', 'fixtures')

// ---------------------------------------------------------------------------
// parseSessionFilename
// ---------------------------------------------------------------------------

describe('parseSessionFilename', () => {
  it('parses telegram session filename', () => {
    const result = parseSessionFilename('telegram_6432548537.jsonl')
    expect(result).toEqual({ channel: 'telegram', identifier: '6432548537' })
  })

  it('parses cron session filename with dashes', () => {
    const result = parseSessionFilename('cron_daily-financial-summary.jsonl')
    expect(result).toEqual({ channel: 'cron', identifier: 'daily-financial-summary' })
  })

  it('returns unknown channel for filename without underscore', () => {
    const result = parseSessionFilename('orphan.jsonl')
    expect(result).toEqual({ channel: 'unknown', identifier: 'orphan' })
  })

  it('handles paperclip session with nested underscore', () => {
    const result = parseSessionFilename('paperclip_paperclip_test-001.jsonl')
    expect(result).toEqual({ channel: 'paperclip', identifier: 'paperclip_test-001' })
  })
})

// ---------------------------------------------------------------------------
// parseMetadataKey
// ---------------------------------------------------------------------------

describe('parseMetadataKey', () => {
  it('parses telegram metadata key', () => {
    const result = parseMetadataKey('telegram:6432548537')
    expect(result).toEqual({ channel: 'telegram', identifier: '6432548537' })
  })

  it('parses cron metadata key', () => {
    const result = parseMetadataKey('cron:daily-financial-summary')
    expect(result).toEqual({ channel: 'cron', identifier: 'daily-financial-summary' })
  })

  it('returns unknown channel for key without colon', () => {
    const result = parseMetadataKey('orphan-key')
    expect(result).toEqual({ channel: 'unknown', identifier: 'orphan-key' })
  })
})

// ---------------------------------------------------------------------------
// scanAgentSessions
// ---------------------------------------------------------------------------

describe('scanAgentSessions', () => {
  it('scans fixture directory and returns session metadata', () => {
    const sessions = scanAgentSessions('stefany', FIXTURES_DIR)
    expect(sessions.length).toBeGreaterThanOrEqual(1)

    // Find the telegram session
    const telegramSession = sessions.find(s => s.filename === 'sample-session.jsonl')
    expect(telegramSession).toBeDefined()
    expect(telegramSession!.agentId).toBe('stefany')
    expect(telegramSession!.channelType).toBe('telegram')
    expect(telegramSession!.channelIdentifier).toBe('6432548537')
    expect(telegramSession!.sessionKey).toBe('telegram:6432548537')
  })

  it('counts only non-metadata messages', () => {
    const sessions = scanAgentSessions('stefany', FIXTURES_DIR)
    const telegramSession = sessions.find(s => s.filename === 'sample-session.jsonl')
    // 5 messages: 2 user + 2 assistant + 1 tool (metadata line skipped)
    expect(telegramSession!.messageCount).toBe(5)
  })

  it('extracts first and last message timestamps', () => {
    const sessions = scanAgentSessions('stefany', FIXTURES_DIR)
    const telegramSession = sessions.find(s => s.filename === 'sample-session.jsonl')
    expect(telegramSession!.firstMessageAt).toBe('2026-03-09T14:00:00.000Z')
    expect(telegramSession!.lastMessageAt).toBe('2026-03-09T15:30:00.000Z')
  })

  it('extracts last user message snippet (max 60 chars)', () => {
    const sessions = scanAgentSessions('stefany', FIXTURES_DIR)
    const telegramSession = sessions.find(s => s.filename === 'sample-session.jsonl')
    expect(telegramSession!.lastUserMessage).toBe('Thanks! Can you also send the daily summary to the group?')
    expect(telegramSession!.lastUserMessage!.length).toBeLessThanOrEqual(60)
  })

  it('returns empty array for non-existent directory', () => {
    const sessions = scanAgentSessions('ghost', '/nonexistent/path')
    expect(sessions).toEqual([])
  })

  it('includes file size in bytes', () => {
    const sessions = scanAgentSessions('stefany', FIXTURES_DIR)
    const telegramSession = sessions.find(s => s.filename === 'sample-session.jsonl')
    expect(telegramSession!.fileSizeBytes).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// readSessionContent
// ---------------------------------------------------------------------------

describe('readSessionContent', () => {
  it('returns messages without the metadata line', () => {
    const filePath = path.join(FIXTURES_DIR, 'sample-session.jsonl')
    const result = readSessionContent(filePath)
    // Should not include the metadata line
    expect(result.messages.every(m => (m as any)._type !== 'metadata')).toBe(true)
    expect(result.messages.length).toBe(5)
  })

  it('returns correct message roles', () => {
    const filePath = path.join(FIXTURES_DIR, 'sample-session.jsonl')
    const result = readSessionContent(filePath)
    const roles = result.messages.map(m => m.role)
    expect(roles).toEqual(['user', 'assistant', 'tool', 'assistant', 'user'])
  })

  it('includes tool_calls on assistant messages', () => {
    const filePath = path.join(FIXTURES_DIR, 'sample-session.jsonl')
    const result = readSessionContent(filePath)
    const assistantWithTools = result.messages.find(
      m => m.role === 'assistant' && m.tool_calls
    )
    expect(assistantWithTools).toBeDefined()
    expect(assistantWithTools!.tool_calls![0].function.name).toBe('get_balance')
  })

  it('includes tool_call_id and name on tool messages', () => {
    const filePath = path.join(FIXTURES_DIR, 'sample-session.jsonl')
    const result = readSessionContent(filePath)
    const toolMsg = result.messages.find(m => m.role === 'tool')
    expect(toolMsg).toBeDefined()
    expect(toolMsg!.tool_call_id).toBe('tc_001')
    expect(toolMsg!.name).toBe('get_balance')
  })

  it('returns total count and hasMore flag', () => {
    const filePath = path.join(FIXTURES_DIR, 'sample-session.jsonl')
    const result = readSessionContent(filePath)
    expect(result.total).toBe(5)
    expect(result.hasMore).toBe(false)
  })

  it('supports offset/limit pagination', () => {
    const filePath = path.join(FIXTURES_DIR, 'sample-session.jsonl')
    const result = readSessionContent(filePath, 2, 2)
    expect(result.messages.length).toBe(2)
    // offset=2 means skip first 2 messages (user, assistant), get tool + assistant
    expect(result.messages[0].role).toBe('tool')
    expect(result.messages[1].role).toBe('assistant')
    expect(result.total).toBe(5)
    expect(result.hasMore).toBe(true) // there's 1 more after these 2
  })
})

// ---------------------------------------------------------------------------
// readSessionContentStream
// ---------------------------------------------------------------------------

describe('readSessionContentStream', () => {
  it('reads session content via streaming', async () => {
    const filePath = path.join(FIXTURES_DIR, 'sample-session-large.jsonl')
    const result = await readSessionContentStream(filePath)
    // 20 messages (metadata line excluded)
    expect(result.messages.length).toBe(20)
    expect(result.messages.every(m => (m as any)._type !== 'metadata')).toBe(true)
  })

  it('supports pagination with offset and limit', async () => {
    const filePath = path.join(FIXTURES_DIR, 'sample-session-large.jsonl')
    const result = await readSessionContentStream(filePath, 0, 5)
    expect(result.messages.length).toBe(5)
    expect(result.total).toBe(20)
    expect(result.hasMore).toBe(true)
  })

  it('returns correct hasMore when at end', async () => {
    const filePath = path.join(FIXTURES_DIR, 'sample-session-large.jsonl')
    const result = await readSessionContentStream(filePath, 15, 10)
    expect(result.messages.length).toBe(5) // only 5 remaining
    expect(result.hasMore).toBe(false)
  })
})
