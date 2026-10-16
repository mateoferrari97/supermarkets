# 08: "Lo mismo que la última vez"

**What to build:** Each turn the agent gets the last 3 closed Orders (Items and products, no prices). "Lo mismo que la última vez" proposes that Order again, its products resolved in today's Branch. An addition with no open Order ("agregá yogur") asks once whether to repeat the last Order with it or start a new one, naming the last Order.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] A repeated Order says which products are no longer available
- [ ] The context holds the last 3 closed Orders and nothing older (tests)
- [ ] `docs/LLM.md` records the rules
- [ ] `pnpm check` is green

## Comments
