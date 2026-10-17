Status: ready-for-agent

# Turn Log: record where the time of each turn of the Chat goes

## Problem Statement

The Owner waits many seconds for some replies in the Chat, and nobody can say where that time goes. Since the agent chat replaced the old chat (ADR 0014), nothing records the timing of a turn: the Conversation Log was deleted with `takeTurn`, and the Chat keeps only the time of each message. Subtracting the Owner's message time from the Assistant's gives the length of the whole turn, and nothing more. The duration and cost of each `fit-products` call are reported through `onCall`, but only `pnpm agent:eval` listens. The tools measure nothing, and the agent's own session (how long it ran, what it cost, how many tokens it used) is not kept.

So when a turn is slow, the operator cannot tell whether the time went to the agent reading and thinking, to the start-up of its Claude Code session, to a tool such as `resolveItem`, to a catalog search, or to one of the `fit-products` calls inside it. Every speed change so far (ADR 0015, nonessential traffic turned off) was measured with the eval set, not with the turns the Owner actually sends.

## Solution

Every turn of the Chat writes one line to a Turn Log, a JSONL file next to the Chat in `.data/chat/`. The line says when the turn started, how long it took, how it ended, and a timeline of what happened inside it: the agent's session, every tool call, every step a tool reported and every `fit-products` call, each with its start and end measured from the start of the turn, and the cost and tokens where they are known. A new operator command reads the Turn Log and prints, for the last turns, where their time went.

The Owner sees nothing new: the same replies at the same speed. Writing the Turn Log can never fail or slow a turn.

## User Stories

1. As the operator, I want every turn of the Chat recorded with its total duration, so that I can find the slow turns.
2. As the operator, I want each turn recorded with the Owner's text and the time it started, so that I can tell which message a slow turn answered.
3. As the operator, I want each turn recorded with how it ended (a text reply, a tool that ended the turn, a failure, or an abort), so that I can tell slow answers from failed ones.
4. As the operator, I want a failed turn recorded with its error message, so that I can see what broke and how long it ran before it broke.
5. As the operator, I want a turn the Owner stopped recorded as aborted, so that stopped turns do not look like slow answers.
6. As the operator, I want the agent's session recorded with its wall time, so that I can see how much of the turn the agent took.
7. As the operator, I want the agent's session recorded with the duration Claude Code reports, so that the difference with the wall time shows the session's start-up.
8. As the operator, I want the agent's session recorded with its cost and its input, output and cache tokens when the provider reports them, so that I can relate the time to how much the agent read and wrote.
9. As the operator, I want the agent's session marked as not reported when the turn was ended by a tool, so that a missing cost is not mistaken for a free session.
10. As the operator, I want every tool call recorded with its name, start and end, so that I can see which tool took the time.
11. As the operator, I want every tool call recorded with whether it succeeded, and its error when it failed, so that I can tell a slow tool from a broken one.
12. As the operator, I want the gaps between tool calls to be visible from their starts and ends, so that I can see how long the agent thought between them.
13. As the operator, I want tool calls that run at the same time to show overlapping times, so that I can see when the agent resolved several Items in parallel.
14. As the operator, I want every step a tool reports, such as "Eligiendo productos para 'leche'", recorded with its start and end, so that I can see the parts of a slow tool.
15. As the operator, I want every `fit-products` call recorded with its model, effort, duration, cost and end time, so that I can see how much of a `resolveItem` call the LLM took.
16. As the operator, I want every `fit-products` call recorded with the Item it was for, so that I can tell which Item was slow.
17. As the operator, I want all times in a turn measured from the start of that turn, so that I can line them up without converting clocks.
18. As the operator, I want one line per turn, so that I can read, filter and count turns with ordinary tools such as `jq`.
19. As the operator, I want a command that prints the last turns with their total time and where it went, so that I do not have to read JSON to find the slow part.
20. As the operator, I want that command to show, per turn, the time of the agent, of each tool and of the `fit-products` calls, so that the largest share stands out.
21. As the operator, I want that command to take how many turns to show, so that I can look at one turn or at a whole session of testing.
22. As the operator, I want that command to say plainly when there is no Turn Log yet, so that an empty result is not confusing.
23. As the operator, I want a Turn Log line that cannot be read to be reported with its line number and skipped by the command, so that one bad line does not hide the rest.
24. As the Owner, I want my turn to work the same when the Turn Log cannot be written, so that logging never breaks my order.
25. As the Owner, I want my turn to take no longer because it is logged, so that measuring speed does not cost speed.
26. As the operator, I want a failure to write the Turn Log reported in the server's output, so that I notice a log that stopped growing.
27. As the operator, I want the Turn Log to stay in `.data/` and out of git, so that the Owner's messages are never committed.
28. As the operator, I want the eval runs of `pnpm agent:eval` to keep working as today, so that the Turn Log adds a record without changing the eval.
29. As a developer, I want the timeline built in core from what the turn already sees, so that another agent adapter or channel, such as WhatsApp, records the same Turn Log.
30. As a developer, I want the Turn Log tested through `takeAgentTurn` with fake dependencies and a fake clock, so that the test describes what the operator gets and not how the timing is wired.
31. As a developer, I want the docs to say what the Turn Log holds and how to read it, so that the next person chasing a slow turn starts from it.

## Implementation Decisions

**The Turn Log**

- New domain term **Turn Log**: the record of one turn of the Assistant in the Chat, with its timeline and costs. It exists to find where a turn's time goes; it is never shown to the Owner. It is added to the glossary next to Chat.
- It is a JSONL file in the Chat's data folder, one line per turn, oldest first, appended when the turn ends, whatever the end. It is read and written only through a loader and a saver in the files adapter, wired in compose, like the Chat.
- One line has the shape below. Every time inside `events` is in milliseconds from the start of the turn, measured with a monotonic clock; `startedAt` is wall-clock ISO time.

```ts
type TurnLogEntry = {
  startedAt: string;
  ownerText: string;
  durationMs: number;
  outcome: "replied" | "ended-by-tool" | "failed" | "aborted";
  error: string | null;
  agent: {
    startMs: number;
    endMs: number;
    reported: {
      durationMs: number | null;
      costUsd: number | null;
      inputTokens: number | null;
      outputTokens: number | null;
      cacheReadTokens: number | null;
      cacheWriteTokens: number | null;
    } | null;
  };
  events: (
    | { kind: "tool"; name: string; startMs: number; endMs: number; ok: boolean; error: string | null }
    | { kind: "step"; label: string; startMs: number; endMs: number }
    | { kind: "llm-call"; task: string; model: string; effort: string | null; item: string | null; endMs: number; durationMs: number; costUsd: number }
  )[];
};
```

- An `llm-call` has no `startMs` of its own: the adapter reports a call when it ends, with the session's own `duration_ms`, so `endMs - durationMs` would hide the session's start-up. The event keeps both numbers as they are.
- The Owner's text is kept so a slow turn can be matched to its message; the Turn Log holds no Assistant text, no tool input and no tool output, which already live in the Chat and the Orders.

**Where the timeline is built**

- `takeAgentTurn` builds the entry. It already sees the turn's start and end, the agent's reply and the tools it hands the agent, so it wraps each tool to record its start, end and result, and records the agent's span around `agent.reply`. It receives a clock and a Turn Log saver among its dependencies, next to `now` and `save`.
- A turn's tools report their steps and their LLM calls to that turn: the tools-for-a-turn function receives, with the turn's outcome and messages, a reporter with one callback for steps and one for LLM calls. `resolveItem` passes the step callback to the steps it already builds, so "Eligiendo productos para '…'" reaches the Turn Log with no change to `matchItems`.
- The LLM calls of a turn reach its reporter through the `Llm` the tools use. The core reporter takes a call description defined in core (task, model, effort, item, duration, cost), so core never imports the adapter's call type. Compose maps the adapter's `onCall` report onto it.
- The `ChatAgent` port gains a way to report its session: the agent adapter reports what the provider returns about the session (duration, cost and tokens from its provider metadata and usage) when the session returns a result. When a tool ends the turn, the session is aborted and returns nothing, and `reported` is `null`.
- The agent adapter keeps every setting it has today; only the report is new.

**Never breaking a turn**

- The saver never throws into the turn: a failure to write is reported to the server's error output, and the reply is returned as usual.
- The entry is written after the Assistant's message is saved, so the Turn Log never delays what the Owner sees by more than one file append.
- A failed or aborted turn still writes its entry, with the events recorded so far, and then fails or aborts exactly as today.

**The command**

- New operator command, `pnpm chat:turns [N]`, in the CLI folder, reading the Turn Log only through the compose loader. It prints the last N turns (10 by default), each with its start time, the start of the Owner's text, its outcome and total time, and below it the agent's wall time and reported duration, each tool call with its time, and the sum of its `fit-products` time and cost.
- A line that fails the schema is reported with its line number and skipped; the command still prints the others. No Turn Log prints that there is none and exits 0.

**Docs**

- `GLOSSARY.md` gets Turn Log. `ARCHITECTURE.md` gets the file in the data folders table and the Turn Log in the order flow. `docs/LLM.md` says where the timing of the agent and of `fit-products` is recorded. The Commands section of `CLAUDE.md` gets `pnpm chat:turns`.
- No ADR: the Turn Log is easy to remove and changes no decision.

## Testing Decisions

- A good test drives the system from where the Owner or the operator reaches it and checks what they get: the saved Turn Log entry, the reply, and the command's output. It never checks how the timing is wired.
- **`takeAgentTurn` with fake dependencies and a fake clock** is the main seam, in its existing test file:
  - A text reply writes one entry with outcome `replied`, the Owner's text, the agent's span and the total duration from the fake clock.
  - A turn ended by a tool writes outcome `ended-by-tool` and the tool event, and `reported` is `null` when the fake agent reports nothing.
  - A fake agent that reports its session puts those numbers in `reported`.
  - A tool that fails writes a tool event with `ok: false` and its error; a failing agent writes outcome `failed` with the error and then rethrows it; an aborted turn writes outcome `aborted`.
  - A tool that reports a step and an LLM call through the turn's reporter produces `step` and `llm-call` events with times relative to the turn's start.
  - Two tool calls that run at the same time produce overlapping events.
  - A saver that throws does not change the reply or the saved Chat.
  - Prior art: the existing tests of `takeAgentTurn`, the fakes in the agent chat fixtures, and the step clock option of the steps module.
- **The agent adapter with a fake model**, in its existing test file: when the model's result carries provider metadata and usage, the adapter reports them; when a tool ends the turn, it reports nothing. Prior art: the tests that build a model with `createModel` and the one that stops the session when a tool ends the turn.
- **`resolveItem`**: its step reaches the turn's reporter. Prior art: its existing tests.
- **The files adapter**: the saver appends one valid line per entry and the loader reports a bad line by number. Prior art: the tests of `appendChatMessage` and `loadChatMessages`.
- **The command's formatter**: given entries, it prints the expected text. Prior art: the agent eval report tests.
- `pnpm check` runs all of them. No test calls Claude Code.

## Out of Scope

- Making any turn faster. This spec only measures; what to change comes from reading the Turn Log.
- Showing timings to the Owner in the chat page.
- Timing the agent's thinking between tool calls from inside the Claude Code session; the gaps between tool events stand in for it.
- Recording tool inputs and outputs, Assistant texts or prompts; the Chat and the Orders already hold them.
- Rotating, trimming or uploading the Turn Log.
- Changing `pnpm agent:eval` to write or read the Turn Log.

## Further Notes

- The provider (`ai-sdk-provider-claude-code` 4.3.3) puts `costUsd` and `durationMs` in its provider metadata when a session completes. Whether usage with cache tokens is available in the same result was not checked; fields it does not give stay `null`.
- Turns are serialized by the route (a second turn gets 409), so one turn's reporter never receives another turn's calls. Compose may rely on that, and the docs say so.
- The Conversation Log deleted with ADR 0014 recorded similar facts per conversation; the Turn Log is one line per turn because the Chat has no conversations.
