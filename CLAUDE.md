# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Code Style

Use sparingly. Only comment complex code where the logic isn't self-evident.

## Project Overview

UIGen is an AI-powered React component generator. Users describe components in natural language via a chat interface; Claude generates and edits files in a virtual file system, which are then rendered live in a sandboxed iframe.

## Commands

Run all commands from the `uigen/` directory (the project root — `package.json` lives here).

```bash
npm run dev        # development server (Turbopack), http://localhost:3000
npm run dev:daemon # dev server in background, logs to logs.txt (use this for testing so the command doesn't block)
npm run build      # production build
npm run lint       # ESLint
npm test           # Vitest (all tests)

# Run a single test file
npx vitest run src/lib/__tests__/file-system.test.ts

# Database setup (first time)
npm run setup      # npm install + prisma generate + prisma migrate dev
npm run db:reset   # reset and re-run migrations
```

The app requires `ANTHROPIC_API_KEY` in `.env`. Without it, a `MockLanguageModel` is used automatically (useful for offline development).

Tests live in `__tests__/` folders next to the code they cover (e.g. `src/lib/__tests__/`, `src/components/chat/__tests__/`) and run in `jsdom` via Vitest. The `@/*` path alias maps to `src/*` (see `tsconfig.json`).

## Architecture

### Three-Panel UI
`src/app/main-content.tsx` renders the resizable layout:
- **Left (35%)**: Chat interface (`src/components/chat/`)
- **Right (65%)**: Toggled between live preview iframe (`src/components/preview/`) and Monaco editor + file tree (`src/components/editor/`)

### Data Flow
1. User message → `ChatContext` (`src/lib/contexts/chat-context.tsx`) via Vercel AI SDK's `useChat`
2. `POST /api/chat` (`src/app/api/chat/route.ts`) — streams Claude responses with tool use (up to 40 steps)
3. Claude calls `str_replace_editor` and `file_manager` tools to create/edit files in a `VirtualFileSystem` instance
4. File changes stream back and update `FileSystemContext` (`src/lib/contexts/file-system-context.tsx`)
5. Preview re-renders: Babel transforms JSX in-browser via `src/lib/transform/jsx-transformer.ts` and injects an import map into a sandboxed iframe

### Virtual File System
`src/lib/file-system.ts` — an in-memory tree (`Map<string, FileNode>`). Serializable to/from JSON for Prisma persistence and iframe injection. The two AI tools are:
- `str_replace_editor` (`src/lib/tools/str-replace.ts`): create, view, str_replace commands
- `file_manager` (`src/lib/tools/file-manager.ts`): rename, delete commands

### AI Provider
`src/lib/provider.ts` — returns `anthropic("claude-haiku-4-5")` when `ANTHROPIC_API_KEY` is set, or `MockLanguageModel` otherwise. The mock simulates multi-step tool use for development without API costs.

### Authentication
JWT sessions in HTTP-only cookies via `src/lib/auth.ts` (using `jose`), 7-day expiry, `auth-token` cookie. Server Actions in `src/actions/index.ts` handle `signUp`/`signIn`/`signOut`/`getUser` (bcrypt-hashed passwords). `middleware.ts` returns 401 for unauthenticated requests to `/api/projects` and `/api/filesystem` — note neither route currently exists under `src/app/api` (only `/api/chat` does), and `/[projectId]` page routes are not gated by middleware at all; access there relies on the page/Server Action logic (e.g. `getProject`). Projects are persisted to a Prisma database (messages + serialized file system) — `Project.userId` is optional, so anonymous projects can exist without a `User`. The generated Prisma client is checked into `src/generated/prisma` (custom `output` in `prisma/schema.prisma`) rather than `node_modules`.

Unauthenticated users can still generate components: work is kept in memory and mirrored to `sessionStorage` via `src/lib/anon-work-tracker.ts`. On sign-in/sign-up, `use-auth.ts` checks for this anonymous work and creates a real project from it so nothing is lost.

### Key Patterns
- **No actual filesystem**: all "files" live in `VirtualFileSystem` in memory
- **Ephemeral prompt caching**: system prompt sent with `cacheControl: { type: "ephemeral" }` to reduce token costs
- **Import map in iframe**: JSX transformer resolves `@/` aliases and React imports via a `<script type="importmap">` injected into the preview iframe
- **Context API only**: no Redux/Zustand — state flows through `ChatProvider` and `FileSystemProvider` wrapping the app

### Database schema
- The database schema is defined in the @prisma/schema.prisma file. Reference it anytime you need to understand the structure of data stored in the database.