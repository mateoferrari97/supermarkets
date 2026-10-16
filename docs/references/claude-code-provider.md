# AI SDK over Claude Code

Facts about `ai` 7.0.143 with `ai-sdk-provider-claude-code` 4.3.3 (peer `zod` ^4.1.8, Node 22 or later), checked on 2026-10-16 with a throwaway prototype on this machine (Node 24.21.0, Claude Code 2.1.301, the Owner's own login, model `sonnet`). The prototype lived outside the repo; ADR 0014 builds on these facts.

## Tools reach the session as an MCP server

- `ToolLoopAgent` takes `model: claudeCode("sonnet", { mcpServers: { shop: createAiSdkMcpServer("shop", tools) }, allowedTools: ["mcp__shop__resolveItem", ...] })`. The `tools` map must also be given to the agent for typing, but the provider ignores it and prints the warning `The feature "tools" is not supported`; the warning is harmless.
- A tool runs in the app's process, inside `execute`, and its result goes back to the session. Tool names are `mcp__<server>__<tool>`.
- The whole tool loop runs inside the Claude Code session: `agent.generate` returns one step holding every tool call and result, and `maxTurns` on the model settings caps it.
- Only zod object schemas are accepted, and tools without `execute` are rejected.

## Keeping the session small

The defaults load the Claude Code system prompt, the user's settings and the user's connected MCP servers. With `strictMcpConfig: true`, `settingSources: []`, `tools: []`, `persistSession: false` and `systemPrompt` set to a string, the same two-tool turn used 5,275 input tokens instead of 257,109 (the default also loaded the account's claude.ai MCP servers). A cold turn with the default settings cost 0.38 USD; the same turn warm cost 0.0084 USD with default settings and 0.0058 to 0.0059 USD with the small session (`providerMetadata["claude-code"].costUsd`).

## Time

Turn with `resolveItem` twice and `askQuestions` once, small session, `sonnet`: 7.2 s and 7.8 s with `agent.generate`, 5.9 s to the round when the stream is aborted after `askQuestions`. In the aborted stream the first tool call started at 2.2 s, the second result arrived at 3.4 s and `askQuestions` was complete at 5.8 s. A reply turn with no tool call, over the replayed history, took 3.6 s. These are single runs of a fake in-memory tool; real tools add their own time.

## Ending a turn

Nothing in the provider ends the session when a tool is called. After `askQuestions` the model went on and wrote text that contradicted the round ("quedó registrada tu elección de yogur"). Aborting the `AbortSignal` passed to the agent from the tool (`setTimeout(() => ac.abort(), 30)` inside `execute`, so its result is emitted first) ends the stream cleanly: the last parts are `tool-output-available` and `{"type":"abort"}`, nothing is thrown, and `onFinish` of the UI stream receives `isAborted: true` with every part so far.

## Messages and replay

- `createAgentUIStreamResponse({ agent, uiMessages, abortSignal, originalMessages, onFinish })` streams the turn as UI message parts. A provider-executed tool arrives as `tool-input-start`, `tool-input-available` and `tool-output-available` with `providerExecuted: true` and `dynamic: true`, and `useChat` shows it as a part of type `dynamic-tool` with `toolName`, `state` (`output-available`), `input` and `output`.
- `onFinish` gives the whole UI message list; saving it as JSON and reloading it with `validateUIMessages` works. The assistant message came back with `id: ""` unless the server generates ids, so the app must set `generateMessageId`.
- Each part also carries `callProviderMetadata` and `resultProviderMetadata` with the raw MCP input and result as strings, which doubles the size of a stored tool part; a stored Chat should keep its own parts and drop these.
- On the next turn the provider replays the history through the prompt, writing assistant tool calls as text lines (`[Tool call: ...]`, inputs cut at 1000 characters) and their results as `Tool Result (...)` lines. In the prototype the model, on the reply "1: yogur marca B", answered with the leche picked in the earlier turn and the yogur chosen, so the replay carried what it needed.
- `useChat` with `prepareSendMessagesRequest` can send only the last message; the server loads the rest from its own storage. Reloading the page and reading the stored list into `setMessages` restored the whole Chat, round included.

## Next.js

`next dev` needed `serverExternalPackages: ["ai-sdk-provider-claude-code", "@anthropic-ai/claude-agent-sdk"]`. The provider and `next` ran on the default Node.js runtime. A file read with `new URL("./x.json", import.meta.url)` is resolved by the bundler as a module; use a path from `process.cwd()`.

## Import rule

`eslint.config.js` lets `src/app/**` import any package except adapters, and keeps `ai` out of `src/core/` (core imports only core and zod). A route handler or client component in `src/app/` can therefore import `ai` and `@ai-sdk/react` today; the agent itself (`ToolLoopAgent`, the provider, the MCP server) belongs in an adapter reached through a port from `src/compose.ts`.

## A real tool in the repo

Checked on 2026-10-16 with the agent chat of the repo: the small session with one `createAiSdkMcpServer("chat", ...)` tool (`updateProfile`) and `allowedTools: ["mcp__chat__updateProfile"]` called the tool on each message that stated a postal code, 2.8 to 7.0 s per turn including the Carrefour regions call, and did not call it when the Owner only asked for the saved one. The tool's `execute` ran in the Next.js process and its zod input was parsed before our function ran.

## Not verified

- Whether a Claude subscription may serve people other than its owner.
- Behaviour under two turns at once, or a turn aborted by a closed tab before `askQuestions`.
- Time and cost with real tools, the real prompt and the last 40 messages of a Chat.
