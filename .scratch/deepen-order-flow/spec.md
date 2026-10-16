Status: resolved

# Deepen the order flow: Order, Cart, LLM checks, Selection, Item lines and Steps

## Problem Statement

Every rule about how an order moves through a conversation lives inside `takeTurn`, mixed with the calls to the LLM, the Catalog Snapshot search and Carrefour. How an Item goes from read to asked to in the cart, the limit of two questions per Item, Corrections, marks on changed lines and the Notes under the cart are spread over one 450-line module. The question limit is checked in four places. The only way to test any of these rules is to run a whole turn with fakes of three LLM methods, three Online Store methods and a ten-product catalog; the test file has grown past 1100 lines and new behaviour keeps landing there.

The seams around `takeTurn` leak too:

- The cart simulation does not say which Candidate it bought. `takeTurn` finds it again by matching product and quantity, which only works while the cart copies the Candidate's quantity unchanged. A flag on each Item tells the cart to skip simulating it, and the rule that a Note is shown only once is split between the cart and `takeTurn`.
- The rules for what call 2 and `read-reply` may answer (a question exactly when nothing fits, at most five Alternatives, a choice only for an asked Item, one entry per Item, every asked Item left out read as unanswered) are enforced only inside the Claude Code adapter. Core repeats some of them as silent fallbacks, test fakes skip them, the eval set re-checks them in its own words, and the Anthropic API adapter that ADR 0006 expects would have to copy them.
- The Selection Policy is computed from three different price-per-unit functions, and the eval set builds its own pick next to the chat's instead of sharing it, so the eval can measure something other than what the Owner gets.
- The text format the LLM writes for an Item's size and quantity is defined twice (a zod regex in the adapter and parsing regexes in core), and measures are rounded with two different precisions.
- Two consumers of the step events, the chat's progress and the Conversation Log, each pair "started" with "done" on their own because a step carries no id or duration.

The Owner sees none of this directly, but every change to questions, Corrections or the cart costs more than it should, and some bugs (a Candidate found by the wrong key, a rule a second adapter forgets) can only show up through a whole turn.

## Solution

The order flow is reshaped into deeper modules with small interfaces, while the Owner's experience stays the same:

1. An **Order** module in core owns the state of the Items of one conversation and every rule about them: questions and their limit, Corrections, marks, the Notes it adds and the text of the questions message. It is pure: data in, data out. `takeTurn` only sequences the ports and hands their answers to the Order.
2. The **Cart** module returns, per Item, the Candidate it bought with its line and Notes, and owns every Note on a line. Items already in the cart are kept by kind, not by flag.
3. The checks on the outputs of call 2 and `read-reply` move into core, next to their ports, so every adapter, every fake and the eval set go through the same rules. The adapter keeps prompts and output schemas.
4. One **Selection** module in core chooses Candidates for an Item and ranks them by the Selection Policy, with one price-per-unit rule, and it takes its prices either from simulation (the chat) or from the Catalog Snapshot (the eval set).
5. The **Item** module owns the text format of an Item's size and quantity and the rounding of measures; the adapter's output schema is built from it.
6. **Steps** gives every step an id and a duration, so the chat and the Conversation Log stop pairing events themselves.

Behaviour visible to the Owner does not change: the same messages, questions, cart, Notes and link for the same LLM and Carrefour answers. ADR 0012's flow, including the cut of ten Candidates by snapshot price before simulation, stays as it is.

## User Stories

1. As the Owner, I want the same questions, cart and Notes I get today after this change, so that a refactor never shows up in my order.
2. As the Owner, I want an Item I left unanswered asked again once and then dropped with a Note, so that the limit of two questions keeps working exactly as before.
3. As the Owner, I want a Correction to an Item in the cart to rerun only that Item and mark its line as changed, so that I see what moved.
4. As the Owner, I want Items I add after the cart marked as new, so that I find them in the table.
5. As the Owner, I want a Note about an Item already in the cart not repeated when the cart is shown again, so that the table stays readable.
6. As the Owner, I want the reason of a line kept from the previous cart, so that I still know why it was picked.
7. As the Owner, I want the Notes under the table in the order they appear today (dropped Items, Items not got, removed Items, the ignored preference), so that the cart reads the same.
8. As the Owner, I want a product that runs out between the per-Candidate simulation and the whole cart replaced by the next one with a Note, so that I still get a full cart.
9. As the Owner, I want the promotion hint ("Llevando N sale ...") on a line as today, so that I can decide to buy more.
10. As the Owner, I want the steps shown while a turn runs with their seconds, so that I know the app is working.
11. As the Owner, I want two steps of the same kind running at the same time (two Items chosen in parallel) each shown with its own seconds, so that the progress is right.
12. As the Owner, I want an invalid LLM answer to end the turn with an error as it does today, so that I never get a cart built from a broken answer.
13. As a developer, I want to test re-asking, dropping after two questions, Corrections, drops, choices and marks by passing an Order and a read reply and checking the next Order, so that I need no fakes for rules that have no I/O.
14. As a developer, I want the question limit checked in one place, so that changing it is one edit and one test.
15. As a developer, I want the Order to say which Items need matching after a reply and to take the results back in the original order, so that `takeTurn` holds no bookkeeping of positions.
16. As a developer, I want the Order to build the `read-reply` input from its own Items, so that the numbering the LLM sees and the numbering the Order reads back come from one place.
17. As a developer, I want the Order to say either "ask these questions" or "buy these Items", so that `takeTurn` never inspects Item kinds.
18. As a developer, I want the Order to take the simulated cart and give back the next state and the Cart shown, so that marks and Order-level Notes live with the Order.
19. As a developer, I want `takeTurn` tests to cover only wiring (stages, which ports are called, steps, abort), so that the test file shrinks and each rule has one home.
20. As a developer, I want the cart simulation to return the Candidate bought per Item, so that no caller looks it up by product and quantity.
21. As a developer, I want an Item already in the cart passed to the cart as "keep this Candidate with this reason", so that no flag changes what a field means.
22. As a developer, I want the cart to own every Note on a line, including that a kept Item shows no Notes again, so that "a Note is shown once" has one home.
23. As a developer, I want cart tests with an Online Store fake to check the whole result per Item, including the Candidate, the line and its Notes, so that the cart is tested through its interface.
24. As a developer, I want the call 2 rules (Fits and Alternatives among the Matches, a question exactly when nothing fits, no Alternatives while something fits, at most five Alternatives) checked in core, so that a second LLM adapter gets them for free.
25. As a developer, I want the `read-reply` rules (entries for listed Items only, one per Item, a choice only for an asked Item and within its Alternatives, a question on an unanswered Item in the cart, every asked Item left out read as unanswered) checked and normalized in core, so that `takeTurn` never needs a fallback for a missing entry.
26. As a developer, I want test fakes of the LLM to pass through the same checks, so that a fake cannot return an answer the real adapter would reject.
27. As a developer, I want the eval set's answer cases to run `read-reply` through the same core checks as the chat, so that the eval measures what the Owner gets.
28. As a developer, I want the core checks to fail with a message that names the task, the Item and the broken rule, so that the Conversation Log and the eval report still explain a bad answer.
29. As a developer, I want the Claude Code adapter to keep only prompts, output schemas and parsing, so that its tests are about talking to Claude Code.
30. As a developer, I want one price-per-unit rule used by the size rule, the cut of Candidates and the Selection Policy, so that the three cannot drift apart.
31. As a developer, I want the Selection module to rank Candidates from either simulated prices or snapshot prices, so that the chat and the eval set share the same pick.
32. As a developer, I want one table of Selection Policy cases run with both price sources, so that a rule change is tested once.
33. As an operator running the eval set, I want the pick scored with the same Selection the chat uses, priced from the snapshot, so that a pass means the chat would pick it too.
34. As a developer, I want the size and quantity text formats defined once in the Item module, so that the schema sent to Claude Code and the parser accept the same strings.
35. As a developer, I want one rounding of measures used by Item parsing, Catalog Snapshot sizes and Candidates, so that "the same size" means the same everywhere.
36. As a developer, I want one table of line texts to Items in the Item tests, so that every accepted and rejected format is in one place.
37. As a developer, I want each step event to carry an id, and each "done" to carry its duration, so that consumers only render or record them.
38. As a developer, I want the clock of Steps injectable, so that durations are testable without timers.
39. As a developer, I want `takeTurn` to pass one Steps object down to matching, so that the signal and the step callback travel together.
40. As a developer, I want the chat's step tracker and the Conversation Log's step recorder to lose their own pairing queues, so that both are a few lines with no state.
41. As a coding agent, I want each rule of the order flow to live in one named module that its tests sit next to, so that I can find and change it without reading `takeTurn` end to end.
42. As a coding agent, I want `ARCHITECTURE.md`, `docs/LLM.md` and `docs/TESTING.md` to describe the new modules and where checks run, so that the docs lead me to the right place.
43. As a developer, I want `pnpm check` green after each step of this work, so that the refactor can stop at any ticket.

## Implementation Decisions

- **Order module (new, core, in the order-conversation feature).** Pure, no ports. It owns the Items of one conversation and their kinds (ready to buy, asked, in the cart), questions spent, marks, dropped and removed Notes, the ignored preference flag and whether the cart was shown. Its interface, in words:
  - start from the postal code, the matched Items and whether a preference was ignored;
  - list the Items for `read-reply` (asked and in the cart, numbered as the LLM sees them);
  - apply a checked `read-reply` output, which returns the next Order and the Items that need matching (corrected, rewritten or new);
  - take the match results for those Items back in, in the same order it gave them out;
  - say what comes next: either the questions message (text plus each question's options) or the Items to buy;
  - take the cart result and return the next conversation state plus the Cart shown with marks and the Notes under the table.
  The question limit, the dropped and removed Note texts, the questions hint and the questions message text move here. `ConversationState` is still the serializable state the app stores between turns.
- **`takeTurn`** keeps its interface (state, reply text, dependencies, step callback) and its postal-code stage. For the other stages it calls the ports through the core helpers below and hands every answer to the Order. It holds no Item rules.
- **Cart module (product-selection).** The simulation takes, per Item, either "choose among these Candidates" or "keep this Candidate with this reason", replacing the `kept` flag. It returns per Item either "bought" with the chosen Candidate, its line and its Notes, or "not got" with its Note, plus the total and the cart link. A kept Item comes back with its reason and no Notes. The warning to empty the Carrefour cart is still part of what the Cart shown carries. The Order adds marks and the Order-level Notes; the cart adds nothing the Order owns.
- **LLM output checks (core, order-matching).** Core gets one function per LLM task that calls the port and checks the answer against the input: call 2 (`fitProducts`) and `read-reply`. The read-reply check also adds an "unanswered" entry for every asked Item the answer left out and sorts entries by Item number, so its output always has one entry per listed asked Item. A broken rule throws an error naming the task, the Item and the rule. `matchItems`, `takeTurn` and the eval set's answer cases call these functions, never the port directly. The fallbacks in core (`entry ?? unanswered`, the slice to five Alternatives) are removed. The Claude Code adapter keeps zod schemas, prompt rendering and line parsing (ADR 0006 keeps LLM output schemas in the adapter; these checks are cross-references to the input, not schemas).
- **Call 1** (`parseOrder`) needs no cross-reference check beyond what the Item module parses.
- **Selection module (product-selection).** It merges choosing Candidates (size rule, Sale Step, by-weight versus packaged, the cut of ten by snapshot price per unit from ADR 0012) with the Selection Policy (savings first, then lowest price per unit, then lowest `itemId`, ADR 0011). It takes prices from a source: simulation per Candidate in the Branch, or the snapshot price. One price-per-unit rule is used everywhere, including when the size rule breaks a tie between the most common sizes. The cart uses it with simulated prices; the eval set's pick uses it with snapshot prices and stops composing its own.
- **Item module (order-matching).** It owns the text grammar of a line's size and quantity and turns a line's fields into an Item or a parse failure. It exposes the patterns so the adapter's output schema is built from them, keeping the structured-output constraint sent to Claude Code. One rounding of measures, to thousandths of the base unit (ml, g), is shared by Item parsing, Catalog Snapshot sizes and Candidates.
- **Steps (order-conversation).** A started event carries a new id; a done event carries the same id and its duration in milliseconds. The clock is injectable. `takeTurn` creates one Steps and passes it to `matchItems`, which takes Steps instead of building its own from options. The chat route maps events to its stream without a queue (seconds from the duration); the Conversation Log records them without a queue.
- **Glossary.** Add **Order** to `GLOSSARY.md`: the Items of one conversation and where each stands (read, asked, in the cart), from the first message to the last cart.
- **Docs.** `ARCHITECTURE.md` describes the Order and Cart split in an order end to end; `docs/LLM.md` says the checks run in core, not in the adapter; `docs/TESTING.md` names the Order tests as the home of conversation rules and `takeTurn` tests as wiring.
- **No ADR changes.** ADR 0006 (three ports, schemas in the adapter), ADR 0011 (Selection Policy) and ADR 0012 (two calls, cut of ten Candidates) stand.

## Testing Decisions

- A good test checks external behaviour through a module's interface: what goes in, what comes out, what a port was asked. It does not check how state is stored or which private function ran.
- **Order**: plain data tests, no fakes. Build an Order, apply a read reply or match results, check the next Order, what it asks or what it buys, and the Cart shown. This is where re-asking, dropping after two questions, Corrections on Items in the cart, drops, choices, new Items, marks and Order-level Notes are tested. Most of today's `takeTurn` rule tests move here.
- **`takeTurn`**: wiring only, with today's fakes: each stage calls the right ports with the right input, steps are emitted, an abort stops the turn, an invalid LLM answer ends it with an error, and one end-to-end order from text to cart.
- **Cart**: through `simulateCart` with an Online Store fake, checking each Item's full result (Candidate, line, reason, Notes) for promotions, discounts, a product that runs out in the whole-cart simulation, kept Items and Items not got. Prior art: the existing cart behaviour covered in `take-turn.test.ts` and `selection-policy.test.ts`.
- **LLM checks**: pure tests of each check with an input and an output, one per rule, plus that read-reply fills unanswered entries. Prior art: the rule tests in `claude-code-llm.test.ts`, which move to core; the adapter keeps tests for prompts, schemas, parsing and the process.
- **Selection**: one table of cases run with both price sources. Prior art: `candidates.test.ts` and `selection-policy.test.ts`.
- **Item**: one table of line texts to Items or failures, and a test that the adapter schema accepts exactly what the parser accepts. Prior art: `item.test.ts`.
- **Steps**: ids and durations with a fake clock. The route's tracker and `loggedSteps` keep only mapping tests. Prior art: `conversation-log.test.ts`.
- The eval set is not a test (`docs/TESTING.md`); `pnpm order:eval-set` keeps validating it, and scoring tests keep running over fixed inputs.

## Out of Scope

- Any change to what the Owner sees: messages, question text, cart columns, Notes wording, the cart link.
- Changing ADR 0012's cut of ten Candidates by snapshot price. Reopen it only if the eval set shows promoted products missed because of the cut.
- A second LLM adapter (Anthropic API) or moving the search to Postgres.
- The app's types: `turn-events` re-exporting types from `takeTurn`, the page importing the postal-code question, and the Cart carrying whole Catalog Snapshot products to the browser.
- Prompt changes or new eval cases.

## Further Notes

- This spec comes from an architecture review of the hot spots in recent history (`takeTurn`, order matching, product selection and the Claude Code adapter). The six parts can ship as separate tickets. Suggested order: the LLM checks first, so the Order can rely on one entry per asked Item; then the Order module; then the Cart, which touches the same code; Selection, Item and Steps after, in any order.
- Every ticket ends with `pnpm check` green and updates the docs it touches.
