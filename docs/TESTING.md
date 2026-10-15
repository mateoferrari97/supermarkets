# Testing

## Runner

Every test runs with Vitest (ADR 0007): `pnpm test` is `vitest run`, and `pnpm check` runs it. `vitest.config.ts` includes `src/**/*.test.ts` and `scripts/**/*.test.ts` and excludes `.scratch`, `.claude`, `.data` and `.next`. Test files import `describe` and `it` from `vitest` and assert with `node:assert/strict`.

## Where tests go

A test sits next to the file it tests, named `<file>.test.ts`: `src/core/order-matching/match-items.test.ts` tests `match-items.ts`. Repo tooling in `scripts/` is tested the same way (`scripts/check-docs.test.ts`).

## What a test checks

Test behaviour through public functions: what the Owner is asked and gets, what Carrefour and the LLM are asked, what a command prints and its exit code. Do not test how state or caches are stored.

## No live calls

Tests never call Carrefour or start a Claude Code session.

- Core use cases take their ports as arguments, so tests pass fakes of `Llm` and `OnlineStore` (see `src/core/order-conversation/take-turn.test.ts` and `src/core/order-matching/match-items.test.ts`).
- The Carrefour adapter takes an `HttpClient`; its tests answer with recorded responses from `src/adapters/carrefour/fixtures/`, kept next to the adapter that reads them. To add one, record the real answer once and save it there as JSON; [Carrefour API](references/carrefour-api.md#fixtures) lists what each fixture records.
- The Claude Code adapter takes a `ProcessRunner`; its tests fake the process and its JSON output (`src/adapters/claude-code/claude-code-llm.test.ts`).
- A test that needs files writes them to a temporary folder from `node:os` `tmpdir()`, not into the repo.

## The eval set is not a test

`evals/order-matching.json` measures the product picked per Item against the real LLM and the current Catalog Snapshot: Items read right, Matches recall, Fits precision and recall, pick right, wrong picks nobody sees, questions, stability, time and cost; its answer cases measure how `read-reply` reads a reply to questions. `pnpm order:eval` runs it on demand, 3 times per case, and costs money; it is not part of `pnpm test` or `pnpm check`. `pnpm check` only validates the eval set's shape (`pnpm order:eval-set`). The scoring itself is pure code in `src/core/order-matching/` with tests over fixed inputs. See [LLM](LLM.md#the-eval-set).

## Data validators

`pnpm order:eval-set` validates the committed data in `evals/` and runs in `pnpm check` after the tests.
