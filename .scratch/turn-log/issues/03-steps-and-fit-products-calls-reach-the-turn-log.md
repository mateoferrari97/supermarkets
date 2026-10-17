# 03: Tool steps and `fit-products` calls reach the Turn Log

**What to build:** the steps a tool reports, such as "Eligiendo productos para 'leche'", and every `fit-products` call made during a turn appear in that turn's Turn Log entry as `step` events (label, start, end) and `llm-call` events (task, model, effort, Item, end, duration, cost), so the operator can see how much of a slow `resolveItem` went to the catalog search and how much to the LLM. See the spec, `../spec.md`, the reporter decisions under "Where the timeline is built".

**Blocked by:** 01 (Every turn of the Chat writes its Turn Log line).

**Status:** resolved

- [x] The tools-for-a-turn function receives a reporter with one callback for steps and one for LLM calls, and `takeAgentTurn` turns what it receives into events relative to the turn's start.
- [x] `resolveItem` passes the step callback to the steps it already builds; `matchItems` is unchanged.
- [x] The LLM call description the reporter takes is defined in core; compose maps the adapter's `onCall` report onto it, including the Item of a `fit-products` call. Core never imports the adapter's call type.
- [x] The docs say that turns are serialized by the route, so one turn's reporter never receives another turn's calls.
- [x] `pnpm agent:eval` reports the same models and costs as before.
- [x] Tests: `takeAgentTurn` with a fake tool that reports a step and an LLM call produces both events with relative times; `resolveItem`'s step reaches the reporter.
- [x] `docs/LLM.md` says where the timing and cost of `fit-products` calls are recorded in the chat.
- [x] One turn that resolves an Item, sent through the running app, has its `step` and `llm-call` events; record them under `## Comments`.
- [x] `pnpm check` exits 0.

## Comments

- Built (2026-10-17). `src/core/agent-chat/turn-log.ts` defines `TurnReporter` (`onStep`, the existing `OnStep` of `steps.ts`, and `onLlmCall`), `LlmCallReport` (task, model, effort, item, duration, cost) and `silentReporter`. `ToolsForTurn` takes the reporter as an optional third argument; `agentTools` hands `reporter.onStep` to `resolveItem`, which passes it to `stepsFrom({ signal, onStep })`. `matchItems` is unchanged. `stepLabel` in `steps.ts` renders "Eligiendo productos para '<original>'".
- `takeAgentTurn` builds the turn's reporter: a `started` step records its start (keyed by the step object, since each `resolveItem` call numbers its steps from 1 and parallel calls would collide on ids), `done` pushes a `step` event; `onLlmCall` pushes an `llm-call` event with `endMs` = time of the report. `eval-run.ts`'s `recording` forwards the reporter.
- Item of a call: the adapter's `onCall` input is the rendered `<line>` text, so the adapter's `LlmCall` gained `item: string | null` (`fitProducts` passes `input.item.original`). `createAgentTools` in compose builds the `Llm` with an `onCall` that maps the adapter's `LlmCall` onto the core `LlmCallReport` and hands it to the reporter of the turn in progress (set each time the route asks for the tools of a turn). Core never imports `LlmCall`.
- `pnpm agent:eval` gives no reporter and its `onCall` path is the same. `pnpm agent:eval precise-products-no-questions --runs 1` passed and reported `models: ["fit-products claude-sonnet-5-5 low"]`, 2 sessions, 0.0230 USD, the same models line as the run before this ticket (`2026-10-17T15-52-42.148Z.json`); costs come from the same `onCall` sum.
- Live check through the `next dev` server already running on port 3000 (not started by this ticket, left running). "necesito una leche entera" opened a draft Order in the Owner's `.data/chat/orders.json` with one proposal (Leche entera larga vida Ilolay 1 l, $2239.20) and wrote this entry's events:

```json
{"kind":"llm-call","task":"fit-products","model":"claude-sonnet-5-5","effort":"low","item":"leche entera","endMs":6301.81,"durationMs":4080,"costUsd":0.0124398}
{"kind":"step","label":"Eligiendo productos para 'leche entera'","startMs":1869.23,"endMs":6302.23}
{"kind":"tool","name":"resolveItem","startMs":1867.98,"endMs":7022.05,"ok":true,"error":null}
{"kind":"tool","name":"proposeOrder","startMs":8168.54,"endMs":8185.55,"ok":true,"error":null}
```

  Total 10,190 ms, outcome `ended-by-tool`, `reported` `null`. Reading it: the agent took 1.9 s before calling `resolveItem`; the step took 4.4 s, of which Claude Code reported 4.1 s for `fit-products` (so its start-up plus the catalog search is about 0.35 s); the simulation after the step took 0.7 s; the agent took 1.1 s to call `proposeOrder`; and the agent's span ended 2.0 s after `proposeOrder` answered, which is time spent ending the aborted session, worth a look when making turns faster.
- `pnpm check` exits 0.
