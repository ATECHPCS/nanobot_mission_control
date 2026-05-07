# Kiosk Auth Routes Fix — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement.

**Goal:** Make the `/office/tv` kiosk actually receive data. Today the proxy bypasses the login redirect for the TV path and one API endpoint, but the API route handlers still gate on session/api-key auth — so they all 401, and the TV only displays the 3 hard-coded nanobot virtuals (Andy/Stefany/Cody). Wilson and any other DB agents are invisible.

**Architecture:** A trusted `x-mc-kiosk-auth: 1` header is injected by `proxy.ts` only after successfully validating the kiosk token against an allowlisted path. `getUserFromRequest` in `auth.ts` recognizes this header and returns a synthetic `viewer`-role kiosk user. The office panel forwards the kiosk token to all four endpoints it polls when in kiosk mode.

**Threat model notes:**
- The header is stripped from every incoming request unconditionally (so a client can't spoof it).
- The allowlist limits the kiosk's effective scope: `/office/tv`, `/api/agents/activity`, `/api/agents`, `/api/sessions`, `/api/nanobot/status`. Adding new endpoints to this list is a deliberate decision.
- The synthetic user has role=`viewer` (no admin/operator powers) and a sentinel `id: -1`, `username: 'kiosk'` so audit trails don't conflate it with a real user.

**Tech stack:** TypeScript, Next.js middleware, Vitest. No new deps.

---

## File map

### Modified
- `src/proxy.ts` — strip `x-mc-kiosk-auth` from every request; expand kiosk path allowlist; inject the header on validated kiosk requests.
- `src/lib/auth.ts` — `getUserFromRequest` returns a synthetic kiosk user when the trusted header is set.
- `src/components/panels/office-panel.tsx` — forward the kiosk token to `/api/agents`, `/api/sessions`, `/api/nanobot/status` in addition to the existing `/api/agents/activity`.

### Test additions
- `src/lib/__tests__/auth-kiosk.test.ts` — new file, asserts the kiosk header → synthetic viewer user contract.

---

## Task 1: Recognize kiosk header in auth.ts (TDD)

**Files:**
- Create: `src/lib/__tests__/auth-kiosk.test.ts`
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Write failing test**

```ts
// src/lib/__tests__/auth-kiosk.test.ts
import { describe, it, expect } from 'vitest'
import { getUserFromRequest } from '../auth'

function makeReq(headers: Record<string, string> = {}, urlPath = '/api/agents'): Request {
  return new Request(`http://localhost${urlPath}`, { headers })
}

describe('getUserFromRequest — kiosk header', () => {
  it('returns null when no auth signals are present', () => {
    expect(getUserFromRequest(makeReq())).toBeNull()
  })

  it('returns a synthetic viewer user when x-mc-kiosk-auth: 1 is present', () => {
    const user = getUserFromRequest(makeReq({ 'x-mc-kiosk-auth': '1' }))
    expect(user).not.toBeNull()
    expect(user!.role).toBe('viewer')
    expect(user!.username).toBe('kiosk')
    expect(user!.id).toBe(-1)
  })

  it('ignores any value other than exactly "1"', () => {
    expect(getUserFromRequest(makeReq({ 'x-mc-kiosk-auth': 'true' }))).toBeNull()
    expect(getUserFromRequest(makeReq({ 'x-mc-kiosk-auth': '' }))).toBeNull()
    expect(getUserFromRequest(makeReq({ 'x-mc-kiosk-auth': '0' }))).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

`pnpm vitest run src/lib/__tests__/auth-kiosk.test.ts` — expect 2 of 3 to fail (first one passes since current behavior returns null).

- [ ] **Step 3: Implement in auth.ts**

In `src/lib/auth.ts` `getUserFromRequest`, after the session-cookie check and after the API-key checks, but BEFORE the function returns null, insert the kiosk recognition. Add it as the LAST auth path so explicit credentials always win:

```ts
  // Kiosk display: trusted header injected by proxy.ts when MC_OFFICE_TV_TOKEN
  // matched on an allowlisted path. The header is stripped unconditionally
  // from incoming requests by the proxy, so reaching this branch means the
  // proxy has already validated the kiosk token.
  const kioskAuth = request.headers.get('x-mc-kiosk-auth')
  if (kioskAuth === '1') {
    return {
      id: -1,
      username: 'kiosk',
      display_name: 'Kiosk Display',
      role: 'viewer',
      workspace_id: getDefaultWorkspaceContext().workspaceId,
      tenant_id: getDefaultWorkspaceContext().tenantId,
      created_at: 0,
      updated_at: 0,
      last_login_at: null,
      agent_name: agentName,
    }
  }
```

Place it just before the existing `return null` at the end of `getUserFromRequest`. Use the same `getDefaultWorkspaceContext()` helper that the API-key branch already uses (line ~353).

- [ ] **Step 4: Run tests**

`pnpm vitest run src/lib/__tests__/auth-kiosk.test.ts` — all 3 tests pass.
`pnpm vitest run --reporter=dot 2>&1 | tail -3` — full suite still green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/lib/__tests__/auth-kiosk.test.ts
git commit -m "feat(auth): recognize x-mc-kiosk-auth header as synthetic viewer"
```

---

## Task 2: Strip + inject kiosk header in proxy.ts; expand allowlist

**Files:** Modify `src/proxy.ts`

- [ ] **Step 1: Strip incoming `x-mc-kiosk-auth` unconditionally**

Find the start of the `middleware` function in `src/proxy.ts`. Right after the host-allowlist checks (just before the kiosk block that already exists), add a header strip that runs on every request:

```ts
  // Strip any client-supplied kiosk auth header — only proxy.ts is allowed to set it.
  const incomingHeaders = new Headers(request.headers)
  incomingHeaders.delete('x-mc-kiosk-auth')
```

- [ ] **Step 2: Expand the kiosk allowlist and inject the header**

Replace the existing kiosk block with the expanded version:

```ts
  // Kiosk: allow allowlisted office paths with valid ?token= to bypass session auth.
  // Token is read from MC_OFFICE_TV_TOKEN. Compared with constant-time equality.
  const KIOSK_TOKEN = process.env.MC_OFFICE_TV_TOKEN
  if (KIOSK_TOKEN && KIOSK_TOKEN.length > 0) {
    const isKioskPath =
      pathname === '/office/tv' ||
      pathname === '/api/agents/activity' ||
      pathname === '/api/agents' ||
      pathname === '/api/sessions' ||
      pathname === '/api/nanobot/status'
    if (isKioskPath) {
      const provided = request.nextUrl.searchParams.get('token') || ''
      if (provided.length === KIOSK_TOKEN.length && safeCompare(provided, KIOSK_TOKEN)) {
        incomingHeaders.set('x-mc-kiosk-auth', '1')
        return NextResponse.next({ request: { headers: incomingHeaders } })
      }
    }
  } else if (pathname === '/office/tv') {
    return new NextResponse('Not Found', { status: 404 })
  }
```

- [ ] **Step 3: Forward stripped headers on the non-kiosk path**

The existing code calls `NextResponse.next()` further down. To make sure the header strip applies even when the kiosk path doesn't match (e.g., a regular API call that someone tried to spoof the header on), every later return that uses `NextResponse.next()` should pass `{ request: { headers: incomingHeaders } }`.

Find each `return NextResponse.next()` in `proxy.ts` and replace with `return NextResponse.next({ request: { headers: incomingHeaders } })`.

(There may be 2-4 such returns. Check each carefully and update all of them.)

- [ ] **Step 4: Verify**

- `pnpm typecheck` — must pass.
- `pnpm lint` — must pass (no new warnings).
- `pnpm vitest run --reporter=dot 2>&1 | tail -3` — full unit suite green.

- [ ] **Step 5: Commit**

```bash
git add src/proxy.ts
git commit -m "feat(proxy): strip+inject kiosk auth header, expand path allowlist"
```

---

## Task 3: Forward kiosk token from the panel to all polled endpoints

**Files:** Modify `src/components/panels/office-panel.tsx`

- [ ] **Step 1: Build a kiosk token query helper**

In `OfficePanel`, just below where `searchParams` and `kiosk` are derived, add:

```tsx
const kioskTokenQuery = kiosk
  ? `?token=${encodeURIComponent(searchParams?.get('token') || '')}`
  : ''
```

- [ ] **Step 2: Use the helper in fetchAgents**

Find the existing `fetchAgents` callback. Update the three fetch calls to append `kioskTokenQuery`:

```tsx
const [agentRes, sessionRes, nanobotRes] = await Promise.all([
  fetch(`/api/agents${kioskTokenQuery}`),
  isLocalMode ? fetch(`/api/sessions${kioskTokenQuery}`) : Promise.resolve(null),
  isLocalMode ? fetch(`/api/nanobot/status${kioskTokenQuery}`) : Promise.resolve(null),
])
```

Add `kioskTokenQuery` to the `useCallback` dependency array:

```tsx
}, [isLocalMode, setLocalAgents, setSessionAgents, setNanobotStatusObj, setOfficeDataFetched, kioskTokenQuery])
```

- [ ] **Step 3: Use the helper in fetchActivities**

Find the existing `fetchActivities` callback. Replace the inline token-query construction with `kioskTokenQuery`:

```tsx
const fetchActivities = useCallback(async () => {
  try {
    const res = await fetch(`/api/agents/activity${kioskTokenQuery}`)
    if (!res.ok) return
    const json = await res.json()
    if (!Array.isArray(json?.agents)) return
    const map: Record<string, ActivityState> = {}
    for (const row of json.agents) {
      if (row?.name && row?.activity) map[row.name] = row.activity
    }
    setOfficeActivities(map)
  } catch { /* ignore — fall back to status */ }
}, [setOfficeActivities, kioskTokenQuery])
```

(Replace the existing `tokenParam` construction inside the function — remove it.)

- [ ] **Step 4: Verify**

- `pnpm typecheck && pnpm lint && pnpm vitest run --reporter=dot 2>&1 | tail -3` — all green.

- [ ] **Step 5: Commit**

```bash
git add src/components/panels/office-panel.tsx
git commit -m "fix(office): forward kiosk token to agent and session endpoints"
```

---

## Task 4: End-to-end smoke check

- [ ] **Step 1: Local smoke**

In a separate terminal, with `MC_OFFICE_TV_TOKEN=test-kiosk-token` exported in the env:

```bash
cd /home/dev/projects/nanobot_mission_control/.worktrees/kiosk-auth-fix
MC_OFFICE_TV_TOKEN=test-kiosk-token pnpm dev
```

Then in another terminal:

```bash
TOKEN=test-kiosk-token
curl -fsS -o /dev/null -w '/api/agents → %{http_code}\n' "http://127.0.0.1:3000/api/agents?token=${TOKEN}"
curl -fsS -o /dev/null -w '/api/agents/activity → %{http_code}\n' "http://127.0.0.1:3000/api/agents/activity?token=${TOKEN}"
curl -fsS -o /dev/null -w '/api/sessions → %{http_code}\n' "http://127.0.0.1:3000/api/sessions?token=${TOKEN}"
curl -fsS -o /dev/null -w '/api/nanobot/status → %{http_code}\n' "http://127.0.0.1:3000/api/nanobot/status?token=${TOKEN}"
# Spoof check — should still 401:
curl -fsS -o /dev/null -w '/api/audit (spoofed header) → %{http_code}\n' -H 'x-mc-kiosk-auth: 1' "http://127.0.0.1:3000/api/audit"
```

Expected: the four allowlisted endpoints return 200; `/api/audit` returns 401 (spoof header is stripped).

- [ ] **Step 2: Verify spec coverage**

- All four office-needed endpoints responsive in kiosk mode ✓
- Header-strip prevents spoofing ✓
- Synthetic kiosk user has viewer role ✓

- [ ] **Step 3: No commit needed for the smoke check.** If anything fails, return to the relevant task.
