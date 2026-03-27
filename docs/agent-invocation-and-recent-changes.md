# Agent invocation and recent changes

This document summarizes how the coding agent is invoked end-to-end and what we changed to align the app with Supabase, fix sandbox streaming, and ensure sandboxes shut down reliably.

## What we changed

### 1. `tasks` vs Supabase schema

The Next.js app expects **`tasks`** and **`task_messages`**. The initial Supabase multi-tenant migration introduced **`threads`**, **`runs`**, **`projects`**, etc., but not those legacy tables.

**Change:** Added [`supabase/migrations/0005_tasks_and_task_messages.sql`](../supabase/migrations/0005_tasks_and_task_messages.sql) defining `tasks` and `task_messages`, with **`user_id` referencing `profiles(id)`** so Supabase Auth user UUIDs satisfy foreign keys.

The UI and API routes still use the flat task model; unifying with `runs` / `threads` would be a larger follow-up.

### 2. Task creation error handling

Failed inserts could still return **HTTP 200**, so the client showed success while **`GET /api/tasks/[id]`** returned 404 and the optimistic task disappeared after refresh.

**Change:** `POST /api/tasks` checks the Supabase insert result and returns **500** with a clear message when the row is not created.

### 3. AI-generated branch names

The branch-name helper could throw when the model returned names that were too long or contained invalid characters (especially after appending a short hash suffix).

**Change:** Branch names are **sanitized and truncated** to stay within Git-friendly length and character rules.

### 4. `Writable is not a constructor` (Turbopack / bundling)

Production builds using **Turbopack** could bundle `node:stream` in a way where **`Writable` was not the real Node constructor**, breaking `sandbox.runCommand({ stdout, stderr })` for agents that stream output.

**Change:**

- [`lib/sandbox/node-writable.ts`](../lib/sandbox/node-writable.ts) loads the builtin via **`createRequire(import.meta.url).require('node:stream')`** and exports **`getNodeWritableClass()`**.
- Cursor, Claude, Copilot, sandbox creation, and related API routes use that helper instead of importing `Writable` directly from `node:stream`.
- [`next.config.ts`](../next.config.ts) sets **`serverExternalPackages: ['@vercel/sandbox']`** to reduce over-bundling of the sandbox SDK.

### 5. Sandbox not stopping on error

**`shutdownSandbox`** only ran **`pkill`** for generic processes and **never called `sandbox.stop()`**, so Vercel sandboxes often stayed running until timeout or manual stop in the dashboard. **`cursor-agent`** was also not targeted by `pkill`.

**Change:** After best-effort **`pkill`** (including **`cursor-agent`**), **`shutdownSandbox`** calls **`await sandbox.stop()`** (with try/catch, same idea as `killSandbox` in the registry).

---

## How agent invocation works now

1. **Create task** — The client **`POST /api/tasks`** inserts a **`tasks`** row (generated id, `user_id` from the session, prompt, repo URL, selected agent/model, flags). Heavy work runs inside an **`after()`** callback so the HTTP response can return quickly.

2. **`processTask` (background)** — Loads user API keys and GitHub token, calls **`createSandbox`** (Vercel Sandbox API using **`SANDBOX_VERCEL_*`** env vars), clones the repository, optionally installs dependencies and starts a dev server, then creates the working git branch.

3. **Run agent** — **`executeAgentInSandbox`** selects the agent implementation (e.g. Cursor), temporarily merges user keys into **`process.env`**, and runs the agent CLI **inside the sandbox** via **`sandbox.runCommand`**, using **`detached: true`** where appropriate. **Stdout/stderr** are **`Writable`** streams from **`getNodeWritableClass()`** so streaming JSON and live DB updates (e.g. **`task_messages`**) work without bundler breakage.

4. **Teardown** — On success: commit/push, then **`unregisterSandbox`** + **`shutdownSandbox`** unless **`keepAlive`**. On failure: same shutdown path (unless **`keepAlive`**), task status set to **error**, logs stored on **`tasks`**.

**In one sentence:** Next.js orchestrates the flow; **Vercel Sandbox** provides the isolated VM where the **agent CLI** runs; persistence for this UI is still **`tasks`** / **`task_messages`**, not **`runs`** / **`threads`** yet.
