---
Status: accepted
---

# The Assistant is an agent with tools over a persisted Chat; code still picks the products

The Assistant is meant to live in a channel such as WhatsApp, where there is one endless thread per person and no "new conversation". Today every conversation starts from nothing: the postal code is asked each time, the state lives in memory and dies with the page or the server (ADR 0004, ADR 0008), and a fixed state machine decides the order of steps (route, read, match, ask, cart). An Owner who ordered on Monday and writes "agregá yogur" on Friday cannot be understood.

The Assistant becomes one agent that reads the Chat and calls tools:

1. **The Chat is persisted and is the source of truth.** Every message, the Profile and every Order are saved as JSON in `.data/` through the loaders and savers of `src/compose.ts`. There is one Owner and no identity yet. Each turn the agent gets the Profile, the open Order, the last 3 closed Orders (Items and products, no prices) and the last 40 messages, and nothing else is remembered.
2. **The Profile is written by a tool.** When the Owner states their postal code, the agent saves it with a tool, says so, and never asks for it again until the Owner changes it.
3. **The agent decides what to say and when to act; code picks the products.** A tool resolves an Item from a description: code searches the Catalog Snapshot, call 2 of ADR 0012 keeps the Fits, and the Selection Policy of ADR 0011 picks among them with no question. Only when nothing fits does the tool return 3 Alternatives, and "más opciones" returns the next 3 not yet shown. The agent never names a product the tool did not return.
4. **Questions are a round, and a round is a message.** The agent asks through a tool that records a round of numbered questions with options and a recommended one, and ends the turn. The Owner's reply is the next message of the Chat, whatever the channel, so the same mechanism works on the web and on WhatsApp.
5. **Nothing is bought without confirmation.** The agent proposes the Order, the Owner confirms in the Chat, and only then a tool builds the cart. Code refuses to build a cart for a proposal the Owner has not answered.
6. **An Order closes when its cart link is given.** A clear Correction soon after reopens it; anything later starts a new Order, and the agent uses the closed Orders to ask "¿lo mismo que la última vez con yogur, o uno nuevo?" when it is not clear.
7. **The agent runs on AI SDK over a local Claude Code session.** `ToolLoopAgent` from `ai` with the community provider `ai-sdk-provider-claude-code`, which runs the local Claude Code CLI with the Owner's own login; the tools are core functions exposed to the session as an in-process MCP server. Moving to an API model later changes the model string, not the tools or the Chat.

This amends ADR 0004: the Owner still writes free text and is asked only when in doubt, but the Chat, the Profile and past Orders are kept. It amends ADR 0011: the postal code is stored; payment cards and preferences are still ignored. It amends ADR 0012: call 1 is gone, since the agent reads the Owner's words into tool calls; the search, call 2 and the code picking stay inside the tool. It amends ADR 0013: a Plan is built by the agent with a search tool instead of a search loop in core, under the same checks. It amends ADR 0006: the agent is reached through a port, and `ai` stays out of `src/core/`.

## Considered Options

- **A form with fixed slots driven by code.** Deterministic and easy to evaluate, but rigid: intents such as "algo para un asado de 8" do not fit slots, and every new kind of request needs a new state.
- **Rounds of questions with a recommended answer, then today's pipeline.** Close to the grilling skills, but it keeps the state machine and a second contract between the interview and the pipeline; the agent with an `askQuestions` tool gets the same rounds without it.
- **Let the LLM pick products from search results.** Breaks repeatability (ADR 0002): the same Items on the same catalog must give the same cart.
- **Keep the history in the Claude Code session (`--resume`).** The Chat would live inside the CLI, tied to one model and one machine, and could not be read by a WhatsApp adapter or migrated.
- **Client-side tools answered by the UI (`addToolOutput`).** The Claude Code provider rejects tools without `execute`, and WhatsApp cannot answer a tool call; a round as a message works for both.

## Consequences

- A turn is less repeatable than the state machine: the same message may lead to different questions. The products are still repeatable, and an agent eval set measures the rest.
- The provider is unofficial and ignores `temperature`, `seed` and any `toolChoice` other than `auto`; a throwaway prototype checks it before anything is rewritten.
- The Owner's Claude Code login serves every turn. Whether that subscription may serve other people is not verified and must be before the Chat opens to anyone else.
- `takeTurn`, the Topic router, the in-memory sessions and the order and planning eval sets are replaced in stages, each deleted only once the agent covers what it did.
