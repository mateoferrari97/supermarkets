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

Never push a broken project. Before any `git push`, run `pnpm check` and push only if it exits 0 (the `.githooks/pre-push` hook runs it too). It runs, in order: `pnpm typecheck`, `pnpm lint`, `pnpm format --check`, `pnpm no-comments`, `pnpm docs:check`, `pnpm test`, `pnpm product-types`, `pnpm payment-cards` and `pnpm order:eval-set`.

If a step fails, fix it or tell the user; never push with a failing step, and never skip a step to make it pass. When a test, build or check is added, add it to `pnpm check`.

## Map

- [ARCHITECTURE.md](ARCHITECTURE.md): the product, layers and ports, an order end to end, and the data folders.
- [GLOSSARY.md](GLOSSARY.md): domain terms; use them in code, docs and tickets.
- [docs/adr/](docs/adr/README.md): architecture decisions.
- [docs/product-specs/](docs/product-specs/README.md): rules the product follows, such as the Product Type seed rules.
- [docs/references/](docs/references/README.md): facts about external systems, such as the Carrefour API.
- [docs/agents/](docs/agents/README.md): how the agent skills use this repo.
- [docs/LLM.md](docs/LLM.md): what the LLM does, where prompts live, how to change and measure one.
- [docs/TESTING.md](docs/TESTING.md): Vitest, fakes and fixtures, no live calls, the eval set.
- `.scratch/`: work in flight (maps, specs, tickets, research). It can be deleted at any time, so nothing outside it links into it.

## Commands

- `pnpm dev`: runs `next dev`, the Owner's chat at http://localhost:3000, where every order is placed. It needs the Catalog Snapshot in `.data/carrefour/` (`pnpm carrefour:catalog`).
- `pnpm check`: every check, in the order above.
- `pnpm test`: Vitest over `src/` and `scripts/`.
- `pnpm docs:check`: checks the knowledge base (ADR 0010) and prints file, line and rule for each finding.
- `pnpm typecheck`, `pnpm lint`, `pnpm format` (`--check` to only check), `pnpm no-comments`.
- The operator commands below run one file each in `src/cli/` and read and write data only through the loaders and savers of `src/compose.ts`.
- `pnpm order:eval [filter...]`: runs the order resolution eval set with real Claude Code sessions ([LLM](docs/LLM.md#changing-a-prompt)).
- `pnpm order:eval-set`, `pnpm product-types`, `pnpm payment-cards`: validate the committed data in `evals/` and `vocabulary/` with the same loaders every command uses.
- `pnpm carrefour:catalog`: downloads the whole Carrefour catalog into `.data/carrefour/` (`products.json`, `tipos.json`), or into the directory given as its argument. `.data/` is not committed.
- `pnpm seed:split`, `pnpm seed:check-proposal <part-id>`, `pnpm seed:consolidate`, `pnpm seed:coverage`, `pnpm seed:doubts [size]`: the Product Type seed, run by the `seed-product-types` and `review-product-type-doubts` skills.

## Workflow

- Open questions about a large effort live in a wayfinder map with one ticket per question, `.scratch/<effort>/map.md` and `.scratch/<effort>/issues/`.
- A feature is built from a spec, `.scratch/<feature>/spec.md`, and one file per ticket in `.scratch/<feature>/issues/`. Notes go under `## Comments`; the `Status:` line follows [triage labels](docs/agents/triage-labels.md).
- Record a hard-to-reverse decision as an ADR in `docs/adr/` and add it to its index; add or sharpen domain terms in `GLOSSARY.md`.
- Each ticket updates the docs it touches: `ARCHITECTURE.md` when folders or the order flow change, the Commands above when a command changes, a reference when an external system's behaviour is learned.

## File naming

- Documents at the root and directly under `docs/` are UPPERCASE (`ARCHITECTURE.md`, `docs/LLM.md`); documents in subfolders are lowercase kebab-case; each folder under `docs/` has a `README.md` index linking every document in it.
- ADRs are `docs/adr/NNNN-kebab-slug.md`, numbered without gaps.
- Code files are lowercase kebab-case; a test sits next to the file it tests as `<file>.test.ts`.

## Agent skills

### Issue tracker

Issues tracked as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five canonical labels (needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` + `docs/adr/` at repo root. See `docs/agents/domain.md`.
