# 02: An agent chat whose Chat survives reloads

**What to build:** A new chat page, next to today's chat, where the Owner talks with the agent behind a port, on the runtime ticket 01 settled. Every message is saved as the Chat and read back on each turn and on page open, so the history survives a reload and a server restart. The agent has no tools yet: it answers, and says briefly what it can do. Today's chat is untouched.

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] The new page shows the whole Chat on open, after a reload and after a restart
- [ ] Each turn the agent gets the last 40 messages of the Chat
- [ ] The Chat is read and written only through validated loaders and savers, which round-trip and reject invalid files (tests)
- [ ] `ARCHITECTURE.md` describes the new page, the port and where the Chat is stored
- [ ] `pnpm check` is green

## Comments
