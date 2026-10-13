# How do real applications turn free-text shopper preferences plus a shopping list into one product per item, and which architectures exist?

Consulted 2026-10-13. Marks: **[V]** verified in the cited page or file, **[I]** my inference, **[?]** not verified.

Primary sources:
- Instacart, Building the Intent Engine (company mirror; tech.instacart.com returned HTTP 403): https://company.instacart.com/tech-innovation/building-the-intent-engine-how-instacart-is-revamping-query-understanding-with-llms
- Instacart, AI assistant (Clementine) announcement: https://company.instacart.com/blog/instacarts-ai-assistant-powered-by-14-years-of-grocery-expertise
- Walmart Global Tech, Three ways we are using conversational AI: https://tech.walmart.com/content/walmart-global-tech/en_us/blog/post/three-ways-we-are-using-conversational-ai-at-walmart.html
- Amazon Science, technology behind Rufus: https://www.amazon.science/blog/the-technology-behind-amazons-genai-powered-shopping-assistant-rufus
- Mercado Libre search engineer talk, TDC 2026 slides: https://speakerdeck.com/jpbonson/do-vibe-coding-ao-llm-em-producao-para-busca-agentica-tdc-2026-summit-ia-sao-paulo
- OpenAI Structured Outputs guide: https://developers.openai.com/api/docs/guides/structured-outputs
- Thinking Machines, Defeating nondeterminism in LLM inference: https://thinkingmachines.ai/blog/defeating-nondeterminism-in-llm-inference/
- RankGPT, LLMs as rerankers (arXiv): https://arxiv.org/abs/2304.09542
- Elastic, Learning To Rank introduction: https://www.elastic.co/search-labs/blog/elasticsearch-learning-to-rank-introduction
- CEL language definition: https://github.com/google/cel-spec/blob/master/doc/langdef.md
- JsonLogic: https://github.com/json-logic/.github/blob/main/README.md
- Cohen/Kalas/Perakis, Promotion Optimization for Multiple Items in Supermarkets (MIT DSpace): https://dspace.mit.edu/handle/1721.1/130364
- METU thesis, Promotion-aware purchase decision aid for consumers: https://open.metu.edu.tr/handle/11511/25399
- Repo notes: .scratch/carrefour-cart/research/catalog-mirror.md ; prior-art-assistants.md in the errand assistant repo (github.com/mateoferrari97/kyubi-agent, `.scratch/rethink-approach/research/`)

Tooling limit: WebFetch only (summarised by a small model), no Bash. Several quoted pages were summarised, not read in full. Search-engine snippets are leads only and are marked [?].

## Answer
1. I found no engineering write-up from Instacart, Walmart, Amazon, Ocado, Picnic, Kroger or Precios Claros that describes our exact step (a free-text preference plus a list becoming one product per item under a deterministic rule). The closest primary evidence is query understanding: an LLM emits structured tags (product, brand, attributes), a guardrail validates them against the catalog, and conventional retrieval and ranking do the rest (Instacart, Mercado Libre). That is the shape of your candidate (a).
2. Direct LLM choice (b) appears in assistants (Rufus, Instacart's assistant), but the primary pages do not say the LLM picks the final SKU, and LLM output is not reproducible by default (Thinking Machines).
3. Other architectures with primary sources: LLM listwise reranking (RankGPT), learned ranking (Elastic LTR), history-based brand preference (Walmart), a sandboxed rule language for the policy (CEL, JsonLogic), integer programming for basket-level promotion choice (academic, mostly retailer-side), and human review before checkout.
4. Multi-unit promotions ("2do al 70%") are not handled by any retail source I found. Our own catalog data shows the promo as a minimum quantity plus a per-unit percentage, so the cost per unit depends on the quantity chosen; this must be computed by code from the snapshot [I].

## Findings

### A. LLM translates the preference once into a structured, validated spec; code executes it
- [V] Instacart's query understanding extracts "structured concepts from a user query, such as product, brand, and attributes"; the tags feed "search retrieval and ranking, ad targeting, and filters". Source: Instacart Intent Engine.
- [V] "a post-processing guardrail validates the tags against our catalog" and filters "out hallucinations and enforce alignment with Instacart's product taxonomy". Same source.
- [V] Frequent queries are served from a precomputed cache filled by an offline pipeline; rare queries go to a real-time model, "a much smaller backbone": a fine-tuned Llama-3-8B with LoRA. Latency fell from "nearly 700ms with A100 GPU" to the "300ms target" on H100 with merged adapters. Same source.
- [V] Mercado Libre's LLM layer sits before search: user context, query expansion, then "merge/filtro/rerank" of results; production latency about 3.4 s of a 5 s budget (about 1 s LLM, 2.4 s non-LLM); models went GPT-4.1-mini, Gemini 2.5 Flash-Lite, then self-served Qwen3 4B (about 50% lower latency, quality held in an A/B test); circuit breaker falls back to the plain search backend; principle "Agentic é enriquecimento, não dependência". Source: Mercado Libre slides.
- [V] The same deck moved attribute output from JSON with IDs to lines like `1|BRAND|New Balance`, mapping IDs to simple numbers in application code, for "ganhos em latência e custo" (no figures). Same source.
- [V] OpenAI Structured Outputs "ensures the model will always generate responses that adhere to your supplied JSON Schema"; JSON mode only guarantees valid JSON ("only Structured Outputs ensure schema adherence"). Source: OpenAI guide. Schema size limits were not in the text I got [?].
- [V] LangChain-style self-query retrievers use an LLM to produce a structured query and a store-specific translator turns it into the store's filter syntax (search-result description of LangChain JS docs and the MongoDB Atlas guide; pages not opened) [?].
- [I] Fixing the rule vocabulary (brand filter, promo first, direct discount, price per unit, tie-break) makes the LLM output a closed enum-and-parameters object, which schema-constrained output and a catalog-side validator can check, as Instacart validates tags against its taxonomy.
- [I] Determinism: all randomness sits in one place (the translation). Once the policy is stored, selection is a pure function of policy and snapshot. Caching translations keyed by normalised preference text (Instacart's head-query cache) would make the policy reproducible across users too [I].
- [I] Weakness: expressiveness is capped by the rule set; a preference outside the vocabulary has to be refused or mapped to the nearest rule, and the shopper must be told which.

### B. LLM chooses products among retrieved candidates
- [V] Rufus retrieves before generating: "before generating a response, the LLM first selects information that may be helpful" (reviews, catalog, community Q&A), works "along with calling relevant Stores APIs", and streams token by token. The page "does not say whether the LLM ranks products". Source: Amazon Science.
- [V] Instacart's assistant turns "a conversation into a complete, personalized, ready-to-buy grocery cart in just seconds", uses live local inventory, order history and "Smart Shop preferences"; for budget requests it "surfaces relevant promotions, lower-cost options"; it "does not finalize anything without explicit action". The page does not say which parts use an LLM or how SKUs are picked. Source: Instacart announcement.
- [V] Nondeterminism: at temperature 0 the author sampled 1000 completions of one prompt and got "80 unique completions", diverging at token 103; cause is batch-size-dependent kernels ("the load (and thus batch-size) nondeterministically varies!"); with batch-invariant kernels "all of our 1000 completions are identical". Source: Thinking Machines. [I] A hosted API generally does not let the caller control this, so identical requests can yield different carts.
- [V, from repo note] tau-bench reports top function-calling agents inconsistent in a retail setting (pass^8 "below 25%", 2024 models). Source: prior-art-assistants.md.
- [I] Pros: handles any preference wording, can use product text and judgment. Cons: non-reproducible, costs a long-context call per item or per list, and the price/promo arithmetic is error-prone if left to the model.

### C. LLM reranker over a candidate list
- [V] RankGPT abstract: "properly instructed LLMs can deliver competitive, even superior results to state-of-the-art supervised methods" on IR benchmarks; a distilled 440M model "outperforms a 3B supervised model on the BEIR benchmark". Source: arXiv 2304.09542. Benchmarks are passage-relevance, not price/promo choice [I].
- [V] Mercado Libre's flow includes an LLM merge/filter/rerank step (see A).
- [I] Same determinism and latency profile as B but with a narrower job (ordering, not tool use); relevance ordering is the wrong question for "cheapest" or "best promo", which are arithmetic over fields we already hold.

### D. Learned ranking (learning to rank)
- [V] "LTR uses a trained machine learning (ML) model to build a ranking function"; it trains on a judgment list of query-document pairs with relevance grades; `window_size` is "the number of top documents from the search results issued by the first-pass query to be rescored". Source: Elastic.
- [V] The Elastic page gives no latency or compute figures.
- [I] Needs labelled judgments and click or purchase logs we do not have; a trained model is deterministic at inference, but its output is hard to explain per item ("why this brand?") and does not read a free-text preference by itself.

### E. History-based personalisation
- [V] Walmart voice/text ordering: NLP parses the request, "product name entity recognition" finds the products, and the system uses "their prior purchase information to determine brand preferences". The page does not describe ranking when several items match. Source: Walmart Global Tech.
- [V] Instacart's assistant also uses order history (see B).
- [I] Deterministic given the history, explainable ("you bought this before"), but does not take a one-off instruction like "lo más barato" and cold-starts for new users.

### F. Rule engines and policy languages as the executor of A
- [V] CEL: "Memory-safe", "Side-effect-free" ("only computes an output from its inputs"), "Terminating" ("cannot loop forever"); described for "execution of untrusted expressions with reliable containment"; evaluation cost bounded. Source: CEL langdef.
- [V] JsonLogic: "an S-Expression like engine that powers dynamic and declarative applications", decision logic expressed as JSON. Source: json-logic README. Safety properties not stated on the page [?].
- [I] A free-form expression language lets the LLM emit arbitrary rules (more expressive) at the price of validating generated code; a fixed rule set with typed parameters (A) is easier to validate. Both execute in code with no LLM at run time.

### G. Basket-level optimisation with multi-buy promotions
- [V] Cohen/Kalas/Perakis model supermarket promotion pricing as "a nonlinear integer program" and give integer-programming approximations. It is the retailer's pricing problem, not a shopper's basket. Source: MIT DSpace.
- [V] METU thesis (2016): the consumer "promotion-based purchase problem" is formulated as an ILP and evaluated against optimum results; the same work ranks alternatives with PROMETHEE II; reported "62.22% of the optimum total credit card promotion bonuses" for its model. Focus is credit-card bonuses, not multi-buy. The objective function is not stated on the page [?]. Source: METU repository.
- [?] I found no primary source on shopper-side "cheapest basket with 2x1 / 2do al X%" as an optimisation problem; searches returned only the above.
- [I] Separable case: if each Product Type is independent (one product per type, no cross-type promo), the optimum is the best (product, quantity) per type, an enumeration over candidates, no solver needed. A solver is only needed for cross-product promo conditions or budget caps.

### H. Multi-unit promotions in our data
- [V, from repo note] Teaser "PROMO-2do al 70% Max 24 unidades Combinable ..." has `minimumQuantity` 2 and effect PercentualDiscount 35 (catalog-mirror.md, section 3). [I] 35% is the average per unit across the pair, i.e. a "2do al 70%" promo applies only if quantity is at least 2.
- [V, from repo note] Card teasers ("Tarjeta Carrefour 15%") appear on essentially every product, so they do not discriminate between products (catalog-mirror.md, section 7).
- [V, from repo note] VTEX simulation returns `price`, `sellingPrice`, `priceTags`; it was not called (POST), so whether it returns the multi-unit effective price is unverified (catalog-mirror.md, section 4).
- [I] None of the architectures above resolves quantity; A, F and G can, because the unit cost of each candidate can be computed for the quantity the shopper asked for, and, if the shopper's quantity is below the promo minimum, either price without the promo or flag "buy N for the deal" as a visible suggestion. B and C leave this to the model.

### I. Human in the loop
- [V] Instacart's assistant requires "explicit action" and reviews "every decision ... before checkout"; MessyList validates LLM output and lets the user review before saving (prior-art-assistants.md).
- [I] A cart preview that echoes the interpreted policy ("lo más barato por precio por unidad, solo marcas X, Y") makes a mistranslation visible to the shopper.

## Comparison

| Architecture | Who (cited) | Determinism | Latency at request | Cost at request | Explainability | Multi-unit promos |
| --- | --- | --- | --- | --- | --- | --- |
| A. LLM to fixed-rule policy, code executes | Instacart (tags + catalog guardrail), Mercado Libre (attributes) for the translation step; the selection step as we describe it was not found in a source [?] | High after translation; translation reproducible if cached [I] | One small LLM call (Instacart ~300 ms real time, ML ~1 s) or cache hit, then code | Low, one call per preference | High: the policy is the explanation [I] | Handled in code from teaser fields [I] |
| B. LLM picks among candidates | Rufus, Instacart assistant (mechanism not stated) | Low (Thinking Machines: 80 unique completions in 1000) | Seconds, grows with candidates | Highest | Low to medium (free-text reason) | Left to the model [I] |
| C. LLM reranker | RankGPT (research), Mercado Libre (rerank step) | Low to medium, same inference issue [I] | One call per list or window | Medium | Low | Not addressed |
| D. Learned ranking | Elastic LTR (product docs) | High at inference | Milliseconds on top-N | Training and labelling | Low per item | Not addressed |
| E. Purchase-history preference | Walmart, Instacart | High given history | Lookup | Low | High ("you bought it") | Not addressed |
| F. Rule language executor (CEL, JsonLogic) | CEL, JsonLogic (libraries) | High | Microseconds | Low | High | In code [I] |
| G. Optimisation (ILP / enumeration) | METU thesis, Cohen et al. (retailer side) | High (solver ties need a tie-break [I]) | Fast for per-type enumeration [I] | Low | Medium | Native: quantity is a decision variable [I] |
| I. Human review step | Instacart, MessyList | n/a | One round trip | None | Adds visibility | n/a |

## Fit for our case (inference)
- [I] A fits the stated requirements best: determinism and speed come from executing a fixed, typed policy over the snapshot in plain code; the LLM is used only to translate the free-text preference into that policy, which is the use Instacart and Mercado Libre document for query understanding.
- [I] Add four things from the other rows: validate the policy against the real brand and Product Type list before use (Instacart guardrail); cache the translation keyed by normalised preference text so identical requests share one policy (Instacart head cache); let code, not the LLM, price each candidate at the requested quantity so "2do al X%" is computed rather than guessed (G, H); echo the interpreted policy in the cart preview (I).
- [I] B and C are the weakest on determinism and cost, so at most a fallback for a preference the rule set cannot express, with the shopper told that the result may vary.
- [I] D needs data we do not have; E needs purchase history and does not take a one-off instruction. Both could later supply defaults for the tie-break.
- [I] The choice remains the human's; the facts above only rank the options against the stated requirements.

## Unverified
- Any Instacart, Walmart, Amazon, Kroger, Ocado or Picnic page describing how a free-text preference becomes a final SKU choice: not found. tech.instacart.com returned 403; only the company mirror of the Intent Engine post was read.
- Whether Rufus or the Instacart assistant lets the LLM pick the final SKU: the pages do not say.
- Ocado, Picnic: searches returned only third-party projects (e.g. an MCP server for Picnic) and a 2017 Ocado Alexa article; no first-party engineering page opened.
- Precios Claros / SEPA: search snippets say the data is public (Disposición 494/2024) and third-party comparators exist; no official API or basket-cost source opened [?].
- LangChain self-query and Elasticsearch LTR rescorer: described from search summaries and the Elastic blog; LangChain pages not opened.
- OpenAI Structured Outputs schema limits (nesting, property count): not read.
- Whether the VTEX simulation endpoint applies multi-unit promo pricing: needs a live POST (see catalog-mirror.md).
- Shopper-side multi-buy basket optimisation literature: none found; METU thesis objective function not seen in full.
- Mercado Libre figures come from slides summarised by a small model; check the deck before quoting.

## Adjacent
- A Towards AI guide (search result, not opened) describes retrieve-candidates-then-LLM-validate for product matching; a lead, not cited.
- Mercado Libre moved attribute output from JSON to pipe-delimited lines for latency and cost; relevant if the policy translation is latency-sensitive.
- Clementine (Instacart) launch coverage is dated 2026-09-09, so product details may still be changing.
