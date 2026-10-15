# How should an LLM match a free-text Item to actual catalog products, pick a default without asking, and take corrections afterwards?

Consulted 2026-10-15. Marks: **[V]** verified in the cited page, abstract, file or command output, **[I]** my inference, **[?]** not verified.

Builds on `.scratch/carrefour-cart/research/request-to-product-type-rag.md` (Item to Product Type: entity linking, BM25 evidence, whole tree in a cached prompt, alias table, calibration, clarifying-question literature) and `preference-to-selection-architectures.md` (preference to Selection Policy: Instacart Intent Engine, Rufus, RankGPT, LTR, determinism). Neither is repeated here. The difference: those notes stop at the Product Type and at the policy. This note covers the step in between, from an Item to the **set of actual products that satisfy it**. It also covers a change in what the Owner wants: **default instead of ask, correct afterwards**, which reverses part of ADR 0004.

Method: repo files read; the Catalog Snapshot (`.data/carrefour/products.json`, fetched 2026-10-14) analysed with Python; live anonymous GETs to Carrefour Intelligent Search on 2026-10-15 14:43 UTC (no mutation); vendor docs, engineering posts and arXiv abstracts through WebFetch and the arXiv API. WebFetch summarises pages with a small model, so quotes are close but may not be character-exact. For papers I read only the abstracts.

Primary sources:
- Repo: `src/core/order-resolution/resolve-order.ts`, `src/core/catalog/catalog.ts`, `src/core/product-selection/pick-products.ts`, `prompts/order-resolution/*.md`, `docs/adr/0002..0005`, `docs/LLM.md`, `docs/TESTING.md`, `docs/references/carrefour-api.md`, `evals/order-resolution.json`, `vocabulary/carrefour-tipos.json`
- Conversation Log: `.data/conversations/2026-10-15-110545-03942ebf-723f-4615-9248-1465b0877cb7.jsonl`
- Carrefour live: `GET https://www.carrefour.com.ar/api/intelligent-search/v1/product-search/trade-policy/1?query=<q>&sc=1&count=5[&page=1][&fuzzy=auto|0]`
- VTEX Help, Search behavior: https://help.vtex.com/en/docs/tutorials/search-behavior
- VTEX Intelligent Search API v1 reference: https://developers.vtex.com/docs/api-reference/intelligent-search-api-v1 (the fetched page did not show per-parameter text)
- Anthropic, Structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Anthropic, Prompt caching (pricing table): https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Anthropic, Contextual Retrieval: https://www.anthropic.com/news/contextual-retrieval
- Instacart, Building the Intent Engine (company mirror): https://company.instacart.com/tech-innovation/building-the-intent-engine-how-instacart-is-revamping-query-understanding-with-llms
- Instacart Help (retailer mirror), replacements: https://healthyplanet.instacart.com/help/section/360007902831/360039162252
- Uber, Cart Assistant (2026-06-16): https://www.uber.com/blog/uber-cart-assistant/
- Picnic, Enhancing Search Retrieval with LLMs: https://jobs.picnic.app/en/blogs/enhancing-search-retrieval-with-large-language-models-llms
- Walmart, "Hey Siri, add to Walmart" (2019-11-11): https://corporate.walmart.com/news/2019/11/11/hey-siri-add-to-walmart-introducing-a-new-shortcut-for-online-grocery
- Amazon Science, technology behind Rufus: https://www.amazon.science/blog/the-technology-behind-amazons-genai-powered-shopping-assistant-rufus
- DoorDash, Product knowledge graph with LLMs: https://careersatdoordash.com/blog/building-doordashs-product-knowledge-graph-with-large-language-models/ (HTTP 403; read only through the secondary summary https://signals.aktagon.com/articles/2025/12/building-doordashs-product-knowledge-graph-with-large-language-models/)
- Brinkmann et al., ExtractGPT, arXiv 2310.12537: https://arxiv.org/abs/2310.12537
- Peng et al., BEQUE long-tail query rewriting in Taobao, arXiv 2311.03758: https://arxiv.org/abs/2311.03758
- Retrieval Augmented Spelling Correction for E-Commerce, arXiv 2410.11655: https://arxiv.org/abs/2410.11655
- Pradeep et al., RankVicuna, arXiv 2309.15088: https://arxiv.org/abs/2309.15088
- Reddy et al., Shopping Queries Dataset (ESCI), arXiv 2206.06588: https://arxiv.org/abs/2206.06588 ; labels: https://github.com/amazon-science/esci-data
- Elastic, Reciprocal rank fusion: https://www.elastic.co/docs/reference/elasticsearch/rest-apis/reciprocal-rank-fusion
- PostgreSQL, pg_trgm: https://www.postgresql.org/docs/current/pgtrgm.html

## Answer

1. All four failures in the log have one root cause. Free strings from `split-order` (`brand`, `terms`, `vagueWords`) act as **hard literal filters on product names** (`resolve-order.ts:104`, `:109-113`, `catalog.ts:45`), and nothing ever shows them the products that actually exist. The fix is to show the LLM the real products of the Item and let it say which ones satisfy the Item: **retrieve, then narrow** (approach a below). Code keeps choosing among the products that satisfy it [I].
2. The best fit for this repo ranks first: **(a) LLM narrows retrieved snapshot products to an eligible set, with option ids enforced by structured outputs (f)**, fed by **(d) lexical plus fuzzy retrieval**. A code rule settles vague words by size rank. A new **`revise-cart`** task turns follow-ups into line edits. Second: **(c) offline attribute extraction per product with (b) grounded query rewriting**, which is the most deterministic at query time. Third: **(e) agentic tool use**, which is flexible but slow and hard to evaluate [I].
3. Production grocery assistants pick a default and let the shopper change it before checkout. Walmart Voice Order adds "the specific orange juice the customer buys regularly" [V]. Instacart defaults replacements to "Best match" and the shopper "can change it anytime before checkout" [V]. Uber's Cart Assistant builds a cart that shoppers "review and edit before placing an order" [V]. No primary source I read describes how they parse a correction such as "cambiá X por Y" [?].
4. ADR 0004 must be superseded: ask when nothing qualifies, default otherwise. ADR 0002 must be amended: the LLM may **exclude** products, while code still **chooses** among those that remain. ADR 0003 must be amended: terms become soft and the evidence is the Item's own products [I].
5. Carrefour's live search corrects typos on its own: `porsalud` returns 44 Port Salut products and `morzilla la divisa` returns La Divisa morcillas [V live]. But it ANDs every word, so `coca cola grande` returns cups. And `sal gruesa` returned 0 [V live]. It can serve as a second retriever, not as the matcher [I].

## Findings

### 0. The repo today, and why the four cases fail

- [V] The pipeline is `split-order`, then BM25 over `name + brand` of mapped products (`resolve-order.ts:74-87`, query `phrase + brand + terms` at `:75`), then `resolve-item` (a Product Type or Group id), then `settle`. `settle` filters the products of the Product Type by `productMatchesBrand` (`:104`). It asks a `term` question when any term is in no product name (`:109-113`), and a `size` question listing every distinct in-stock size whenever `vagueWords` is non-empty (`:115-123`).
- [V] `nameMatchesTerm` is a whole-word substring match on normalised text, or an exact size equality (`catalog.ts:45-50`). Brand typos are tolerated only at edit distance 1 for brands of 5 or more characters (`catalog.ts:52-58`).
- [V] The snapshot has 105,336 products and is 74 MB (the brief guessed about 14 MB). There are 15,180 in-stock products, 11,201 of them with a Tipo mapped to a Product Type, across 769 Product Types and 1,443 distinct brands. In-stock products per Product Type: median 5, p90 36, max 452 (`vino-tinto`). Also `gaseosa` 92, `queso-cremoso` 45, `carbon` 4, `sal-gruesa` 9 (Python over `products.json` + `carrefour-tipos.json`).
- [V] Each record carries `name`, `brand`, `tipo`, `skuIds`, `ean`, `price`, `availableQuantity`, `measureUnit` and `consumptionQuantity` (for example `CM3 1750.00`), so size is available as a field, not only inside the name.
- [V] The log shows `split-order` at 10.4 s (1,897 thinking tokens) and each `resolve-item` at 1.4-4.4 s and about $0.0006, with about 25k cached tokens read. Items resolve in parallel (`resolve-order.ts:235`).

| Case (log line) | What happened | Root cause | What exists in stock |
| --- | --- | --- | --- |
| "1 bolsa de carbon" (28, 40-58) | `terms:["bolsa"]` led to "¿lo saco?" three times. The Owner asked "que opciones me das de carbon?" and got the same question again | A packaging word became a hard name filter. `map-answer` has no answer kind for "show me options" | 4: Briquetas Carbocor 5 kg, Carbón vegetal Carbocor 4 kg, Carbón de leña Patagonia 4 kg, Carbon vegetal Asados 4 kg [V] |
| "Queso porsalud light" (8, 22, 40) | `brand:"porsalud"`, `phrase:"queso"` led to `grupo-queso` and 34 options | A variety was read as a brand. BM25 has no token `porsalud`. The Tipos "Queso port salut"/"Queso por salut" map to `queso-cremoso` (`carrefour-tipos.json:1747-1748`), but nothing pointed there | 17 in-stock Port Salut, 6 of them light. One is spelt "Ligth" (Puyehue), which a literal `light` term misses [V] |
| "coca cola zero grande" (20, 40) | Listed 354 ml to 2,25 l | Every vague word becomes a question (`:115`) | Zero sizes in stock: 354, 600, 1250, 1750, 2250 ml [V] |
| "coca cola normal chica" (8, 26, 40) | "normal" dropped, so the size list mixed Zero, liviano and original | `split-order` has no slot for a variant. The catalog says "sabor original", not "normal" | Original: 220, 354, 600, 1250, 1750, 2250 ml [V] |

- [V] In that log the Owner answered "4) 1,75 l   6) 2,25 l". That is 1,75 l for "zero grande" and 2,25 l for "normal chica", the largest size for "chica". [I] Either the Owner misnumbered or "chica" was not meant literally. Either way, a size-rank rule should be checked against Owner-labelled cases before anyone trusts it.

### 1. Approaches

#### (a) Retrieve, then the LLM narrows the candidates to an eligible set; code chooses

- How: per Item, code retrieves candidate products from the snapshot: all in-stock products of the Product Type when there are few, otherwise the top N by lexical/fuzzy score. A new LLM task (call it `narrow-item`) receives the Item text and numbered candidates (name, brand, size). It returns `eligible` (the numbers of every product the Owner would accept), an `interpretation` (brand or variety it read, size wanted), and `none` when no candidate fits. Code applies the Selection Policy among the eligible products only.
- Prior art: RankGPT/RankVicuna listwise reranking [V abstract 2309.15088]. Uber's Cart Assistant has a "relevance judging" stage over candidates from "store inventory retrieval, not free generation", with deterministic checks for "eligibility, availability" [V]. Mercado Libre's LLM layer does "merge/filtro/rerank" (from the earlier note) [V there].
- A filter is not a choice [I]. RankGPT asks for an order; narrowing asks for a set, which is closer to ESCI's "Exact/Substitute" labelling [V labels] and keeps ADR 0002's split: the LLM says what qualifies, code says which one is bought.
- Cost and latency [I from repo numbers]: `gaseosa` at 92 in-stock products is about 2.4k tokens of names, and `queso-cremoso` about 1.2k. At Haiku 5.5's $0.10/MTok input ([V] prompt-caching pricing table), 2.4k uncached tokens cost about $0.00024 per call, the same order as the 25k cached tree tokens already read per call (25k × $0.01/MTok ≈ $0.00025). One extra call per Item, run in parallel, adds about 1.5-4 s to the turn (observed `resolve-item` latencies). `vino-tinto` (452, about 12.7k tokens) needs a lexical pre-cut to about 60 [I].
- Determinism: low, since Haiku 5.5 takes no `temperature` (earlier note [V]). It can be mitigated three ways: code still picks among the eligible products; the set rather than one product varies; and a cache per normalised Item within a snapshot pins it [I].
- Failure modes [I]: over-narrowing (drops acceptable products, so the result looks like "none"); under-narrowing (keeps Zero for "normal"); lost-in-the-middle on long lists; a recall ceiling set by retrieval (a product not retrieved cannot be eligible).
- Fit: high. The sizes are small (median 5, p90 36), and the four cases all become "show the 4 carbones / 17 Port Salut / 14 Cokes and say which fit" [I].

#### (b) LLM query rewriting grounded on catalog vocabulary

- How: before retrieval, an LLM rewrites the Item into catalog words ("porsalud" to "port salut", "normal" to "sabor original", "bolsa de carbón" to "carbón"). It is grounded by giving it candidate brand and attribute values retrieved for the Item, so it can only choose among existing strings.
- Prior art: Instacart moved to "specialized prompts for three distinct rewrite types" (substitutes, broader, synonyms), "over 95%" coverage with "90%+ precision", and brand candidates from "Product brand names with high semantic similarity" [V]. Taobao's BEQUE fine-tunes an LLM for long-tail rewrites, deployed since October 2023 [V abstract]. 2410.11655 retrieves catalog product names into the context of an LLM spelling corrector and reports improvements "beyond a stand-alone LLM" [V abstract]. The repo already has a weak form: `reword-item` runs only after `none` and only on the phrase (`resolve-order.ts:152-155`).
- Cost: one small call, or folded into `split-order`/`narrow-item` [I]. Failure mode: a rewrite drifts in meaning ("light" dropped); it needs grounding plus the eval set [I].
- Fit: medium as a separate step. It is better folded into (a), where the LLM sees the product names and therefore the catalog spelling [I].

#### (c) Offline attribute extraction per product, structured filter at query time

- How: once per snapshot, an LLM extracts for each in-stock product `{brand, variety ("port salut"), line ("zero","light","sabor original"), size+unit, package ("bolsa","lata","sachet"), unitsPerPack}` into enums per Product Type. At query time `split-order` emits the same slots, constrained to values that exist, and code filters. Unmet constraints relax in a fixed order (package, then size, then line) instead of asking.
- Prior art: ExtractGPT reports GPT-4 at 85% average F1 for attribute value extraction with descriptions and demonstrations, and fine-tuning "reduces the model's ability to generalize to unseen attribute values" [V abstract]. DoorDash runs an in-house brand classifier, sends low-confidence SKUs to an LLM, has a second LLM check for duplicates of existing taxonomy entries, and uses RAG few-shot for entity resolution [? via secondary summary; primary returned 403]. Instacart's offline pipeline "validates the tags against our catalog" and serves a cache so "only 2% of queries needed real-time inference" [V]. Picnic says "it is easier to precompute 99% of search terms" [V].
- Cost [I]: 11,201 mapped in-stock products × about 100 input + 60 output tokens is about 1.1M in and 0.7M out. On Haiku 5.5 ($0.10/$0.50 per MTok [V]) that is under $1 per full run, then only new or renamed products per snapshot. One-off latency, nothing at query time.
- Determinism: high at query time (code filter). Extraction errors are frozen into data, which is reviewable [I].
- Failure modes [I]: schema design per Product Type; values the Owner says that are not in the schema; catalog typos ("Ligth", "Tremplay", "La Pauilna" [V in snapshot]) need the LLM to normalise them; re-extraction on each snapshot.
- Fit: medium-high. ADR 0003 rejected this as "Product Type plus extracted attributes per product. Needs attributes for every product; terms on the product name cover the same requests" (`docs/adr/0003...md:19`), and the log disproves the second half [V/I].

#### (d) Hybrid lexical + embedding + fuzzy retrieval feeding the LLM

- How: run several retrievers over in-stock product names (BM25 on words, character trigrams or edit distance for typos, optionally multilingual embeddings) and fuse them with RRF, `score += 1/(k + rank)`, `k` default 60 [V Elastic]. pg_trgm "determin[es] the similarity of alphanumeric text based on trigram matching", default threshold 0.3 [V].
- Evidence: Anthropic's Contextual Retrieval cut failed retrievals by 49% with embeddings + BM25 and by 67% with reranking added. It says BM25 is "particularly effective for queries that include unique identifiers or technical terms", and that a knowledge base under 200,000 tokens can go in the prompt [V].
- For this repo [I]: "porsalud" against "port salut" shares trigrams (`por`, `sal`) but BM25 cannot see it. A char-n-gram retriever beside the existing BM25 (`bm25.ts`) fixes the log's typo cases without an embedding provider. Embeddings stay rejected per ADR 0003's reopen criteria unless the eval set shows synonym misses ("birra", "porrón").
- Cost: milliseconds, in-process. Determinism: full. Failure: recall only, no judgement. It feeds (a) or (c), never replaces them.

#### (e) Tool use / agentic search

- How: the LLM gets `search_catalog(query, filters)` (local) and possibly `carrefour_search(query)` (live) and iterates until it can name products.
- Live Carrefour behaviour [V, 2026-10-15 14:43 UTC]:

| `query=` | default (no `fuzzy`) | `fuzzy=0` |
| --- | --- | --- |
| `porsalud` | 44, `fuzzy:auto`, `correction.misspelled:true`, all Port Salut | 0 |
| `queso porsalud light` | (auto) 15, Port Salut light first | 2,250, `operator:or`, no Port Salut in top 5 |
| `coca cola grande` | 16, cups and glasses ("Taza grande") | 1,663, `operator:or`, Cokes |
| `coca cola normal` | (auto) 3, sanitary pads | 357, Cokes |
| `bolsa de carbon` | (auto) 42, "Bolsa de leña 9 kg." first | 1 |
| `carbon` | 140, one charcoal then toothpaste | 140 |
| `morzilla la divisa` | (auto) 6, all La Divisa morcillas | 17 |
| `sal gruesa` | 0 | 0 (while `sal` returns 1,513, including "Sal gruesa Carrefour Classic 1 kg") |

- [V] VTEX documents fuzzy 1 for terms of 3-5 characters and 2 for terms of 6 or more, and an AND-then-any-term fallback when results are few [VTEX Help]. [?] Why `sal gruesa` returns 0 and what `fuzzy`/`operator` accept: the API reference page fetched did not show parameter text.
- Fit [I]: Carrefour's typo tolerance is useful as a *second retriever* for typos when the Item carries no vague words. It is poor as the matcher: vague and variant words poison AND queries, and results drift across categories. A full agent loop means several sequential Haiku turns (each about 1.5-4 s here), non-repeatable paths and evals that are hard to score. Also, the Claude Code adapter runs sessions "with no tools" (`docs/LLM.md:10`), so this needs an MCP or tool bridge in the adapter.

#### (f) Constrained / structured outputs

- [V] Anthropic structured outputs support `enum` of "strings, numbers, bools, or nulls". They list `claude-haiku-5-5`, compile a grammar that is "cached for 24 hours from last use", and fail with "Schema is too complex for compilation" past internal limits. Limits are 20 strict tools and 24 optional parameters per request. No maximum enum size is stated. Enum casing is not guaranteed ("Compare enum values case-insensitively"). Refusals and `max_tokens` can still break the schema.
- [I] For `narrow-item`, emit `eligible: integer[]` and check `1 ≤ n ≤ candidates.length` in code, as `resolve-order.ts:131` already does for Product Type ids. A per-call enum of product ids would change the schema per Item, recompile the grammar each time (first-use latency), and could hit the complexity limit at 100+ values. Validation in code is cheaper and equally safe.
- [I] The adapter's log shows `stop_reason:"tool_use"` and `structured_output`, so Claude Code's `--json-schema` already enforces the shape. Whether it uses strict decoding is [?].

#### (g) Caching resolutions as memory

- [V] Instacart serves head queries from an offline-validated cache. ADR 0002 lists "Store every translation and reuse it" as rejected for now, and ADR 0004 says "Nothing is kept between orders".
- [I] There are three levels with different tension:
  1. A per-turn or per-session cache of `narrow-item` answers by normalised Item and snapshot date. This is not memory between orders and needs no ADR change.
  2. A committed, hand-reviewed alias file (`vocabulary/aliases.json`: "porsalud" → variety "port salut"; "normal" with cola → "sabor original"), proposed from the Conversation Logs. This is vocabulary data, like the Tipo mapping, not Owner memory, so it fits ADR 0004 as written.
  3. Per-Owner "last product bought for this phrase" (Walmart's model). It needs storage and ADR 0004 superseded. This is the strongest default signal in the sources, and it is out of scope now.

### 2. Default-pick-then-correct

- [V] Walmart: "we'll make sure to add the specific orange juice the customer buys regularly … thanks to information from their purchase history". Default signal: history.
- [V] Instacart: "If you don't choose a preference, Replace with best match is selected for you … You'll see this in your cart and can change it anytime before checkout"; Best Match also uses "replacements you've approved on past orders". Default: a choice made for the shopper, visible and changeable.
- [V] Uber Cart Assistant: "LLMs handle ambiguity; deterministic systems handle retrieval, pricing, eligibility, schema validation". Quantity gets "a reasonable default"; "cheapest bacon" becomes "structured signals for backend ranking"; shoppers "review and edit before placing an order"; content is "revised or suppressed if it isn't grounded in the cart". Brand defaults are not described.
- [V] Rufus: the LLM "selects information" before answering and calls "Stores APIs". There is no statement on auto-picking or cart edits. Alexa's default order (history, then Amazon's Choice, then top Prime offer) appears only in SEO blogs [?].
- [?] Instacart's ChatGPT app "assemble[s] a ready-to-review cart" per trade press. openai.com returned 403.
- [?] Picnic, Ocado, DoorDash: no primary page found on auto-pick vs ask or on correction parsing.
- Default signals available here [I]: no history (ADR 0004). What exists: the Selection Policy (savings first, then price per unit, then `itemId`) over live search and simulation (ADR 0005), stock, and, if wanted, a "popular" proxy (Carrefour's default relevance order). The policy already is the default rule. The change is only to stop asking before it runs.
- Mapping to the repo [I]:
  - **Reply**: each cart line shows what was understood and what was assumed ("Coca-Cola sabor original 220 ml — elegí la más chica"; "Carbón vegetal Carbocor 4 kg — no dijiste marca"). An assumption the Owner cannot see is ADR 0004's rejected risk ("a wrong guess goes into the cart without anyone noticing"); making it visible is what Instacart and Uber do.
  - **New task `revise-cart`**: input = cart lines `{line, phrase, product, brand, size}` plus the Owner's message. Output = operations `{line, action: "replace"|"remove"|"quantity"|"add", phrase?, brand?, size?, variant?, quantity?}`, with lines only from the enum of existing numbers. "cambiá el carbón por Patagonia" becomes `replace line 7 brand Patagonia`. "la quiero Coca de 1,5" becomes `replace line 2 size 1,5 l`. Code then re-runs retrieval + `narrow-item` + policy for that line with the new constraint as **strict**. If nothing qualifies (there is no 1,5 l Coke in stock; sizes are 1,25/1,75/2,25 [V]), the reply says so with the nearest sizes. This is the only place a question remains.
  - This replaces most of `map-answer`'s role. `map-answer` maps answers to questions; `revise-cart` maps edits to lines. Both are translation, so ADR 0002 holds.
  - `takeTurn` needs a state after the cart is delivered. Today a session is deleted when its cart is delivered (`ARCHITECTURE.md` "An order end to end") [V], so the session must live on and the cart link be rebuilt per revision [I].

### 3. Relative vague words ("grande", "chica", "familiar")

- [?] I found no e-commerce paper or engineering post on interpreting gradable size words. A search returned only general linguistics (threshold relative to a comparison class).
- [V] VTEX and Instacart material I read does not cover it. Uber covers only quantity defaults.
- Options [I]:
  1. **Code rule by rank** within the eligible in-stock sizes of the Item: "grande"/"familiar" means the largest single unit (excluding packs), "chica" the smallest, "mediana" the median. Deterministic and explainable. Wrong where words are conventional: "chica" Coke in Argentina may mean 500-600 ml, not the 220 ml glass.
  2. **LLM picks a target size** from the eligible sizes in `narrow-item` (`sizeWanted: "1,75 l"`), and code checks that it exists. Captures convention, varies per run.
  3. **Rule plus a committed table** of conventional meanings per Product Type (`gaseosa`: chica ≤ 600 ml, grande ≥ 1,75 l), then rank inside the band. Deterministic and grounded.
- Recommendation [I]: 3, falling back to 1. Echo the size chosen in the cart line so a correction is one message away. Label the log's cases in the eval set first, since the Owner's own answer (2,25 l for "chica") contradicts rule 1.

### 4. Evaluation

- [V] Today: `evals/order-resolution.json` has 14 cases scored at the Product Type / brand / question level (`docs/LLM.md` "Changing a prompt"). It is not part of `pnpm check`, and `pnpm order:eval-set` validates its shape (`docs/TESTING.md`).
- [V] ESCI labels each (query, product) as "Exact, Substitute, Complement, Irrelevant" over 2.6M judgements, Spanish included. Uber evaluates with "strict deterministic verification" plus "a multimodal LLM judge calibrated with human input". Picnic evaluates offline on past searches, then with A/B tests.
- Proposal [I]:
  - Extend cases with `acceptable`: a list of product ids (or name patterns) per Item, labelled once from the snapshot, ESCI-style (exact = would accept, substitute = would accept with a notice). Add `asks: true` only where a question is the right outcome.
  - Metrics: **retrieval recall@N** (is any acceptable product among the candidates; pure code, could run in `pnpm test` over the snapshot fixture). **Eligible-set precision and recall** against `acceptable`. **Pick-in-acceptable rate** after the policy. **Question rate**. **Silent-wrong rate** (picked but not acceptable: the costly error). **Stability** (agreement of the eligible set over 5 runs).
  - Correction cases: `{cart, message} → operations`, scored exactly.
  - Seed the cases from Conversation Logs: the four failures above are the first.
  - An LLM judge is only needed for free-text replies, not for set membership, which labels decide exactly.

## Recommendation (ranked, for the human to decide)

**1. Narrow-then-pick with defaults and `revise-cart` (a + d + f, with a code size rule, g level 1-2).**
- Retrieval: in-stock snapshot products of the resolved Product Type(s), all when ≤ 60, else the top 60 by RRF of BM25 + char-trigram. When `resolve-item` returns a Group, retrieve across its children. Optionally add Carrefour live search for typo recall, with vague words stripped from the query.
- `narrow-item` (Haiku) returns `eligible[]`, `brandRead` (must be a brand in the candidates, or null), `variety`, `sizeWanted` and `none`. Code validates the numbers.
- Code: size rule (option 3 of §3) inside the eligible set. The Selection Policy (ADR 0005 live search and simulation) runs over the eligible products' `skuIds`. Search must then be filtered to these products. [?] Whether Intelligent Search can filter by product or SKU id is not verified; otherwise simulate the eligible SKUs directly (the snapshot has `skuIds` [V]).
- Questions only when `eligible` is empty after relaxing terms, or when the Item is a Group whose children are not interchangeable and nothing in the phrase narrows it ("queso" alone).
- `revise-cart` for follow-ups. The cart reply marks assumed choices.
- ADRs: **supersede 0004** (default, then correct; memory still none); **amend 0002** ("the LLM may exclude products from a retrieved list; code chooses among the rest"; `docs/LLM.md` "Never let the LLM choose a product" reworded); **amend 0003** (terms soft, judged by `narrow-item`; product-level evidence; char-trigram retrieval added; embeddings still rejected); **amend 0005** (candidates = eligible set; session lives past the cart).

**2. Offline attributes + grounded slots (c + b + d), no per-Item LLM call beyond `split-order`.**
- A `pnpm catalog:attributes` command extracts attributes per in-stock product, cached by `productId + name`. `split-order` emits slots whose values must come from the attribute vocabulary, passed in its prompt or retrieved per Item by trigram. Code filters, relaxes in a fixed order, applies the size rule and the policy. `revise-cart` stays the same as in 1.
- Most deterministic and cheapest per order. The cost moves to schema design and to re-extraction per snapshot.
- ADRs: as in 1, but 0003's rejected option "Product Type plus extracted attributes per product" is adopted instead, and 0002 needs no amendment.

**3. Agentic search (e + d), the LLM calls `search_catalog` and returns product numbers.**
- Fewest new concepts and handles odd phrasings. It is slowest (sequential turns), least repeatable and hardest to evaluate, needs tools in the Claude Code adapter, and contradicts ADR 0002 most. Keep it as a fallback only for Items where 1 returns `none` [I].

### The real cases through each option [I]

| Case | 1. Narrow-then-pick | 2. Offline attributes | 3. Agentic |
| --- | --- | --- | --- |
| "1 bolsa de carbon" | Candidates: the 4 in-stock `carbon` products; `narrow-item` keeps all 4 ("bolsa" is how charcoal is sold); policy picks; reply "Carbón … 4 kg — no dijiste marca". "cambiá el carbón por Patagonia" leads `revise-cart` to `replace brand Patagonia`, which gives "Carbón de leña 4 kg." (Patagonia, in stock [V]) | `package:"bolsa"` is not in the schema values for `carbon` (or every product is a bag), so it relaxes and the 4 remain; same pick and correction | Searches "carbón", gets 4, returns them; Patagonia correction by a second search |
| "Queso porsalud light" | Trigram retrieval surfaces Port Salut (Tipo maps to `queso-cremoso`); `narrow-item` reads variety "port salut", brand null, keeps the 6 light ones including "Ligth" Puyehue; policy picks | Attribute `variety:"port salut"`, `line:"light"` extracted offline (normalising "Ligth"); `split-order` slot "port salut" grounded by trigram on variety values; filter gives 6 | Live search `porsalud` returns Port Salut [V]; works if the agent tries it |
| "coca cola zero grande" | Eligible: 5 Zero sizes; band rule for `gaseosa` "grande" ≥ 1,75 l, then largest gives 2,25 l (the Owner chose 1,75 l [V log]); reply shows the size; "la quiero de 1,75" becomes a one-line revise | `line:"zero"`, size by the same rule; identical outcome, no LLM in the pick | Agent's guess of "grande"; varies per run |
| "coca cola normal chica" | `narrow-item` maps "normal" to "sabor original", excludes Zero and liviano; rule "chica" (band ≤ 600 ml, smallest) gives 220 ml, or 600 ml if the band table says so. Needs the Owner's label | Needs `normal` → `sabor original` in the slot vocabulary (alias file); else "normal" matches no value and is dropped (still may pick Zero unless `line` defaults to "original") | Depends on the agent knowing Coca "normal" |
| "1 y 1 chorizo morzilla la divisa" | Already split correctly (log line 8); brand La Divisa is in the candidates; the morcilla eligible set has 4+ La Divisa morcillas; policy picks | Same; brand from attributes | Live search `morzilla la divisa` returns La Divisa morcillas [V] |
| "sal gruesa" | 9 in-stock `sal-gruesa`; all eligible; policy picks | Same | Live search returns 0 [V]; the agent must fall back to "sal" |

## Unverified

- DoorDash's own post (HTTP 403): its pipeline claims come from a secondary summary.
- OpenAI/Instacart ChatGPT app page (HTTP 403): "ready-to-review cart" is from trade press.
- Alexa's default-product order (history, then Amazon's Choice, then top Prime offer): SEO blogs only.
- How any production assistant parses a correction such as "cambiá X por Y": no primary source found.
- Any e-commerce source on gradable size words ("grande", "chica"): none found.
- VTEX `fuzzy`/`operator` parameter semantics in the API reference, and why `query=sal gruesa` returns 0: not shown on the fetched page. Live behaviour is only what the table records, on one day, without `regionId`.
- Whether Intelligent Search can filter by product or SKU id, which recommendation 1 needs to restrict live search to the eligible set.
- Whether Claude Code's `--json-schema` uses Anthropic's strict constrained decoding.
- Every cost and latency for the new tasks is estimated from the log's `resolve-item` calls and the pricing table, not measured.
- The author list of arXiv 2410.11655 was not checked.
