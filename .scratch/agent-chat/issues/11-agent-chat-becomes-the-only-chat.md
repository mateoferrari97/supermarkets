# 11: The agent chat becomes the only chat

**What to build:** The agent chat replaces today's chat at the root page, and everything it replaced is deleted: the state machine and its stages, the Topic router, the order reading and reply reading tasks, the in-memory sessions, and the order and planning eval sets with their commands, moving any case worth keeping into the agent eval set. **Topic** leaves the glossary.

**Blocked by:** 06, 07, 08, 09, 10

**Status:** ready-for-agent

- [ ] No code, prompt or command of the old flow remains
- [ ] `pnpm check` and the Commands of `CLAUDE.md` list only the agent eval set
- [ ] `ARCHITECTURE.md`, `docs/LLM.md` and `docs/TESTING.md` describe only the agent
- [ ] `pnpm check` is green

## Comments
