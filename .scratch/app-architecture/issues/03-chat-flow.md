# 03: Chat flow

Type: prototype
Status: resolved
Blocked by: none

## Question

How does the Owner's chat behave, replacing `pnpm order`: turns, how questions in doubt are asked and answered, where conversation state lives (client, server, both) between turns, how long-running LLM and Carrefour calls are shown, and what the final answer shows (products, quantities, prices, total, reasons)?

## Answer

Decided with the Owner by reacting to a throwaway prototype with three variants (classic chat; chat plus a live order panel answered per item; one question per screen). Prototype: branch `prototype/chat-flow`, commit `0cca765`, file `.scratch/app-architecture/prototypes/chat-flow-prototype.html`.

The Owner chose variant A, the classic chat:

- Turns: the Owner writes the order as free text; the app answers with all open questions in one message, numbered, as `pnpm order` does today (same question texts as `resolve-order`, postal code asked last when missing). Each question with options shows them as clickable chips that append to the reply, plus a "cualquiera" chip; the Owner can also type the whole reply in one message. Unclear answers re-ask the remaining questions. Once nothing is left to ask, product selection runs with no extra confirmation.
- Progress: while the LLM and Carrefour work, a bot bubble lists the steps as they run (understanding the order, searching each item, translating the preference, Carrefour candidates, simulating the cart), each with a spinner, then a check and its seconds. Input is disabled while working.
- Final answer: a table with one row per line: product name, what the Owner asked for, the reason it was picked, notices, quantity, unit price and line total; then the total with postal code and Payment Card. Session count, time and cost are not shown to the Owner.
- State between turns lives on the server: the `OrderResolution` is kept in memory under a session id; the browser sends only the session id and the reply text. Restarting `pnpm dev` loses orders in progress, which is accepted. The Owner chose this over a stateless server after comparing both.
