# Technology Stack

**Analysis Date:** 2026-03-09

## Languages

**Primary:**
- TypeScript 5.7+ - All application code (frontend + backend)
- SQL - Database schema and migrations (`src/lib/schema.sql`, `src/lib/migrations.ts`)

**Secondary:**
- JavaScript - Config files (`next.config.js`, `tailwind.config.js`, `postcss.config.js`)
- Bash - Ops scripts (`scripts/agent-heartbeat.sh`, `scripts/notification-daemon.sh`)

## Runtime

**Environment:**
- Node.js >= 20 (enforced via `engines` in `package.json`)
- Dockerfile uses `node:20-slim` base image

**Package Manager:**
- pnpm (latest, activated via corepack in Docker)
- Lockfile: `pnpm-lock.yaml` present
- `pnpm.onlyBuiltDependencies: ["better-sqlite3"]` configured for native addon

## Frameworks

**Core:**
- Next.js 16.1.6 - Full-stack React framework (App Router)
  - Config: `next.config.js`
  - Standalone output mode for Docker deployment
  - Turbopack enabled for dev
  - Transpile packages: `react-markdown`, `remark-gfm`
  - Security headers configured (CSP, HSTS optional)
- React 19.0.1 - UI library
- React DOM 19.0.1

**Testing:**
- Vitest 2.1.5 - Unit/integration testing
  - Config: `vitest.config.ts`
  - Environment: jsdom
  - Setup: `src/test/setup.ts`
  - Coverage provider: v8 (thresholds: 60% lines/functions/branches/statements)
- Playwright 1.51.0 - E2E testing
  - Config: `playwright.config.ts` (general), `playwright.openclaw.local.config.ts`, `playwright.openclaw.gateway.config.ts`
  - Browser: Chromium only
  - Test dir: `tests/`
- Testing Library (React 16.1.0, DOM 10.4.0, jest-dom 6.6.3)

**Build/Dev:**
- TypeScript 5.7.2 - Type checking (`tsconfig.json`, strict mode)
- ESLint 9.18.0 - Linting (`eslint.config.mjs`, extends `eslint-config-next`)
- Tailwind CSS 3.4.17 - Utility-first CSS (`tailwind.config.js`)
- PostCSS 8.5.2 + Autoprefixer 10.4.20 - CSS processing (`postcss.config.js`)
- Vite (via `@vitejs/plugin-react` 4.3.4) - Test bundling only (not build)

## Key Dependencies

**Critical:**
- `next` ^16.1.6 - Application framework (App Router, API routes, SSR)
- `react` ^19.0.1 - UI rendering
- `better-sqlite3` ^12.6.2 - Embedded database (native addon, requires build tools)
- `zustand` ^5.0.11 - Client-side state management (`src/store/index.ts`)
- `zod` ^4.3.6 - Runtime schema validation (`src/lib/validation.ts`)
- `ws` ^8.19.0 - WebSocket client type definitions (actual WS uses browser API)

**UI Libraries:**
- `@xyflow/react` ^12.10.0 - Node-based flow diagrams (agent workflows)
- `reactflow` ^11.11.4 - Legacy flow diagram support
- `recharts` ^3.7.0 - Charts and data visualization
- `react-markdown` ^10.1.0 + `remark-gfm` ^4.0.1 - Markdown rendering
- `next-themes` ^0.4.6 - Dark/light mode theming
- `clsx` ^2.1.1 - Conditional classnames
- `tailwind-merge` ^3.4.0 - Tailwind class deduplication
- `@scalar/api-reference-react` ^0.8.66 - OpenAPI documentation UI

**Infrastructure:**
- `pino` ^10.3.1 - Structured JSON logging (server-side, `src/lib/logger.ts`)
- `pino-pretty` ^13.1.3 - Dev-only log formatting

## TypeScript Configuration

**Compiler Options (`tsconfig.json`):**
- Target: ES2017
- Module: ESNext, moduleResolution: bundler
- Strict mode enabled
- JSX: react-jsx
- Incremental compilation
- Path alias: `@/*` maps to `./src/*`

## Configuration

**Environment:**
- `.env.example` documents all available env vars (107 lines)
- `.env.test` exists for test environment
- `.env` optional (loaded via `docker-compose.yml` env_file with `required: false`)
- Key env vars:
  - `AUTH_USER` / `AUTH_PASS` / `AUTH_PASS_B64` - Admin seed credentials
  - `API_KEY` - System API key for headless access
  - `GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_CLIENT_ID` - Google OAuth
  - `OPENCLAW_HOME` / `OPENCLAW_STATE_DIR` - OpenClaw integration paths
  - `OPENCLAW_GATEWAY_HOST` / `OPENCLAW_GATEWAY_PORT` - Gateway connection
  - `GITHUB_TOKEN` - GitHub API integration
  - `MC_PROVISIONER_SOCKET` / `MC_PROVISIONER_TOKEN` - Provisioner daemon
  - `MC_ALLOWED_HOSTS` / `MC_ALLOW_ANY_HOST` - Network ACL
  - `MC_RETAIN_*_DAYS` - Data retention policies
  - `NEXT_PUBLIC_GATEWAY_*` - Browser-side gateway config

**Build:**
- `next.config.js` - Next.js configuration (standalone output, CSP headers)
- `tsconfig.json` - TypeScript compiler options
- `tailwind.config.js` - Tailwind CSS theme (HSL CSS variable design tokens)
- `vitest.config.ts` - Test runner configuration
- `eslint.config.mjs` - Linting rules (flat config format)

## Platform Requirements

**Development:**
- Node.js >= 20
- pnpm (corepack)
- Python3 + make + g++ (for better-sqlite3 native compilation)

**Production:**
- Docker (multi-stage Dockerfile, `node:20-slim`)
- Single-container deployment with persistent volume at `/app/.data` for SQLite
- Standalone Next.js server (`node server.js`)
- Health check: `curl -f http://localhost:${PORT}/login`
- Non-root user: `nextjs:nodejs` (UID/GID 1001)

**Docker Compose:**
- `docker-compose.yml` - Single service, one named volume (`mc-data`)
- Port mapping: `${MC_PORT:-3000}:${PORT:-3000}`

---

*Stack analysis: 2026-03-09*
