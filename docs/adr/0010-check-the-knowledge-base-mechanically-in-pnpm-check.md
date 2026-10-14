---
Status: accepted
---

# Check the knowledge base mechanically in `pnpm check`

`scripts/check-docs.ts`, run as `pnpm docs` right after `pnpm no-comments` in `pnpm check`, fails with the file, line and rule when the knowledge base of ADR 0009 drifts. It is a repo-specific script run with `tsx`, tested with Vitest, with no new dependency.

It checks every tracked Markdown file outside `.scratch/` and `prompts/` (prompts are LLM input), including `.claude/skills/*/SKILL.md`, for:

1. Relative links that point at a missing file, or at an `#anchor` that matches no heading under GitHub's slug rules. External links are not checked, so the network cannot fail `pnpm check`. Links in fenced code blocks are ignored.
2. Any text `.scratch/<literal segment>`, in Markdown and in code, backticks included; placeholders such as `.scratch/<feature>/` pass.
3. Indexes: each subfolder of `docs/` has a `README.md` linking every sibling `.md`, and the Map of `CLAUDE.md` links every top-level document and every folder `README.md`.
4. ADR `Status` front matter is `proposed`, `accepted`, `deprecated` or `superseded by ADR-NNNN`, and the superseding ADR exists.
5. `CLAUDE.md` has at most 120 lines.
6. Every `src/...` path cited in backticks exists, and `ARCHITECTURE.md` names every `src/core/<feature>/` and `src/adapters/<technology>/` directory. The layer rule itself stays with ESLint (ADR 0006).
7. Naming, at the root and in `docs/`: top-level documents UPPERCASE, subfolder documents lowercase kebab-case, folder indexes `README.md`, ADRs `NNNN-kebab-slug.md` with unique numbers and no gaps.

## Considered Options

- **remark-lint or a Markdown link checker.** Covers only broken links; every other rule is specific to this repo.
- **Checking external links.** A network failure would fail `pnpm check` with nothing changed in the repo.
- **Freshness or verification dates on documents.** More metadata to keep up for one developer; the checks above catch the drift that matters.
- **A recurring doc-gardening agent.** Left for later, once the layout is stable.
