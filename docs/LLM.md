# LLM

## The LLM translates, code decides

The LLM turns the Owner's words into fixed forms; plain code makes every choice that must be repeatable (ADR 0002, ADR 0011). It splits an order into Items, picks Product Types for an Item from the tree, rewords an Item nothing matched, and maps a free-text answer onto the options offered. Code builds the evidence and the options from the Catalog Snapshot, drops any Product Type id that is not in the tree, and picks the products from live search and checkout simulation with the fixed rules of the Selection Policy (ADR 0003, ADR 0004, ADR 0005). Never let the LLM choose a product, compute a price or invent an option.

## The port and its adapter

- `Llm` in `src/core/order-resolution/llm.ts` is the port: one method per task (`splitOrder`, `resolveItem`, `rewordItem`, `mapAnswer`) with the input and output types of each call.
- `src/adapters/claude-code/claude-code-llm.ts` implements it by running one Claude Code session per call (`claude -p`) with no tools, a JSON schema for the answer and a budget per session. The default model is `claude-haiku-5-5`, which takes no `temperature`, so the same text can resolve differently between runs.
- `src/adapters/claude-code/llm-output-schemas.ts` holds the zod schemas the answers are parsed with; an answer that does not fit its schema fails the call.
- `src/compose.ts` wires the adapter (`createLlm`); tests use fakes of `Llm` instead.
- The adapter's `onCall` reports every session that returns a result: task, model, SHA-256 of the system prompt, input, raw output, cost and duration. `pnpm order:eval` sums its cost; the chat writes it to the Conversation Log in `.data/conversations/` (see [ARCHITECTURE](../ARCHITECTURE.md#an-order-end-to-end)).

## Prompts

Each task's system prompt is a Markdown file in `prompts/order-resolution/`, named after the task: `split-order.md`, `resolve-item.md`, `reword-item.md`, `map-answer.md`. The adapter reads the file on each call; `resolve-item` and `reword-item` get the Product Type tree appended. Prompts are LLM input, written in English; the Owner's text they receive is Spanish. `pnpm docs:check` does not check them.

## Changing a prompt

1. Edit the prompt. If the answer's shape changes, change the output type in the port and its schema in the adapter together.
2. Run `pnpm order:eval` (or `pnpm order:eval <filter>` for the cases whose id or order text contains the filter). It resolves each case of the eval set in `evals/order-resolution.json` with real Claude Code sessions and scores it as hit, miss or error.
3. Read the report: misses with what came back, the cases whose outcome changed since the previous run, and the sessions, time and cost. Each run is saved in `.data/order-resolution/eval-runs/`, so the next run compares against it. The command exits 1 when a case not marked `expectedToFail` misses or errors.
4. When a change fixes a case marked `expectedToFail`, the report says so; clear the mark in the eval set.

The eval set is edited by hand. `pnpm order:eval-set` validates it against the vocabulary and runs in `pnpm check`; `pnpm order:eval` does not, because it makes live calls and costs money.
