# 01: Prototype AI SDK over a local Claude Code session

**What to build:** A throwaway prototype, outside the repo's source, that confirms ADR 0014's runtime before anything is built: `ToolLoopAgent` from AI SDK 7 with `ai-sdk-provider-claude-code` on this machine's Claude Code login, two fake tools passed through `createAiSdkMcpServer` (a `resolveItem` returning picked or choose, an `askQuestions` that ends the turn) and a minimal `useChat` page. It answers: how a tool result and the end of a turn reach the page, how messages are stored and replayed on the next turn, time and cost of a turn with two tool calls, and how the app layer may import AI SDK under the import rule of ADR 0006.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] An Owner message, a tool call, a round shown and a reply that resumes it run end to end
- [ ] Findings are in this ticket's Comments, with commands and numbers
- [ ] What was learned about the provider is recorded in a reference doc
- [ ] Nothing is added to the repo's source or dependencies

## Comments
