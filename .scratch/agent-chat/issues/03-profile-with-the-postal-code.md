# 03: The postal code is told once and kept in the Profile

**What to build:** In the agent chat, the Owner says their postal code once and the agent saves it in the Profile with `updateProfile`, which checks it against the Online Store first, and says so. It is never asked again; saying a new one replaces it; a postal code no Branch serves is refused. Each turn the agent gets the Profile.

**Blocked by:** 02

**Status:** ready-for-agent

- [ ] A known postal code is not asked again after a reload or a restart
- [ ] A new postal code replaces the old one; an unserved one is refused and not saved (tests with a fake Online Store)
- [ ] `docs/LLM.md` describes the agent, its prompt and its first tool
- [ ] `pnpm check` is green

## Comments
