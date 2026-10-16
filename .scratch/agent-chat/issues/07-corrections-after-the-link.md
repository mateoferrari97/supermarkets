# 07: Corrections right after the link

**What to build:** Right after the link, a clear Correction ("cambiá la leche por descremada", "sacá el pan") reopens the last Order with `reopenLastOrder` and gives a new link with no question. Only the last closed Order can be reopened.

**Blocked by:** 05

**Status:** ready-for-agent

- [ ] A Correction after the link yields a new cart for the same Order (tests)
- [ ] Only the last closed Order reopens (tests)
- [ ] Checked by hand in the new page
- [ ] `pnpm check` is green

## Comments
