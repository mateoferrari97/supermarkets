# CLAUDE.md

## Language

- Conversations with the user: Spanish.
- Everything in this repository: English. This covers code, identifiers, commit messages, documentation, ADRs, glossary, issues under `.scratch/` and any other file.

## No comments in code

- Code has no comments. Never write one, and remove any you find in a file you touch. Names, types and tests carry the meaning; anything that needs more words goes in `docs/`, an ADR or the commit message.
- This covers every code file: TypeScript and JavaScript (`//`, `/* */`, `/** */` JSDoc), SQL, shell scripts and git hooks (`#`) and config files.
- Only these exceptions: a shebang line (`#!`), tool directives the tooling needs to work (`eslint-disable…`, `@ts-expect-error`, `@ts-ignore`, `/// <reference …>`), generated files that are never edited by hand, and configuration files of external tools that are not code (`.env.example`, `.gitignore` files).
- `pnpm check` runs the no-comments check and fails when a comment is found.

## Accuracy

- If you do not know something, answer "I don't know" (in Spanish: "No sé"). Never guess or invent an answer.
- Every claim must be verified before stating it: read the code, run the command, or check the docs. Cite the source (file path, command output, or URL).
- If something cannot be verified, say so explicitly and state what is missing to verify it.

## GitHub

- Repository: https://github.com/mateoferrari97/supermarkets (remote `origin`).
- Always use the GitHub account `mateoferrari97`. This machine's active `gh` account may be a different one (a work account); never run `gh auth switch`, which changes it for every repo.
- Run every `gh` command and every `git` command that talks to GitHub (`push`, `fetch`, `pull`, `ls-remote`) with that account's token for that command only: `GH_TOKEN=$(gh auth token --user mateoferrari97) gh ...` and `GH_TOKEN=$(gh auth token --user mateoferrari97) git push ...`. Never print the token.
- Commits use the repo-local identity (`git config --local user.email` is `mateo.ferrari97@gmail.com`); do not change it.

## Before every push

Never push a broken project. Before any `git push`, run `pnpm check` and push only if it exits 0. It runs, in order:

1. `pnpm typecheck`
2. `pnpm lint`
3. `pnpm format --check`
4. The no-comments check (see "No comments in code")

If a step fails, fix it or tell the user; never push with a failing step, and never skip a step to make it pass. When tests or a build are added, add them to `pnpm check`.

## Catalog data

- `pnpm carrefour:catalog` fetches the whole Carrefour catalog into `.data/carrefour/` (`products.json`, `tipos.json`). `.data/` is not committed.

## Agent skills

### Issue tracker

Issues tracked as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical labels (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.
