# 07: Steps carry id and duration

**What to build:** Every step event carries an id: a "started" event gets a new id, and its "done" event carries the same id plus its duration in milliseconds. The clock is injectable. `takeTurn` creates one Steps and passes it to `matchItems`, which takes Steps instead of building its own from options, so the signal and the step callback travel together. The chat route maps events to its stream without a queue (seconds from the duration) and the Conversation Log records them without a queue. The Owner still sees the steps of a turn with their seconds, and two steps of the same kind running at the same time (two Items chosen in parallel) each show their own seconds.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Started and done events share an id; done carries the duration in milliseconds
- [ ] The Steps clock is injectable; tests use a fake clock
- [ ] `matchItems` takes a Steps object from `takeTurn`
- [ ] The chat's step tracker and the Conversation Log's step recorder have no pairing queues and keep only mapping tests
- [ ] A test covers two parallel steps of the same kind, each with its own duration
- [ ] `pnpm check` is green
