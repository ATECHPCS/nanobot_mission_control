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

const MAX_SUBJECT_LEN = 40

/**
 * Picks a random line for the activity kind.
 * - Templates containing {subject} are excluded if `subject` is undefined.
 * - Subject is truncated to 40 chars before substitution.
 * - If the same line was just used (`lastLine`), retries up to a few times.
 */
export function pickDeadpanLine(
  kind: ActivityKind,
  subject: string | undefined,
  lastLine: string | null,
): string {
  const all = DEADPAN_LINES[kind] || []
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
