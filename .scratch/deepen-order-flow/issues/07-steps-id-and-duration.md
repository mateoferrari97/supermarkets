# 07: Steps carry id and duration

**What to build:** Every step event carries an id: a "started" event gets a new id, and its "done" event carries the same id plus its duration in milliseconds. The clock is injectable. `takeTurn` creates one Steps and passes it to `matchItems`, which takes Steps instead of building its own from options, so the signal and the step callback travel together. The chat route maps events to its stream without a queue (seconds from the duration) and the Conversation Log records them without a queue. The Owner still sees the steps of a turn with their seconds, and two steps of the same kind running at the same time (two Items chosen in parallel) each show their own seconds.

**Blocked by:** None (can start immediately)

**Status:** resolved

- [x] Started and done events share an id; done carries the duration in milliseconds
- [x] The Steps clock is injectable; tests use a fake clock
- [x] `matchItems` takes a Steps object from `takeTurn`
- [x] The chat's step tracker and the Conversation Log's step recorder have no pairing queues and keep only mapping tests
- [x] A test covers two parallel steps of the same kind, each with its own duration
- [x] `pnpm check` is green

## Comments

- `stepsFrom` in `src/core/order-conversation/steps.ts` numbers steps from 1 per Steps object and takes an optional `now` clock; a done event carries the started event's id and `durationMs`. `steps.test.ts` covers ids and durations with a fake clock, two parallel `choose-products` steps each with its own duration, and no done event when the work fails.
- `matchItems` takes `Steps` (default `stepsFrom()`); `takeTurn` passes its own, and the `takeTurn` steps test checks ids 1 to 4 across understanding the order, both Items and the cart. `matchOrder` in `eval-run.ts` passes `stepsFrom({ signal })`.
- The route's `stepTracker` is gone: `stepTurnEvent` in `src/app/step-text.ts` maps each event (seconds from `durationMs`), tested in `step-text.test.ts`; `loggedSteps` lost its queue and clock and keeps one mapping test.
