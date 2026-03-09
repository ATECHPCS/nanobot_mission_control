---
phase: 01-foundation-strip
plan: 01b
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/config.ts
  - src/lib/super-admin.ts
  - src/app/api/integrations/route.ts
  - src/app/api/agents/route.ts
  - src/app/api/cron/route.ts
  - src/app/api/chat/messages/route.ts
  - src/components/panels/agent-detail-tabs.tsx
  - .env.example
  - docker-compose.yml
  - Dockerfile
autonomous: true
requirements: [FOUN-04, FOUN-05, FOUN-06, FOUN-07]

must_haves:
  truths:
    - "Zero OpenClaw/OPENCLAW/openclaw/OC_ references remain in src/ directory"
    - "Zero OPENCLAW_* or OC_* environment variable references remain in config files"
    - "Environment variables use NANOBOT_* namespace"
    - "pnpm build completes with zero errors"
  artifacts:
    - path: "src/lib/config.ts"
      provides: "Core config with NANOBOT_* env vars, zero OC references"
      contains: "NANOBOT_HOME"
    - path: ".env.example"
      provides: "Example env with NANOBOT_* variable names"
      contains: "NANOBOT_"
  key_links:
    - from: "src/lib/config.ts"
      to: ".env.example"
      via: "process.env.NANOBOT_* reads matching .env.example keys"
---

<objective>
Strip OpenClaw references from mixed files (files that contain both OC code and core logic) and rename all environment variables to NANOBOT_* namespace.

Purpose: Complete the OC reference elimination in files that cannot be simply deleted. This is the surgical editing half of the strip.
Output: Mixed files cleaned of all OC references, env vars renamed to NANOBOT_*.
</objective>

<execution_context>
@/Users/designmac/.claude/get-shit-done/workflows/execute-plan.md
@/Users/designmac/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/ROADMAP.md
@.planning/STATE.md
@.planning/phases/01-foundation-strip/01-CONTEXT.md
@.planning/phases/01-foundation-strip/01-RESEARCH.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Strip OpenClaw references from mixed TypeScript files</name>
  <files>
    src/lib/config.ts
    src/lib/super-admin.ts
    src/app/api/integrations/route.ts
    src/app/api/agents/route.ts
    src/app/api/cron/route.ts
    src/app/api/chat/messages/route.ts
    src/components/panels/agent-detail-tabs.tsx
  </files>
  <action>
Strip OpenClaw references from these high-reference mixed files (in priority order):

1. src/lib/config.ts (36 refs): Remove all OPENCLAW_* env var reads. Replace with NANOBOT_* namespace:
   - OPENCLAW_HOME -> NANOBOT_HOME (default: ~/.nanobot)
   - OPENCLAW_STATE_DIR -> NANOBOT_STATE_DIR
   - DELETE entirely: OPENCLAW_GATEWAY_HOST, OPENCLAW_GATEWAY_PORT, NEXT_PUBLIC_GATEWAY_HOST, NEXT_PUBLIC_GATEWAY_PORT (no gateway equivalent yet)
   - Keep MC_* vars as-is (they are Mission Control config, not OC-specific)
   - Remove any OC-specific config sections (gateway config, device identity config)

2. src/lib/super-admin.ts (39 refs): Remove OC provisioning commands (openclaw CLI calls, OC tenant setup). Keep core tenant management logic and role-based admin functions.

3. src/app/api/integrations/route.ts (20 refs): Remove OC environment variable management endpoints. Keep core integration management if any exists.

4. src/app/api/agents/route.ts (17 refs): Remove OC agent sync logic. Keep agent CRUD operations. Agent data will come from filesystem discovery in Phase 2; for now, keep the DB-backed CRUD as a skeleton.

5. src/app/api/cron/route.ts (15 refs): Remove `openclaw cron trigger` command execution. Keep cron infrastructure if it has non-OC uses.

6. src/app/api/chat/messages/route.ts (14 refs): Remove OC gateway chat routing. Keep message storage/retrieval if applicable.

7. src/components/panels/agent-detail-tabs.tsx (12 refs): Remove OC-specific agent fields (device ID, gateway status, OC config). Keep the tab structure for reuse with nanobot agent details in Phase 2.

For each file, search for patterns: openclaw, OpenClaw, OPENCLAW, oc_, OC_ and remove or replace every match.

Run `pnpm build` after all changes to verify compilation.
  </action>
  <verify>
    <automated>cd /Users/designmac/projects/nanobot_mission_control && pnpm build && echo "---BUILD OK---" && grep -r "openclaw\|OpenClaw\|OPENCLAW\|OC_" src/ --include="*.ts" --include="*.tsx" -l; echo "EXIT:$?"</automated>
  </verify>
  <done>All 7 mixed files stripped of OpenClaw references. pnpm build succeeds.</done>
</task>

<task type="auto">
  <name>Task 2: Rename environment variables to NANOBOT_* in config files</name>
  <files>
    .env.example
    docker-compose.yml
    Dockerfile
  </files>
  <action>
Rename env vars in non-TypeScript config files:
- .env.example: Rename OPENCLAW_* to NANOBOT_*, delete gateway vars, add comments explaining each var
- docker-compose.yml: Update any OPENCLAW_* references to NANOBOT_*
- Dockerfile: Update any OPENCLAW_* references to NANOBOT_*
- .env.test: If exists, update similarly

After all changes, run comprehensive grep to verify zero OC references remain in config files:
`grep -r "OPENCLAW_\|OC_" .env* docker-compose.yml Dockerfile`
Must return zero results.
  </action>
  <verify>
    <automated>cd /Users/designmac/projects/nanobot_mission_control && grep -r "OPENCLAW_\|OC_" .env* docker-compose.yml Dockerfile 2>/dev/null; test $? -eq 1 && echo "CLEAN_OK" || echo "STILL_HAS_REFS"</automated>
  </verify>
  <done>Env vars renamed to NANOBOT_* in .env.example, docker-compose.yml, Dockerfile. Grep confirms zero OPENCLAW_*/OC_* references in config files.</done>
</task>

</tasks>

<verification>
1. `pnpm build` succeeds
2. `grep -r "openclaw\|OpenClaw\|OPENCLAW\|OC_" src/ --include="*.ts" --include="*.tsx" -l` returns zero results
3. `grep -r "OPENCLAW_\|OC_" .env* docker-compose.yml Dockerfile` returns zero results
</verification>

<success_criteria>
- Zero OpenClaw/OC_ references in src/ directory
- Zero OPENCLAW_*/OC_* env var references in config files
- NANOBOT_* namespace in use
- pnpm build succeeds
</success_criteria>

<output>
After completion, create `.planning/phases/01-foundation-strip/01-01b-SUMMARY.md`
</output>
