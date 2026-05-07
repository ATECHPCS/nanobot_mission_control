// src/lib/office-deadpan.ts
import type { ActivityKind } from './agent-activity'

export const DEADPAN_LINES: Record<ActivityKind, string[]> = {
  typing:    ['Editing {subject}.', 'Writing things.', "It compiles. That's something.", 'Adding a TODO.', 'Probably a bug.'],
  reading:   ['Reading {subject}.', 'This file again.', 'Skimming. Convincingly.', 'Pretending {subject} makes sense.'],
  searching: ['Looking for {subject}.', 'Grep harder.', 'It must be somewhere.'],
  bash:      ['$ {subject}', 'Hoping for green.', 'There is no rollback plan.', 'Will it work this time?'],
  'on-call': ['Talking to {subject}.', '{subject} has a question.', 'Mostly listening.'],
  'in-meeting': ['Meeting.', 'Aligning on alignment.', 'We could just code this.'],
  thinking:  ['Thinking.', 'There are several wrong answers.', '...', 'Considering options.'],
  blocked:   ['Awaiting review.', 'Sent a polite ping.', 'Stuck.'],
  idle:      ['Coffee.', 'Not currently helpful.', 'Existential break.'],
  error:     ['Apologies.', 'As foretold.', 'I have failed.'],
}

/**
 * Per-nanobot personality lines. When an agent name matches one of these keys,
 * the picker prefers the agent's lines for that kind. Falls back to DEADPAN_LINES
 * if the agent doesn't have lines for the requested kind.
 */
export const NANOBOT_LINES: Record<string, Partial<Record<ActivityKind, string[]>>> = {
  Stefany: {
    typing:   ['Editing the books.', 'Reconciling Q3.', 'Adjusting accruals.', 'Receipts. So many receipts.'],
    reading:  ['Triple-checking the ledger.', 'Reviewing the GL.', 'This invoice. Again.', 'Auditing.'],
    bash:     ['$ {subject}', 'Running close.', 'Will the trial balance balance?'],
    thinking: ['Mentally allocating.', 'There is always a Q4 question.', 'Categorizing.', 'Hmm.'],
    idle:     ['Tea break.', 'Color-coded inbox zero.', 'Filing complete.'],
    'on-call':['Auditor on the line.', 'Talking to {subject}.'],
    blocked:  ['Awaiting clarification on cost basis.', 'Pinged the CFO.'],
  },
  Cody: {
    typing:   ['Refactoring something that worked.', 'Editing {subject}.', 'Adding a TODO.', 'It compiles.'],
    reading:  ['Reading the diff.', 'This file. Again.', 'Skimming {subject}.'],
    bash:     ['$ {subject}', 'pnpm test --watch.', 'Hoping for green.', 'There is no rollback plan.'],
    thinking: ['Stack overflow tab open.', 'There are several wrong answers.', 'Considering options.'],
    idle:     ['Coffee.', 'Reviewing PRs in head.', 'Existential pair programming.'],
    'on-call':['On a call with {subject}.', 'Mostly listening.'],
    blocked:  ['Awaiting review.', 'Unblocking PR.'],
  },
  Andy: {
    typing:   ['Updating the roadmap.', 'Drafting the standup.', 'Editing {subject}.', 'Status doc revisions.'],
    reading:  ['Reading Q4 plans.', 'Roadmap revisions.', 'Reviewing the standup.'],
    bash:     ['$ {subject}', 'Just running scripts.'],
    thinking: ['Calendar full of nothing.', 'Considering the strategy.', 'Operations are hard.', 'Planning the planning.'],
    idle:     ['Coffee.', 'Reading.', 'Catching up on Slack.', 'Walking around purposefully.'],
    'on-call':['Standup with {subject}.', '1:1 with {subject}.'],
    blocked:  ['Awaiting input from leadership.'],
  },
}

const MAX_SUBJECT_LEN = 40

/**
 * Picks a random line for the activity kind.
 * - When `agentName` matches a known nanobot, prefers their personality lines.
 * - Templates containing {subject} are excluded if `subject` is undefined.
 * - Subject is truncated to 40 chars before substitution.
 * - If the same line was just used (`lastLine`), retries up to a few times.
 */
export function pickDeadpanLine(
  kind: ActivityKind,
  subject: string | undefined,
  lastLine: string | null,
  agentName?: string,
): string {
  const perAgent = agentName ? NANOBOT_LINES[agentName]?.[kind] : undefined
  const all = perAgent ?? DEADPAN_LINES[kind] ?? []
  const eligible = subject
    ? all
    : all.filter(t => !t.includes('{subject}'))
  const pool = eligible.length > 0 ? eligible : all

  if (pool.length === 0) return ''

  let template: string = pool[0]
  for (let attempt = 0; attempt < 4; attempt++) {
    template = pool[Math.floor(Math.random() * pool.length)]
    if (pool.length < 2) break
    const trimmed = subject ? template.replace('{subject}', '<S>') : template
    if (trimmed !== lastLine) break
  }

  const safeSubject = subject ? subject.slice(0, MAX_SUBJECT_LEN) : ''
  return template.replace('{subject}', safeSubject)
}
