# Sandbox Agent 0.4.x — supported coding agents

This app uses the [Sandbox Agent SDK](https://sandboxagent.dev/docs/sdk-overview) inside Vercel Sandboxes. Only agents exposed by the daemon are selectable in the UI.

## Agent identifiers (SDK `createSession({ agent })`)

| SDK value  | Maps from template `AgentType` | Notes                                                                                                              |
| ---------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `claude`   | `claude`                       | Claude Code (per [quickstart](https://sandboxagent.dev/docs/quickstart) examples)                                  |
| `codex`    | `codex`                        | OpenAI Codex CLI                                                                                                   |
| `cursor`   | `cursor`                       | [Cursor agent](https://sandboxagent.dev/docs/agents/cursor) — requires `CURSOR_API_KEY` in the sandbox environment |
| `opencode` | `opencode`                     | OpenCode                                                                                                           |

## Not available via Sandbox Agent (disabled in UI)

These previously used direct CLI integration in `lib/sandbox/agents/` and are **not** selectable until Sandbox Agent adds them:

- `copilot` — GitHub Copilot CLI
- `gemini` — Google Gemini CLI (as a standalone agent; Cursor can use `gemini-3-pro` etc. via the `cursor` agent)

## References

- [SDK overview — listAgents / session config](https://sandboxagent.dev/docs/sdk-overview)
- [Quickstart — env vars per provider](https://sandboxagent.dev/docs/quickstart)
- [Cursor agent — models](https://sandboxagent.dev/docs/agents/cursor)
