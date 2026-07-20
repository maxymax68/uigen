---
name: run-uigen
description: Build, run, and drive the uigen app (AI React component generator). Use when asked to start uigen, run its dev server, take a screenshot of its UI, or interact with the chat/preview flow.
---

uigen is a Next.js 15 app (Turbopack) with a chat panel that drives an AI
component generator, rendered live in a sandboxed preview iframe. Start
the dev server, then drive it with the Playwright script at
`.claude/skills/run-uigen/driver.mjs` — there is no `chromium-cli` in
this environment, so this driver stands in for it.

All paths below are relative to the repo root (`uigen/`).

## Prerequisites

None beyond Node/npm — this was run and verified on macOS (Darwin), not
a Linux container. No system packages were needed.

## Setup

```bash
npm install                              # repo deps (Next, Prisma client, etc.)
cd .claude/skills/run-uigen && npm install   # driver's own deps (Playwright), separate from the app
npx playwright install chromium          # one-time browser download, ~95MB
```

The driver deliberately has its **own** `package.json`/`node_modules`
inside the skill directory so Playwright is never added to the app's
own dependency tree.

No `.env` is required. Without `ANTHROPIC_API_KEY` set, `src/lib/provider.ts`
automatically falls back to a `MockLanguageModel` that returns a canned
multi-step tool-call sequence (always builds a "Counter" component,
regardless of the prompt text) — this is expected, not a bug. The DB
(`prisma/dev.db`) and generated Prisma client (`src/generated/prisma`)
are already present/checked in, so no migration step is needed for a
normal run.

## Build

No separate build step for local dev (Turbopack compiles on request).
For a production build: `npm run build`.

## Run (agent path)

```bash
# from repo root
rm -f logs.txt
npm run dev:daemon                      # backgrounds itself, logs -> logs.txt
i=0; while [ $i -lt 30 ]; do curl -sf http://localhost:3000 >/dev/null && break; sleep 1; i=$((i+1)); done

# from .claude/skills/run-uigen/
node driver.mjs smoke                   # full golden-path run, screenshots -> ./shots/
```

Stop the server with `pkill -f "next dev --turbopack"`.

Screenshots land in `.claude/skills/run-uigen/shots/` (gitignored — treat
as scratch output, not committed artifacts).

| command | what it does |
|---|---|
| `node driver.mjs smoke` | loads the app, sends "Create a simple blue button component", waits for the tool-call trace to finish, clicks a button in the generated preview to prove it's live, screenshots at each stage (`01-initial`, `02-after-generate`, `03-after-interaction`) |
| `node driver.mjs screenshot <name>` | loads the app and takes one screenshot |
| `node driver.mjs prompt "<text>" [name]` | sends a chat message and screenshots the result |

Set `UIGEN_URL` env var to point the driver at a non-default port/host.
Console errors (`page.on("console")` type `error`, plus uncaught
`pageerror`) are printed to stderr after the run.

## Run (human path)

```bash
npm run dev        # http://localhost:3000, foreground, Ctrl-C to stop
```

## Test

```bash
npm test           # Vitest, all suites
npx vitest run src/lib/__tests__/file-system.test.ts   # single file
```

193 tests passing as of this writing (10 suites).

---

## Gotchas

- **`node_modules` can silently rot.** In this session, `next dev --turbopack`
  failed with `TurbopackInternalError: Next.js package not found` even
  though `ls node_modules` *looked* non-empty at a glance — a plain
  `npm install` from repo root fixed it. If the dev server panics
  immediately on startup, reinstall before debugging anything else.
- **The mock model ignores your prompt.** With no `ANTHROPIC_API_KEY`,
  every generation request produces the same "Counter" component and a
  chat message literally saying *"This is a static response. You can
  place an Anthropic API key in the .env file..."* — don't mistake this
  for the driver sending the wrong text.
- **`waitForTimeout(6000)` in `sendPrompt` is a fixed sleep**, not a
  proper wait condition, because the chat UI has no obvious "done
  streaming" marker to poll for grep-in-page. It's enough for the mock
  model's 3-step tool sequence; a real Claude call may need longer —
  bump it if `02-after-generate.png` shows mid-stream tool badges
  instead of a finished response.
- **The generated component renders inside an `<iframe>`**, so Playwright
  needs `page.frameLocator("iframe")` to reach it — a plain
  `page.getByText(...)` on the top-level page won't find the "Increase"
  button.

## Troubleshooting

- **`TurbopackInternalError: ... Next.js package not found`** on
  `npm run dev` / `dev:daemon`: `node_modules` is missing/broken. Run
  `npm install` from repo root, then retry.
- **`curl: (7) Failed to connect`** while polling for server readiness:
  check `logs.txt` — either the port is still binding (rare, usually
  <5s) or Turbopack panicked (see above).
