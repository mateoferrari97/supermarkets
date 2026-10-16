# How do real assistants turn an open-ended intent (a recipe, a week of meals, a gift) into a grounded cart, and how should this repo add it in front of the order flow?

Consulted 2026-10-16. Marks: **[V]** verified in the cited page, file or command output, **[S]** found only in secondary sources (press, third-party blogs), **[?]** not verified (the primary page blocked fetching and only a search-engine excerpt was read, or no source was found), **[I]** my inference.

Web pages were read by a research subagent on 2026-10-16 with WebFetch (pages summarised by a small model; two PDFs were downloaded and their text extracted verbatim). Repo claims were checked by reading the files and running the commands named.

Builds on `.scratch/carrefour-cart/research/preference-to-selection-architectures.md` (Instacart Intent Engine, Rufus, Walmart, Mercado Libre, determinism) and `.scratch/order-resolution/research/llm-item-to-product-matching.md`. Neither is repeated here.

Primary sources:
- Instacart Developer Platform, Create recipe page: https://docs.instacart.com/developer_platform_api/api/products/create_recipe_page
- Instacart Developer Platform, Create shopping list page: https://docs.instacart.com/developer_platform_api/api/products/create_shopping_list_page
- Instacart Developer Platform, recipe concepts: https://docs.instacart.com/developer_platform_api/guide/concepts/recipe/
- Instacart Developer Platform, MCP tutorial: https://docs.instacart.com/developer_platform_api/guide/tutorials/mcp
- Instacart ChatGPT plugin (2023): https://company.instacart.com/updates/instacart-chatgpt
- Ask Instacart: https://company.instacart.com/updates/bringing-inspirational-ai-powered-search-to-the-instacart-app-with-ask-instacart
- Instacart AI assistant (2026): https://company.instacart.com/updates/instacarts-ai-assistant-powered-by-14-years-of-grocery-expertise
- Instacart Intent Engine: https://company.instacart.com/tech-innovation/building-the-intent-engine-how-instacart-is-revamping-query-understanding-with-llms
- Amazon Science, technology behind Rufus: https://amazon.science/blog/the-technology-behind-amazons-genai-powered-shopping-assistant-rufus
- AWS, Rufus on Amazon Bedrock: https://aws.amazon.com/blogs/machine-learning/how-rufus-scales-conversational-shopping-experiences-to-millions-of-amazon-customers-with-amazon-bedrock
- Walmart, Sparky: https://corporate.walmart.com/news/2025/06/06/walmart-the-future-of-shopping-is-agentic-meet-sparky
- Shopify Global Catalog MCP: https://shopify.dev/docs/agents/catalog/global-catalog
- Shopify Storefront MCP: https://shopify.dev/docs/apps/build/storefront-mcp
- Shopify Engineering, building production-ready agentic systems (Sidekick): https://shopify.engineering/building-production-ready-agentic-systems
- Klarna press releases: https://www.klarna.com/international/press/shopping-made-smarter-klarna-adds-more-ai-features-to-its-assistant-powered-by-openai/ ; https://investors.klarna.com/News--Events/news/news-details/2026/Klarna-launches-AI-powered-Shopping-Search-app-in-ChatGPT/default.aspx
- Carrefour, Hopla press release (June 2023, PDF): https://www.carrefour.com/sites/default/files/2023-06/Press%20Release%20-%20Carrefour%20integrates%20OpenAI%20technologies%20and%20launches%20a%20generative%20AI-powered%20shopping%20experience%20(1).pdf
- Picnic, search retrieval with LLMs: https://jobs.picnic.app/en/blogs/enhancing-search-retrieval-with-large-language-models-llms
- Cherrypick (recipe-to-basket), how to build a robust LLM application: https://www.chrismdp.com/how-to-build-a-robust-llm-application/
- Agentic Commerce Protocol: https://github.com/agentic-commerce-protocol/agentic-commerce-protocol ; https://www.agenticcommerce.dev/ ; https://developers.openai.com/commerce/specs/checkout.md ; https://developers.openai.com/commerce/specs/api/products.md
- Universal Commerce Protocol: https://developers.googleblog.com/under-the-hood-universal-commerce-protocol-ucp/ ; https://ucp.dev
- Google agentic checkout: https://blog.google/products-and-platforms/products/shopping/agentic-checkout-holiday-ai-shopping/
- AP2: https://ap2-protocol.org/
- Anthropic, Building effective agents: https://www.anthropic.com/engineering/building-effective-agents
- Anthropic, multi-agent research system: https://www.anthropic.com/engineering/multi-agent-research-system
- Claude docs, guardrails: https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/reduce-hallucinations ; https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/mitigate-jailbreaks ; https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/increase-consistency
- OpenAI Agents SDK, guardrails and handoffs: https://openai.github.io/openai-agents-python/guardrails/ ; https://openai.github.io/openai-agents-python/handoffs/
- OpenAI, A practical guide to building agents (PDF): https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf
- MCP specification, tools and resources: https://modelcontextprotocol.io/specification/2025-06-18/server/tools ; https://modelcontextprotocol.io/specification/2025-06-18/server/resources
- ShoppingBench (arXiv abstract): https://arxiv.org/abs/2508.04266
- Repo: `ARCHITECTURE.md`, `GLOSSARY.md`, `docs/LLM.md`, `docs/adr/0002`, `0004`, `0011`, `0012`, `src/core/order-conversation/take-turn.ts`, `src/core/order-conversation/order.ts`, `src/core/order-matching/llm.ts`, `src/core/order-matching/item.ts`, `src/core/order-matching/eval-set.ts`, `src/adapters/claude-code/claude-code-llm.ts`, `src/adapters/catalog-search/in-memory-catalog-search.ts`, `src/compose.ts`, `src/app/turn-events.ts`, `prompts/order-matching/parse-order.md`, the Conversation Log `.data/conversations/2026-10-16-115414-ed504865-90c8-4c34-940f-b6afcc39bf18.jsonl` (not committed).

## Answer

1. Every shipped product with a public description splits the work the same way: the LLM turns the intent into a **structured list of needs in generic words with measurements**, and the retailer's own search resolves each line to products; the user confirms before anything is bought. Instacart's Developer Platform is the clearest primary example: an LLM writes `ingredients[]` with `name`, `display_text`, `measurements[]` and `filters`, and "Instacart uses the product name as a search term" [V]. Carrefour's Hopla was "connected to the site's search engine" [V]. That is the same seam as this repo's `parse-order` → `CatalogSearch` → `fit-products`.
2. The patterns the vendors recommend are a **workflow, not a multi-agent system**: route the message, chain a planning call into the existing calls, check each step in code, and confirm with the user before the irreversible step (Anthropic, OpenAI guide, Shopify Sidekick) [V]. Off-topic requests are caught by a cheap relevance classifier or input guardrail that runs before the expensive model (OpenAI guide and Agents SDK, Instacart's "only food-related questions") [V].
3. For this repo I recommend **Option B below**: a new `route-message` task and a new `plan` task (no tools, no catalog), a `planning` stage in `ConversationState`, and a Plan whose lines use the same strings as `parse-order` lines plus a `purpose`. On the Owner's confirmation the lines enter `matchItems` directly, and the Plan stays in the Order so the final reply returns the idea and the cart together. Grounding through a catalog search tool (Option C) is the next step only if the eval set shows the planner's words keep missing the catalog, and gift ideas need it most because the search leaves out toys and electronics.

## Findings

### A. Real-world solutions

#### Instacart

- [V] Create recipe page: `POST https://connect.instacart.com/idp/v1/products/recipe` with `title`, `ingredients[]` and optional `servings`, `instructions[]`, `cooking_time`, `author`. Each LineItem has `name` (required; used as the search term), `display_text`, `product_ids[]` or `upcs[]`, `measurements[]` of `{quantity, unit}` and `filters` `{brand_filters[], health_filters[]}`. The response is a `products_link_url` the partner caches and reuses. Source: IDP Create recipe page.
- [V] Create shopping list page: `POST /idp/v1/products/products_link` with `title` and `line_items[]`; `link_type` is `shopping_list` or `recipe`. Source: IDP Create shopping list page.
- [V] Best practice: a generic `name` "with no weight, quantity, or brand", prep details in `display_text`, which is not used for matching. Several measurements in different units are advised because "Some units cannot be directly converted into others". The store selector lists only stores carrying at least 40% of the ingredients; the shopper can mark pantry items. Source: IDP recipe concepts.
- [V] The IDP exposes `create-recipe` and `create-shopping-list` as MCP tools at `https://mcp.instacart.com/mcp`. Source: IDP MCP tutorial.
- [V] The 2023 ChatGPT plugin let ChatGPT suggest meals and then "add all of the necessary ingredients to your Instacart cart"; it was "a custom, constrained tool that will be triggered only in response to relevant food-related ChatGPT questions". The page does not say how ingredients became products. Source: Instacart ChatGPT plugin.
- [V] Ask Instacart is "a highly specialized model designed to only respond to relevant food-related questions". Source: Ask Instacart.
- [V] The 2026 assistant builds a cart "from live inventory at your chosen retailer", suggests replacements for items out of stock and "does not finalize anything without explicit action from you". Source: Instacart AI assistant (2026).
- [S] The ChatGPT app with Instant Checkout (December 2025) runs on ACP and Stripe; the investor release did not render.
- Pros [I]: the seam is small and testable (a list of lines with measurements); the retailer keeps search, pack sizes and stock. Cons [V]: units that do not convert, brand filters that need exact catalog spelling (IDP docs). [S] AI-generated recipe images showing impossible food (404 Media, 2024: https://www.404media.co/instacarts-ai-recipes-look-literally-impossible/).

#### Carrefour (Hopla, France)

- [V] Hopla (June 2023, GPT-4 on Azure OpenAI, with Bain and Microsoft) helps customers choose products "based on their budget, food constraints they may have or menu ideas", offers "anti-waste solutions for reusing ingredients and composing associated recipes and baskets", and "is connected to the site's search engine and offers customers lists of products related to what they are discussing, right up until they make their purchase". Source: Carrefour press release PDF.
- [?] Hopla+, an "AI agent" building a basket by budget and food preferences, is described in the 2025 universal registration document (search excerpt only). The Q1 2026 release lists a ChatGPT integration of Carrefour's offer under "Agentic e-commerce" (https://www.carrefour.com/sites/default/files/2026-04/Press%20release%20Carrefour%20Q1%202026.pdf, search excerpt only).
- [S] The basket is validated in ChatGPT and paid on carrefour.fr; Carrefour joined UCP (https://www.presse-citron.net/carrefour-debarque-sur-chatgpt-voici-comment-lia-va-faciliter-vos-courses/).
- How the menu becomes search queries, and whether quantities are scaled, is not published: not verified.

#### Amazon Rufus

- [V] A custom LLM trained mainly on shopping data, with retrieval over catalog, reviews and Q&A, and calls to "relevant Stores APIs"; answers stream and the model "is trained to generate markup instructions" for how elements are displayed. Source: Amazon Science.
- [V] Queries are routed per type across Amazon Nova, Claude Sonnet and the in-house model; gift ideas and trip planning go to the models with deeper reasoning. Tools (order history, live catalog and prices, web search) are called in parallel, with prompt caching; quality is judged by an LLM-as-judge. Source: AWS blog on Rufus.
- [S] Failures: non-TVs listed for "TVs for gaming", cheapest options not returned when asked (https://www.consumeraffairs.com/news/amazons-ai-shopping-assistant-rufus-is-often-wrong-110724.html).
- [I] Relevance here: the routing of gift ideas to a stronger model matches a separate `plan` task with its own model and effort in `TASK_MODELS`.

#### Walmart Sparky

- [V] Asking for party ideas starts a planning session covering "theme, decorations, food, and gifts", personalised and within budget; meal plans whose ingredients go into the cart are announced as planned. No architecture is disclosed. Source: Walmart, Sparky.
- [S] Claims that Sparky is "4 super agents via MCP" or RAG have no primary source.

#### Shopify

- [V] Global Catalog MCP (`https://catalog.shopify.com/api/ucp/mcp`): `search_catalog` with `query`, `context` (country, postal code, intent) and filters (`available`, `ships_to`, `price` in minor units, `categories`, ...), `lookup_catalog` (IDs come back `not_found` when unresolved) and `get_product` with `preferences`, the order in which options are relaxed when nothing matches exactly. Source: Shopify Global Catalog MCP.
- [V] Cart tools `create_cart`, `get_cart`, `update_cart` (which "replaces the full cart") and `cancel_cart`. Source: Shopify Storefront MCP.
- [V] Sidekick lessons: behaviour degraded past about 50 tools and was fixed with "just-in-time instructions" returned with tool results; evaluation uses ground-truth sets labelled by at least three experts and a judge calibrated to Cohen's κ 0.61 against a human ceiling of 0.69; a simulator replays real conversation goals; during reward training the model hallucinated IDs and enum values; "avoid multi-agent designs early". Source: Shopify Engineering.

#### Klarna

- [V] The assistant is "fully integrated with Klarna's price database of 5.6 million products" and turns open-ended research questions into recommendations (September 2024). The 2026 Shopping Search app in ChatGPT uses Klarna's Product Search MCP server and "redirects users to the merchant's site". Sources: Klarna press releases.

#### Picnic and Cherrypick

- [V] Picnic: an LLM (GPT-3.5-turbo) rewrites each search term into a product or recipe description, embedded with text-embedding-3-small and matched in OpenSearch; about 99% of terms are precomputed for latency. Named failures: output drift after model updates, ambiguous terms ("ice"), words that mean different things by country. Source: Picnic blog.
- [V] Cherrypick (UK recipe-to-basket): recipes are filtered by diet in code before the prompt; one LLM call per meal plan returns JSON; recipe IDs are "checked against our provided context to ensure they were not hallucinated"; a "25% failure rate" is absorbed by retries; a chat UI was rejected because of "hundreds of calls per shop". Plans were changed 30% less and used in baskets 14% more. Source: chrismdp.com.
- Ocado: no LLM or recipe assistant post found, not verified. Whisk / Samsung Food: [S] only (https://venturebeat.com/ai/how-whisk-is-using-its-food-genome-to-turn-recipes-into-smart-shopping-lists).

#### Mercado Libre

- [?] No primary source for a buyer-facing generative shopping assistant; [S] it is reported in testing (https://www.innovaciondigital360.com/i-a/mercado-libre-revelo-como-usa-ia-para-vender-mas-y-mejorar-uno-de-sus-negocios-mas-rentables/). Its LLM layer before search is covered in `preference-to-selection-architectures.md`.

#### Agentic Commerce Protocol, ChatGPT Instant Checkout, UCP, AP2

- [V] ACP (OpenAI and Stripe, beta): the merchant implements `POST /checkout_sessions` with `items[{id, quantity}]`, updates, `/complete` with a payment token and `/cancel`; ChatGPT calls them "once the customer clicks 'Buy'". The product feed carries products with `variants` (`id`, `title`, `price` in minor units, `availability`). The merchant stays merchant of record. Sources: ACP repo, agenticcommerce.dev, OpenAI checkout and product feed specs.
- [?] March 2026: OpenAI let merchants use their own checkout and focused on product discovery; CNBC reported problems with product data accuracy, multi-item carts and loyalty, and Walmart a conversion three times lower inside ChatGPT (search excerpts; https://www.cnbc.com/2026/03/24/openai-revamps-shopping-experience-in-chatgpt-after-instant-checkout.html).
- [V] UCP (Google with Shopify, Etsy, Wayfair, Target, Walmart; January 2026): a manifest at `/.well-known/ucp`, capabilities Catalog, Cart, Checkout, Identity Linking and Order, over REST, JSON-RPC, MCP or A2A. [?] A checkout in `requires_escalation` must carry a `continue_url`, the hand-off to the human. Sources: Google developers blog, ucp.dev.
- [V] Google's agentic checkout "asks your permission first" and buys only after the user confirms. AP2 chains signed mandates into an audit trail. Sources: Google blog, ap2-protocol.org.
- [I] For this repo: both protocols are the checkout end, which the repo already solves with a cart link the Owner opens and pays (`ARCHITECTURE.md`, step 8). They are not needed for the planner; they confirm the pattern of an assistant that fills a cart and leaves the purchase to the human.

#### Agent-building guidance

- [V] Anthropic: workflows are "predefined code paths", agents direct their own tool use; routing fits "distinct categories" and sending easy queries to cheaper models; prompt chaining fits fixed subtasks with programmatic checks between them; orchestrator-workers fits subtasks that cannot be predicted; start with "the simplest solution possible"; guardrails work better as a separate model instance screening the input. Source: Building effective agents.
- [V] Anthropic's multi-agent research system used about 15 times the tokens of chat and is a poor fit when agents must share context; evaluation can start with about 20 queries and an LLM judge with a rubric. Source: multi-agent research system.
- [V] Claude docs: let the model say "I don't know" and restrict it to provided documents to reduce hallucinations; screen input with a small model and a structured boolean; set the role in the system prompt with listed scenarios and their expected responses to keep it consistent. Sources: Claude guardrail docs.
- [V] OpenAI guide: "maximize a single agent's capabilities first"; the manager pattern suits workflows "where you only want one agent to control workflow execution and have access to the user"; guardrails include a relevance classifier "flagging off-topic queries"; hand over to a human on high-risk actions such as payments. Agents SDK: input guardrails run on the first agent, `run_in_parallel=False` "guarantees that the expensive model does not start", and the docs' example is a fast off-topic classifier; a handoff is a tool `transfer_to_<agent>`. Sources: OpenAI guide PDF, Agents SDK docs.
- [V] MCP: tools are "model-controlled" with an `inputSchema` and optional `outputSchema` (then the server MUST return conforming `structuredContent`); resources are "application-driven"; there "SHOULD always be a human in the loop with the ability to deny tool invocations". Source: MCP specification.

#### Published evaluations and failures

- [V] ShoppingBench (2.5M products): GPT-4.1 succeeds on fewer than half of the tasks with vouchers, budgets and several sellers. Source: arXiv 2508.04266.
- [V] Cherrypick's 25% generation failures and Shopify's hallucinated IDs (above).
- No published benchmark scores recipe-to-cart quantities or unit conversion: not verified.

### B. Architecture patterns and tradeoffs

#### Intent router versus one agent with tools

- [V] A router is a separate cheap call returning a closed label before the expensive one (Anthropic routing, OpenAI relevance classifier and input guardrail). Instacart and Ask Instacart restrict the scope at the tool and model level (above).
- [I] Pros of a router here: the existing order path is untouched for plain orders; the off-topic reply can be fixed text in code, which keeps "the LLM translates, code decides" (`docs/LLM.md`); each label is one eval case. Cons: one more call (latency, cost) on every message, and a misrouted order now fails before `parse-order` sees it.
- [I] One agent with tools (planner, order and search as tools, deciding itself): fewer moving parts in code, but it moves the choice of when to buy into the model, and the Claude Code adapter runs every session with no tools (`--tools ""` in `src/adapters/claude-code/claude-code-llm.ts`). Shopify and OpenAI both advise starting single but with a narrow tool set; Shopify saw trouble past 50 tools (above).

#### Planner producing a structured list for the existing matcher

- [V] The shipped seam is a list of generic names with measurements resolved by the retailer's search (Instacart IDP, Hopla, Picnic). Cherrypick validates every generated ID against the context and retries (above).
- [V] The repo already has the matcher half: `ItemLine` strings `{ original, product, brand, size, quantity }` parsed by `parseLine` (`src/core/order-matching/item.ts`), then `matchItems` (`src/core/order-matching/match-items.ts`).
- [V] The gap is documented: ADR 0004 left out "Expand a plan into Items ('un asado para 10')", because "That is creative work, not translation. A separate planner, whose list the Owner confirms before it enters this flow, comes later" (`docs/adr/0004-each-order-starts-from-free-text-and-asks-when-in-doubt.md`).
- [V] The Conversation Log of 2026-10-16 shows the cost of not having it: the asado message ("Somos aproximadamente 10 personas ... más o menos de 50.000 pesos") came back from `parse-order` as five lines (`Carne para asado`, `Ensaladas`, `Picada`, `Vino`, `Whisky`), four of them `quantity: "minimum"`, and `ignoredPreference: false` (`jq` over the `llm-call` events of the log named above).

#### Catalog grounding: search tool calls versus words checked afterwards

- [V] The planner's words matter: `pnpm order:label "Carne para asado"` lists dog snacks, Tramontina knives and cat food first, while `pnpm order:label asado` lists "Asado de Novillito x kg" and "Asado de Novillo x kg" first (command output, 2026-10-16).
- [I] Grounding options: (1) no catalog, the planner writes catalog-style words and the existing search and `fit-products` resolve them, with questions and Alternatives when nothing fits; (2) code runs `CatalogSearch` over the draft Plan before showing it and marks the lines with no Match, so the planner (or the Owner) fixes them; (3) the planner calls a search tool while it plans (Rufus, Hopla, Shopify `search_catalog`). (1) is free in code; (2) costs only a synchronous in-memory search (`findMatches` is synchronous, `src/core/order-matching/catalog-search.ts`); (3) needs tools in the adapter, more turns per session and a new kind of test fake.
- [V] Gifts hit a wall the meal planner does not: `CatalogSearch` drops the departments "Electro y tecnología", "Automotor", "Indumentaria", "Juguetería y Librería" and "Aire Libre y Ocio" (`EXCLUDED_DEPARTMENTS` in `src/adapters/catalog-search/in-memory-catalog-search.ts`). "Perfumería y farmacia" is searchable, which is why the perfume test worked: `pnpm order:label "perfume mujer"` returns perfumes, though Disney children's perfumes rank above "Perfume femenino Buckingham Polo Club Velvet 100 ml" (command output).
- [V] Size of those departments in the Catalog Snapshot of 2026-10-15, counted by the first segment of each product's first category (a `node` one-liner over `.data/carrefour/products.json`, not the loader's `department` field): Electro y tecnología 23,853; Juguetería y Librería 10,564; Aire Libre y Ocio 5,153; Indumentaria 3,088; Perfumería y farmacia 8,071; Gift Cards 70.

#### Keeping the idea attached to the order

- [V] Instacart keeps the recipe with its items: `title`, `servings`, `instructions[]` and per line `display_text` live in the same request as the `name` that is searched (IDP Create recipe page).
- [V] Today nothing in the Order can carry it: `Order` holds `postalCode`, `items`, `dropped`, `removed`, `ignoredPreference` and `cartShown` (`src/core/order-conversation/order.ts`), and an `Item` holds only `original`, `product`, `brand`, `size`, `quantity` (`src/core/order-matching/item.ts`). The Cart shown prints each line's `original` (`ARCHITECTURE.md`, step 8).
- [I] Two ways: put the Plan in the Order and give each Item a reference to its Plan line (the cart can then group lines by dish or by person), or write the Plan line's display text into `original`, which needs no new field but loses the grouping.

#### Scope guardrails

- [V] Vendor practice: a cheap classifier before the expensive model, with fixed scenarios in the system prompt (OpenAI guide, Agents SDK, Claude docs, Instacart).
- [I] Here the allowed topics are things bought at Carrefour Argentina: an order, a plan to cook or host, a gift from the searchable departments, a question about the current Plan or cart. Everything else gets fixed text. Whether the current flow already does something sensible with an off-topic message is not verified: no eval case or log covers it.

#### Evaluation

- [V] The eval set has 16 order cases and 6 answer cases (`node` over `evals/order-matching.json`); its schema is a `strictObject` with `cases` and `answers` only (`src/core/order-matching/eval-set.ts`), so a new kind of case needs a schema change; an order case cannot equal an example `<order>` of `prompts/` (`validateEvalSet`).
- [V] Vendors measure open-ended answers with judges calibrated against human labels and start small (Shopify κ, Anthropic about 20 queries with a rubric, Rufus LLM-as-judge).
- [I] What can be scored by code here: the router label per message; that every Plan line parses (`parseLine`); that headcount and budget are not lost (for example, a plan for 10 asks for more meat than a plan for 4, a range check on the summed `weight` quantities); that each line has a Fit in the Catalog Snapshot (search plus `fit-products`, as the order cases already do); and the product picked per line, by reusing the order-case scoring on the confirmed Plan's lines. The idea's quality (a sensible recipe, a fitting gift) needs a rubric judge or a person.

### C. Changes this repo needs

#### Where it sits

- [V] Today every message after the postal code goes straight to `parseOrder`: `turnFor` sends stage `order` to `orderTurn`, which calls `deps.llm.parseOrder` (`src/core/order-conversation/take-turn.ts`). `ConversationState` has the stages `postal-code`, `order`, `questions` and `cart`; `Reply` has `ask`, `questions` and `cart` (same file); the stream has `session`, `step-started`, `step-done`, `questions`, `cart` and `error` events (`src/app/turn-events.ts`).
- [V] The `Llm` port has three tasks, `parseOrder`, `fitProducts`, `readReply` (`src/core/order-matching/llm.ts`); the adapter maps each task to a prompt file and a model in `TASK_MODELS` and `PROMPT_FILES` (`src/adapters/claude-code/claude-code-llm.ts`); `compose.ts` wires one `Llm` per conversation with `onCall` writing `llm-call` events (`src/compose.ts`).

#### Option A: the planner writes order text

A `plan` task returns a Plan with an idea and a Spanish order text in catalog words with explicit amounts ("3 kg de asado de novillo, 1 kg de vacío, ..."); the Owner confirms; the text goes to `parseOrder` unchanged.

- Pros [I]: no change to the matcher or to `parse-order`; one entry point for Items; the smallest contract.
- Cons [I]: the same words are read twice, and `parse-order` can lose what the planner wrote (as it lost "10 personas" on 2026-10-16); nothing ties a cart line back to the dish it was for; the planner's output can only be checked after a second LLM call.

#### Option B: the planner returns structured lines that enter `matchItems` (recommended)

A `route-message` task labels each message; a `plan` task returns a Plan whose lines are `ItemLine` strings plus a purpose; the Owner iterates on it in a `planning` stage and confirms; code parses the lines with `parseLine` and runs `matchItems`, so questions, Alternatives, Candidates, the Selection Policy and the cart work as today.

- Pros [I]: the matcher and every rule after it are reused; the contract is the one the eval set already scores; each cart line keeps its Plan line, so the final reply can show the recipe or gift idea with the cart; it follows the Instacart IDP shape (named lines with measurements, resolved by the retailer's search).
- Cons [I]: two producers of Items (`parse-order` and `plan`), so the guardrails of `prompts/order-matching/parse-order.md` must be shared or repeated; the planner proposes quantities, which `docs/LLM.md` forbids ("Never let the LLM choose a price, compute a quantity or invent a product"), so an ADR must state that a quantity the Owner confirmed in a Plan counts as the Owner's own; one more call per message for the router.

#### Option C: Option B plus a catalog search tool for the planner

As B, but the planner session may call a `search_catalog` tool backed by `CatalogSearch` (an MCP server started by the adapter, or a code loop that runs the search between two planner calls) and writes words it has seen in the catalog.

- Pros [I]: the planner's words land in the catalog (the "Carne para asado" failure); gifts can be proposed from what is in stock; matches Hopla, Rufus and Shopify `search_catalog`.
- Cons [I]: the adapter runs every session with `--tools ""` and `--strict-mcp-config` (`src/adapters/claude-code/claude-code-llm.ts`), so it needs a new mode; longer and costlier sessions against a 15 s target already tight (ADR 0012, Consequences); harder fakes in tests; the planner sees products and prices, which pulls toward the LLM picking products (ADR 0002 and ADR 0012 rejected that). A lighter variant is grounding by code: run `findMatches` over the draft Plan and send the lines with no or weak Matches back to the planner once.

#### Option D: one agent with order tools

One Claude session owns the whole conversation and calls `parseOrder`, `matchItems` and `simulateCart` as tools.

- Pros [I]: the most flexible conversation.
- Cons [I]: it replaces the Order, the workflow that `order.test.ts` and `take-turn.test.ts` pin down (`docs/TESTING.md`); the model decides when to build a cart; every vendor guide above says to start simpler. Not recommended.

#### Recommendation

Option B, built so the code-side grounding of Option C can be added without changing the contract:

1. **Router.** New task `routeMessage(text, context, signal)` in `src/core/order-matching/llm.ts` (or a new feature folder, see below), prompt `prompts/<folder>/route-message.md`, output `{ route: "order" | "plan" | "question" | "off-topic" }`, on a small effort in `TASK_MODELS`. The off-topic reply is fixed Spanish text in core, with what the Assistant can do. Called in `turnFor` (`src/core/order-conversation/take-turn.ts`) for stage `order`, and for `planning`; whether it also runs in stages `questions` and `cart` (the turn-3 question of 2026-10-16) is an open decision of the handoff.
2. **Planner.** New task `plan({ request, plan, history }, signal)` with no tools; the Owner's dialogue history goes in the input, since each Claude Code session is stateless (`--no-session-persistence` in the adapter). Output, checked in core like `checkFitProducts`:

   ```ts
   type PlanOutput = {
     kind: "recipe" | "meals" | "event" | "gift";
     title: string;
     idea: string;
     people: number | null;
     budget: number | null;
     lines: (ItemLine & { purpose: string })[];
     questions: string[];
   };
   ```

   `lines` reuse the strings of `parse-order` so `parseLine` reads them; `purpose` is the dish or the person the line is for; `budget` is only read back, never applied by the LLM.
3. **State.** New stage `{ stage: "planning"; postalCode; plan; history }` in `ConversationState`, a new `Reply` kind `plan` and a new stream event `plan` in `src/app/turn-events.ts` (rendered in `src/app/chat.tsx` with a confirm action). On confirmation, code parses the lines and calls `matchItems` with them, then `startOrder` as `orderTurn` does today, with the Plan kept in the Order.
4. **The idea in the result.** `Order` gets `plan: Plan | null` and each Item a reference to its Plan line; `takeCart` (`src/core/order-conversation/order.ts`) returns the Cart with the Plan, and the chat shows the idea, then the lines grouped by `purpose`. A budget, if kept, is compared by code with the simulated total and becomes a Note, which needs an ADR amending ADR 0011.
5. **Where the code lives.** A new feature folder `src/core/planning/` (Plan, its checks, `checkedPlan`) and the router beside `take-turn.ts` follow ADR 0006 ("features inside the core"); the `Llm` port in `src/core/order-matching/llm.ts` grows two methods, or is split per feature. The Conversation Log needs no new event type: `llm-call` already records any task (`src/compose.ts`).
6. **Search fixes that help both paths.** The planner should write catalog words ("Asado de novillo", not "Carne para asado"); gifts need a decision on `EXCLUDED_DEPARTMENTS`, which today keeps toys, electronics and clothing out of every search.

#### Glossary terms to add (`GLOSSARY.md`)

- **Plan**: what the Assistant proposes for an intent the Owner states as a goal (a recipe, the week's meals, an event, a gift): the idea and the lines to buy, which the Owner can change and must confirm before they become Items.
- **Plan Line** (or **Need**): one line of a Plan, with what to buy, how much and what it is for.
- **Route** (or **Topic**): the kind of an Owner's message (an order, a plan, a question, off-topic).
- Conflict to settle: the Order entry already lists "shopping list" under `_Avoid_` (`GLOSSARY.md`), so "Shopping List" cannot be the new term.

#### Candidate ADRs

- 0013: A planner whose lines the Owner confirms comes before the order flow (amends ADR 0004 "Considered Options" and ADR 0012; states that a confirmed Plan quantity is the Owner's).
- 0014: Each message is routed, and off-topic messages get a fixed reply.
- Later, if chosen: a budget compared with the simulated cart (amends ADR 0011); gifts outside the grocery departments (changes `EXCLUDED_DEPARTMENTS`); a catalog search tool for the planner (amends ADR 0012 on what the LLM may see).

#### Eval additions

- **Route cases**: a message (and the stage it arrives in) with the expected route, including off-topic ones ("¿qué tiempo hace mañana?") and orders that look like plans ("leche y pan para el desayuno"). Scored exactly, several runs, as answer cases are.
- **Plan cases**: a request with checks code can run: every line parses, `people` and `budget` read back, required lines present by product words (as answer cases match `product` words today), forbidden lines absent (as `notItems`), quantities within a range scaled by people, and each line with a Fit in the Catalog Snapshot.
- **Plan to cart cases**: a fixed confirmed Plan whose lines are scored as order-case Items with `fits`, so the matcher is measured on the planner's vocabulary (the "Carne para asado" case: an asado line must fit `627285` "Asado de Novillo x kg" or its siblings from `pnpm order:label asado`).
- **Idea quality**: a small rubric judged by a person or an LLM judge, kept out of `pnpm check` because it makes live calls, like `pnpm order:eval`.
- Each needs a schema in `src/core/order-matching/eval-set.ts` (or a new `evals/planning.json` with its own loader in `src/adapters/files/data-files.ts`) and validation in `pnpm order:eval-set`, which runs in `pnpm check` (`CLAUDE.md`).

## Open questions

- Confirming a Plan with a button or with free text ("dale"): which one the router must recognise (open in the handoff).
- Whether the planner sees prices to respect a budget, or code warns after the simulated cart (open in the handoff; ADR 0011 ignores preferences today).
- Whether questions mid-order ("¿Qué carnes me sugerís?") go to the planner or to a new `read-reply` kind (open in the handoff).
- What the current flow does with an off-topic message: not verified.
- How Carrefour France's Hopla turns a menu into search queries and quantities: not published, not verified.
