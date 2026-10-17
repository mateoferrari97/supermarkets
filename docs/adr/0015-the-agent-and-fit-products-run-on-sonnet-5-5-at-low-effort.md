---
Status: accepted
---

# The agent and `fit-products` run on Sonnet 5.5 at low effort

The Owner waited 15 to 25 s for many turns in the Conversation Logs of 2026-10-15 and 2026-10-16. The time of a call follows its output tokens, and thinking was a large share of them: about half of the output of `fit-products`. Since ADR 0014 two kinds of Claude Code session serve a turn: the agent, on the alias `sonnet` at its default effort, and `fit-products` (call 2 of ADR 0012), on `claude-sonnet-5-5` at its default effort, once per Item the agent resolves.

Both now run on `claude-sonnet-5-5` with low effort: the agent through the provider's `effort` setting (`src/adapters/agent/claude-code-agent.ts`), and `fit-products` through `--effort low` in `TASK_MODELS` (`src/adapters/claude-code/claude-code-llm.ts`). Low is the lowest effort Claude Code accepts, and Sonnet 5.5 cannot run with thinking turned off: `MAX_THINKING_TOKENS=0` does not apply to it ([Claude Code environment variables](https://code.claude.com/docs/en/env-vars)). The agent names the model in full instead of the alias, so a new Sonnet does not change it unnoticed.

This amends ADR 0012, which ran call 2 at its default effort, and ADR 0014, whose agent ran on `sonnet` at its default effort.

## Considered Options

- **Keep the default effort.** Each session stays as it was measured, and the wait stays as it is.
- **Haiku 5.5 for `fit-products`.** ADR 0012 found it broke prompt rules on call 2 at low effort.
- **Turn thinking off.** Not available on Sonnet 5.5.

## Consequences

- Six replays of logged `fit-products` inputs gave the same Fits with low effort as with the default and about the same thinking (200 tokens), so the gain there may be small; the agent, which reads the Chat and chooses tools, is where it should show.
- `pnpm agent:eval` decides whether the quality holds; a case that regresses reopens this decision.
