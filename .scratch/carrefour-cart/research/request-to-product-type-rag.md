# Which LLM + retrieval architecture should turn an Owner's vague Spanish words into a Product Type, with candidates, a clarifying question, or "nothing matches"?

Consulted 2026-10-13. Marks: **[V]** verified in the cited page, abstract or file, **[I]** my inference, **[?]** not verified.

Method: arXiv abstracts fetched through the arXiv API (`export.arxiv.org/api/query`), vendor docs and model cards through WebFetch (a small model summarises the page, so quotes from docs are close but not always character-exact), and the local snapshot `.data/carrefour/tipos.json` (fetched 2026-10-13T19:35Z). For papers I read the abstract only, not the full text; every number below comes from an abstract or a doc page. Dates are the arXiv first-submission date.

Repo context read first: `docs/adr/0001-own-product-types-mapped-from-each-online-store.md`, `docs/adr/0002-llm-translates-preferences-code-picks-products.md`, `GLOSSARY.md`, `.scratch/carrefour-cart/research/catalog-mirror.md`, `.scratch/carrefour-cart/research/preference-to-selection-architectures.md`.

## Question

An Owner writes an order in Argentine Spanish ("quiero leche, huevos, detergente, yerba", "medio sachet de leche", "chocolatada"). Each Item must become one Product Type from our own vocabulary (seeded from 2,203 grocery `Tipo de producto` values), or a clarifying question, or "nothing matches, what do you mean?". The LLM only translates; code picks products; every translation is stored and reused (ADR 0002). Which retrieval and LLM strategies from the literature fit, and which pipeline should we build?

## TL;DR

1. This is **entity linking / concept normalisation to a closed label set**, not open-domain RAG. The established shape is *retrieve candidates, then a stronger model picks or abstains* (BLINK bi-encoder + cross-encoder, 2019; Infer-Retrieve-Rank for thousands of labels, 2024; Retrieve-Rank ICD coding and FoodOntoRAG, 2024-2026). Generation-focused variants (Self-RAG, CRAG, GraphRAG, RAPTOR) matter only for their *ideas* (an evaluator that grades retrieval and triggers a fallback), not as systems to adopt. [V]/[I]
2. Our label set is small. All 5,486 Tipo names are 94,604 characters (local count); the 2,203 grocery ones are well under that, so the whole vocabulary fits in one cached prompt [V count, I token estimate]. Anthropic's own guidance says a knowledge base under 200k tokens can skip RAG and go in the prompt with caching (2024-09-19). So **A5 (whole vocabulary in the prompt) is viable and cheap on Claude Haiku 5.5**; retrieval (A3) is the scale-out path, not a day-one need. [V]/[I]
3. Ambiguity should be **a first-class output**, not a low score. A light **two-level hierarchy (A1)** — a Product Type Group such as "Leche" over Product Types such as "Leche entera" — gives the natural clarifying question (pick a child) and a place to store the Owner's default. Tree search over a taxonomy is what the ICD (Boyle et al., 2023) and e-commerce query categorisation (Duraj et al., 2026) papers do. [V]/[I]
4. **Package and fat are facets (A2), not Product Types**: in our snapshot "sachet" appears in example names under "Leche entera", "Leche saborizada", "Yogur entero", "Ricotta" and more, while there is no "sachet" Tipo. Instacart's production system also extracts "product, brand, and attributes" and validates them against its taxonomy. [V]
5. **Do not trust raw scores as probabilities.** Embedding cosine scores are not calibrated (multilingual-e5 card: scores sit in 0.7-1.0, "relative order" matters); Cohere says rerank scores are not ratios and thresholds must be set from 30-50 sample queries; verbalised LLM confidence tends to be overconfident (Xiong et al., 2023); the Claude Messages API exposes no logprobs (grep of the reference page). Abstention thresholds must be **calibrated on our own labelled set**; conformal prediction (KnowNo, 2023) is the principled tool once we have ~100+ labelled phrases. [V]
6. **Stored translations short-circuit everything**: exact phrase hit in the Owner's memory → done, no LLM; global alias table next; only misses reach the LLM. This is the same split Instacart uses (precomputed cache for frequent queries, small real-time model for the tail). [V]
7. **Model**: Claude Haiku 5.5 (`claude-haiku-5-5`) is documented by Anthropic as "for high-volume, latency-sensitive tasks such as classification, extraction, and routing", $0.10/$0.50 per MTok under 100k-token prompts, cache reads $0.01/MTok, and supports structured outputs. Whether it is accurate enough for Argentine grocery Spanish is **not verified** — measure it against Sonnet 5.5 on the eval set. [V]/[?]
8. **Spanish embeddings**: MMTEB (2025) found multilingual-e5-large-instruct (560M) the best publicly available model on its multilingual benchmarks; bge-m3 and jina-embeddings-v3 are the other strong open multilingual options; I could not verify a current Spanish-only leaderboard ranking. If we add retrieval, evaluate 2-3 models on our own phrases rather than trusting a leaderboard. [V]/[?]

## RAG variants survey

What each is, and whether it matters for mapping a 1-5 word phrase to one of ~2,000 short labels.

| Variant | What it is (source) | Relevance here |
|---|---|---|
| Naive / dense RAG | Retrieve passages from a dense vector index and condition generation on them (Lewis et al., 2020, https://arxiv.org/abs/2005.11401) [V] | The retrieval half is useful (A3). The generation half is not: we need a label id, not prose. |
| Hybrid BM25 + dense | Combine lexical and embedding retrieval. Anthropic measured top-20 retrieval failure falling from 5.7% to 3.7% with contextual embeddings, to 2.9% adding contextual BM25, and to 1.9% adding a reranker (2024-09-19, https://www.anthropic.com/news/contextual-retrieval) [V] | High, if we retrieve. Lexical match catches exact Argentine tokens ("lactal", "sachet", brand names) that embeddings may blur; dense catches paraphrases ("algo para lavar los platos" → "Detergente"). [I] |
| Cross-encoder rerankers | Score each (query, candidate) pair jointly; Nogueira & Cho improved MS MARCO MRR@10 by 27% relative (2019, https://arxiv.org/abs/1901.04085) [V] | Medium. With an LLM as the final picker, the LLM already plays the reranker role; a cross-encoder is a cheaper deterministic alternative if the LLM is dropped from the hot path. [I] |
| HyDE / query rewriting | Generate a hypothetical document and embed it instead of the query (Gao et al., 2022, https://arxiv.org/abs/2212.10496); query2doc expands the query with an LLM pseudo-document, +3% to +15% BM25 on MS MARCO / TREC DL (2023, https://arxiv.org/abs/2303.07678) [V] | Medium-low. Useful for very short or slangy phrases ("chocolatada" → "leche chocolatada, bebida láctea sabor chocolate"). Dobbins (2024) used the same idea for UMLS: LLM generates alternative phrasings, then prunes candidates, +9.5 to +18.7 F-points over rule-based normalisers (https://arxiv.org/abs/2405.15122) [V]. Adds an LLM call before retrieval. |
| Multi-query | Several rewrites, retrieve for each, fuse | Low. Our phrases are short; one rewrite is usually enough. [I] |
| Hierarchical / taxonomy-aware | RAPTOR builds a tree of summaries and retrieves across levels (2024, https://arxiv.org/abs/2401.18059) [V]; Boyle et al. search the ICD hierarchy sparsely instead of scoring every code (2023, https://arxiv.org/abs/2310.06552) [V]; Duraj et al. combine "simple tree-search with LLM semantic scoring" for e-commerce query categorisation and beat an embedding baseline (2026, https://arxiv.org/abs/2601.00510) [V] | **High** — this is A1. The tree gives both efficiency and the clarifying question. |
| GraphRAG | LLM builds an entity graph and community summaries to answer *global* questions over a corpus (Edge et al., 2024, https://arxiv.org/abs/2404.16130) [V] | None. Built for query-focused summarisation, not label linking. |
| Self-RAG | LM trained to decide when to retrieve and critique its own output with reflection tokens (Asai et al., 2023, https://arxiv.org/abs/2310.11511) [V] | Low as a system (needs a fine-tuned model). The idea — the model says whether retrieval was useful — maps to our `none` status. [I] |
| Corrective RAG (CRAG) | A lightweight retrieval evaluator returns a confidence that triggers different actions, including falling back to another source (Yan et al., 2024, https://arxiv.org/abs/2401.15884) [V] | **Medium, as a pattern**: grade the candidate set; if poor, rewrite once (synonym generation) and retry; if still poor, ask the Owner. FoodOntoRAG does exactly this. |
| Agentic RAG | An LLM loop that decides to search, inspect, retry | Low for v1: latency and non-determinism; the decision tree above is enough. [I] |
| Retrieval-augmented classification | Retrieve labelled neighbours and interpolate their labels with the classifier's (kNN-style; Liang et al., 2023, https://arxiv.org/abs/2303.13065) [V] | **High once we have stored translations**: past (phrase → Product Type) pairs are the labelled neighbours, for this Owner and later across Owners. |
| Retrieve-then-rank for extreme label sets | Infer-Retrieve-Rank: an LM infers likely labels, a retriever maps them to the real label set, an LM ranks; SOTA on three extreme multi-label benchmarks with tens of few-shot examples (D'Oosterlinck et al., 2024, https://arxiv.org/abs/2401.12178) [V] | **High**: the canonical answer when the vocabulary does not fit in the prompt. |
| Generative retrieval | A seq2seq model maps queries straight to document ids from its parameters (DSI, Tay et al., 2022, https://arxiv.org/abs/2202.06991) [V] | None: needs training and re-training when the vocabulary changes. A5 is the prompt-based cousin, with ids constrained by a schema instead of learned. [I] |

## Analogous use cases

### E-commerce query classification / product category prediction

- **Instacart Intent Engine** (company mirror, undated page; read for the earlier note `preference-to-selection-architectures.md`): LLM extracts "product, brand, and attributes"; "a post-processing guardrail validates the tags against our catalog" to enforce "alignment with Instacart's product taxonomy"; frequent queries served from a precomputed cache, the tail by a fine-tuned Llama-3-8B (https://company.instacart.com/tech-innovation/building-the-intent-engine-how-instacart-is-revamping-query-understanding-with-llms) [V, via that note]. Relevance: same shape as our pipeline — attributes as facets (A2), validation against the vocabulary, cache first.
- **Amazon, Hierarchical Query Classification** (He et al., 2024, https://arxiv.org/abs/2403.06021): contrastive "instance hierarchy" plus a "label hierarchy" loss; better than SOTA on a proprietary Amazon dataset. Names the two problems we have: class imbalance and "the inherent brevity and ambiguity of search queries" [V]. Relevance: confirms hierarchy helps; their method needs training data we do not have.
- **CoT query categorisation in e-commerce taxonomies** (Duraj et al., 2026, https://arxiv.org/abs/2601.00510; SIGIR eCom 2025 per arXiv comment): tree search plus LLM semantic scoring beats an embedding-based predictor on human-judged pairs, and "can detect problems within a hierarchical taxonomy" [V]. Company not named in the abstract [?]. Relevance: direct evidence for A1 + LLM over A3 alone.
- **Walmart INSPIRE** (Desai et al., 2026, https://arxiv.org/abs/2606.23889): grocery queries are "short, ambiguous ... often underspecifying critical preferences"; intent represented as "structured, multi dimensional attributes" (brand, flavour, dietary) predicted by a LoRA-distilled small LLM and injected into a bi-encoder [V]. Relevance: attribute facets (A2) are how a large grocer handles "chocolatada"-style underspecification. Sponsored-search focus.
- **JD-style semi-supervised query classification** (Yuan et al., 2025, https://arxiv.org/abs/2506.21049) [V]: click-based training creates a "Matthew vicious cycle". Low relevance: we have no click logs.
- Mercado Libre, Shopee: I did not find a primary paper on query → category with LLMs in this pass [?]. The Mercado Libre talk in `preference-to-selection-architectures.md` covers LLM query expansion before search, not taxonomy mapping.

### Entity linking to large label sets

- **BLINK** (Wu et al., 2019, https://arxiv.org/abs/1911.03814): bi-encoder retrieval, then cross-encoder rerank; each entity defined only by a short description; "linking with 5.9 million candidates in 2 milliseconds" [V]. Relevance: the reference two-stage design. Our "entity description" is Product Type name + aliases + example product names.
- **Entity linking agent for short QA questions** (Luo et al., 2025, https://arxiv.org/abs/2508.03865): existing EL methods "do not perform well on short, ambiguous user questions"; an LLM agent identifies mentions, retrieves candidates, decides [V]. Relevance: our inputs are even shorter.

### Extreme multi-label classification with LLMs

- **Infer-Retrieve-Rank** (above) [V]. Relevance: the fallback architecture if the vocabulary grows past what a prompt holds (several Online Stores, or adding many aliases and examples).

### Medical and food concept normalisation

- **Retrieve-Rank ICD-10-CM** (Kwan, 2024, https://arxiv.org/abs/2407.12849): 100% vs 6% (vanilla GPT-3.5) on 100 single-term conditions [V]. Caveat stated by the author: simplified inputs, small set. Relevance: single short terms, like ours; shows an LLM without the label list in context invents codes.
- **Off-the-shelf LLM clinical coding** (Boyle et al., 2023, https://arxiv.org/abs/2310.06552): uses the ICD hierarchy to search sparsely rather than iterate over all codes [V]. Relevance: A1.
- **Multistage UMLS normalisation** (Dobbins, 2024, https://arxiv.org/abs/2405.15122): LLM generates alternative phrasings, then prunes candidates from classic normalisers; +7.3 to +18.7 F1 with no fine-tuning [V]. Relevance: synonym generation + LLM pruning works on top of lexical retrieval.
- **SapBERT** (Liu et al., 2020, https://arxiv.org/abs/2010.11784): metric learning on UMLS synonyms for medical entity linking [V]. Relevance: synonymy is the core problem; our alias table is the poor man's version.
- **FoodOntoRAG** (Drole et al., 2026, https://arxiv.org/abs/2603.09758): food terms from labels and menus → ontology concepts. "A hybrid lexical–semantic retriever enumerates candidates; a selector agent chooses a best match with rationale; a separate scorer agent calibrates confidence; and, when confidence falls below a threshold, a synonym generator agent proposes reformulations to re-enter the loop." Avoids fine-tuning to survive "ontology drift" [V]. Relevance: **closest analogue found** — food domain, hybrid retrieval, threshold, reformulate-and-retry, no fine-tuning. Abstract gives no numbers.

### Intent classification with many intents

- Few-shot intent detection with fine-grained, semantically similar intents (Zhang et al., 2021, https://arxiv.org/abs/2109.06349) [V]: contrastive pre-training approach. Low relevance (needs training). I found no strong primary paper on retrieval + LLM intent routing over thousands of intents in this pass [?]; Infer-Retrieve-Rank is the closest.

### Ambiguity detection and clarifying questions

- **Qulac** (Aliannejadi et al., 2019, https://arxiv.org/abs/1907.06554): oracle experiments show "asking only one good question leads to over 170% retrieval performance improvement in terms of P@1" [V]. Relevance: one well-chosen question is worth a lot.
- **ClariQ / ConvAI3** (Aliannejadi et al., 2020, https://arxiv.org/abs/2009.11352): systems rank clarifying questions in mixed-initiative conversation [V].
- **AmbigQA** (Min et al., 2020, https://arxiv.org/abs/2004.10645): "over half of the questions in NQ-open are ambiguous" [V]. Relevance: expect many grocery words to be ambiguous ("leche" has 23 Tipos starting with "Leche" in our snapshot).
- **CLAMBER** (Zhang et al., 2024, https://arxiv.org/abs/2405.12063): ~12K items; current LLMs have "limited practical utility ... in identifying and clarifying ambiguous user queries", and CoT / few-shot "may result in overconfidence" [V]. Relevance: **do not let the LLM alone decide whether to ask**; give it the structure (children of a group) and let code decide. May be outdated for 2026 models [?].
- **Clarify When Necessary** (Zhang & Choi, 2023, https://arxiv.org/abs/2311.09469): splits the task into when to ask, what to ask, and how to use the answer; "intent-sim" estimates entropy over user intents to decide when to ask [V]. Relevance: our "when" = several plausible children with no stored default; our "what" = list the children.
- **Users and clarifying questions in product search** (Zou et al., 2020, https://arxiv.org/abs/2008.00279): users answered 11-21 questions on average; 12-17% of answers contradicted the target product; 66-84% found it helpful [V]. Relevance: Owners will answer, but keep questions few, and store the answer so it is asked once.

### Confidence calibration, selective prediction, conformal prediction

- **Selective classification** (Geifman & El-Yaniv, 2017, https://arxiv.org/abs/1705.08500): reject instances to guarantee a chosen risk, trading coverage [V]. Relevance: frame our thresholds as "error rate on auto-resolved items ≤ X% at maximum coverage".
- **Conformal prediction** (Angelopoulos & Bates, 2021, https://arxiv.org/abs/2107.07511): prediction sets that contain the truth with user-specified probability, distribution-free [V]. **LLM MCQA** (Kumar et al., 2023, https://arxiv.org/abs/2305.18404): conformal uncertainty "tightly correlated with prediction accuracy", useful for selective classification [V]. **KnowNo** (Ren et al., 2023, https://arxiv.org/abs/2307.01928): conformal prediction makes an LLM planner "ask for help when needed" with statistical guarantees while minimising help [V]. Relevance: exactly our ask-or-proceed rule — set size 1 → proceed, set size > 1 → ask among the set, empty → "nothing matches". Needs a calibration set and a per-candidate score.
- **Calibration of LLM confidence**: Kadavath et al. (2022, https://arxiv.org/abs/2207.05221): larger models are well calibrated on multiple choice "in the right format" [V]. Tian et al. (2023, https://arxiv.org/abs/2305.14975): for RLHF models including Claude, verbalised confidence was better calibrated than token probabilities [V]. Xiong et al. (2023, https://arxiv.org/abs/2306.13063): verbalised confidence "tend[s] to be overconfident"; consistency across samples helps [V]. Self-consistency (Wang et al., 2022, https://arxiv.org/abs/2203.11171) [V]. All are 2022-2023 and on older models; may be outdated for Claude 5.x [?].
- **Abstention survey** (Wen et al., 2024, https://arxiv.org/abs/2407.18418) [V] for further reading.

## Models

### Embeddings (only needed if we add A3/A4)

| Model | Evidence | Notes |
|---|---|---|
| multilingual-e5-large-instruct | MMTEB (2025): "the best-performing publicly available model is multilingual-e5-large-instruct with only 560 million parameters" (https://arxiv.org/abs/2502.13595) [V]. Card: 100 languages from XLM-R, query format `Instruct: {task}\nQuery: {query}`, cosine scores "roughly between 0.7 and 1.0", "relative order" matters (https://huggingface.co/intfloat/multilingual-e5-large-instruct) [V] | Strong default to evaluate; self-hostable. Scores are not usable as absolute thresholds without calibration. |
| bge-m3 | Dense, multi-vector and sparse retrieval in one model, 100+ languages (Chen et al., 2024, https://arxiv.org/abs/2402.03216) [V] | Built-in sparse output gives hybrid retrieval from one model. |
| jina-embeddings-v3 | 570M, task LoRA adapters, reports beating multilingual-e5-large-instruct on all multilingual tasks (Sturua et al., 2024, https://arxiv.org/abs/2409.10173) [V] | Vendor self-report; MMTEB (later) still names e5 the best public model [I: possibly different task sets]. |
| OpenAI text-embedding-3-small / -large | MTEB 62.3% / 64.6% (ada-002 61.0%) (https://developers.openai.com/api/docs/guides/embeddings) [V] | MTEB average is English-centric; the announcement page with MIRACL numbers returned HTTP 403 [?]. |
| Cohere embed | `embed-multilingual-v3.0` "supports over 100 languages, including Chinese, Spanish, and French"; newer `embed-v4.0`, `embed-v5.0-pro/fast` listed, language support not stated on that page (https://docs.cohere.com/docs/cohere-embed) [V] | |
| Voyage | Not checked [?]. | |

I could not verify a current Spanish-only MTEB ranking: the leaderboard is a JS app; a community "Spanish Embeddings Leaderboard" space showed a runtime error in search results [?]. Missing to verify: filtering the official leaderboard or `mteb` results repo by Spanish.

### Rerankers

- **bge-reranker-v2-m3**: 0.6B, built on bge-m3, multilingual; raw score mapped to [0,1] by sigmoid with `normalize=True`; evaluation numbers only as images (https://huggingface.co/BAAI/bge-reranker-v2-m3) [V].
- **Cohere rerank**: `rerank-v4.0-pro` and `rerank-v4.0-fast` are multilingual; `rerank-v3.5` and `rerank-multilingual-v3.0` also handle non-English (https://docs.cohere.com/docs/rerank) [V]. Scores are "normalized to be in the range [0, 1]" but not ratios; set thresholds from 30-50 representative queries paired with borderline documents (https://docs.cohere.com/docs/reranking-best-practices) [V].
- **Jina reranker**: not checked [?].

### LLMs (Claude 5 family, verified on platform.claude.com, 2026-10-13)

| | Haiku 5.5 | Sonnet 5.5 | Opus 5.5 |
|---|---|---|---|
| ID | `claude-haiku-5-5` | `claude-sonnet-5-5` | `claude-opus-5-5` |
| Described for | "high-volume, latency-sensitive tasks such as classification, extraction, and routing" | "best combination of speed and intelligence" | "long-running agentic coding and knowledge work" |
| Latency (comparative) | Fastest | Fast | Moderate |
| Input / output per MTok | $0.10 / $0.50 for prompts ≤100k tokens; $0.50 / $2.50 above | $2 / $10 | $4 / $20 |
| Cache read per MTok | $0.01 (≤100k) | $0.10 | $0.20 |
| Default effort | `medium` | `high` | `medium` |

Sources: https://platform.claude.com/docs/en/about-claude/models/overview, https://platform.claude.com/docs/en/models/haiku-5-5/overview (released October 7, 2026), https://platform.claude.com/docs/en/build-with-claude/prompt-caching [V].

Other verified facts:
- Minimum cacheable prompt is 512 tokens for Opus 5.5, Sonnet 5.5 and Haiku 5.5; 5-minute and 1-hour cache TTLs (prompt-caching page) [V].
- Haiku 5.5: "Omit `temperature`, `top_p`, and `top_k`" (sampling parameters return 400) [V]. So we cannot pin temperature; determinism comes from storing translations (ADR 0002), not from sampling settings.
- Structured outputs: `output_config.format` with `type: "json_schema"`, and strict tool use with `strict: true`; supported on `claude-haiku-5-5`, `claude-sonnet-5-5`, `claude-opus-5-5`. `enum` of strings is supported, but capitalisation of enum values is not guaranteed ("Compare enum values case-insensitively"); no recursive schemas, no `minLength`/`maximum` etc. (https://platform.claude.com/docs/en/build-with-claude/structured-outputs) [V]. A maximum enum size is not stated in what I read [?] — so put only the top-k candidate ids in the enum, or validate ids in code.
- No `logprobs` field: a grep of the full Messages API reference page (https://platform.claude.com/docs/en/api/messages/create, 1.48 MB HTML, 2026-10-13) found zero matches for "logprob" [V]. Token-probability confidence is therefore unavailable; confidence must be verbalised, sampled, or come from retrieval/agreement signals.
- Whether thinking can be turned off on Haiku 5.5, and its latency at `low` effort: not verified [?]. The Models API exposes `capabilities.thinking.types.disabled` to check this (models overview) [V].

Cost sketch [I]: a cached 20k-token vocabulary prompt read on Haiku 5.5 costs 20,000 × $0.01/MTok = $0.0002 per call, plus a 1-hour cache write of 20,000 × $0.20/MTok = $0.004 per hour of use. For a single Owner placing a few orders a week, cost is negligible whichever model; latency and accuracy decide.

Does a small model suffice? Anthropic positions Haiku 5.5 for classification [V], and Instacart and Mercado Libre moved query understanding to small models (8B, 4B) after evaluation (earlier note) [V]. Accuracy on Argentine grocery phrases is unverified [?]: run the eval set on Haiku 5.5 and Sonnet 5.5 and pick by numbers.

## Spanish and Argentine vocabulary

- Local evidence (`.data/carrefour/tipos.json`, 2026-10-13) [V]:
  - 23 Tipos start with "Leche" (Leche descremada 92 products, Leche entera 55, Leche en polvo infantil 52, Leche chocolatada 46, … Leche de almendra 16, Leche condensada 10, plus noise such as "Leche balsámica" 1 and "Lechera" 1).
  - "lactal" is a Tipo name ("Pan lactal", 65 products) but also appears in example names under "Pan para panchos" and "Pan de salvado"; ADR 0001 notes near-duplicates "Pan de molde" / "Pan lactal".
  - "sachet" is not a Tipo; it appears in example product names under "Leche entera", "Leche saborizada", "Yogur entero", "Ricotta", "Bebida láctea" and others. It is a package facet.
  - "chocolatada" maps cleanly to "Leche chocolatada" (46 products), but a bare "chocolate" hits 35 Tipos containing "chocolat".
- How aliases fit [I]: a global alias table (`alias → Product Type or Product Type Group`, plus optional facet) is the cheapest, deterministic layer and doubles as retrieval text (Product Type document = name + aliases + example names, as BLINK uses short descriptions). Seed it with the obvious Rioplatense terms and let it grow from confirmed Owner translations, the way SapBERT and Dobbins use synonym knowledge. Normalise accents and case before lookup ("fluída" vs "fluida" both appear in Carrefour names).
- Multilingual models handle Spanish, but none of the sources evaluated Rioplatense grocery slang specifically [?]; this is why the eval set must contain such phrases.

## Fit against A1–A5

| Option | Literature support | Pros for us | Cons / risks | Verdict |
|---|---|---|---|---|
| A1 Hierarchy, vague → inner node, ask among children or use stored default | ICD hierarchy search (Boyle 2023), CoT tree search for e-commerce (Duraj 2026), Amazon hierarchical classification (He 2024) [V] | Turns ambiguity into a structural fact; the clarifying question writes itself (list children); the Owner's answer becomes a per-group default | Building the tree: 2,203 Tipos need a parent; catch-all Tipos ("Snacks", "Postre") span Familias (catalog-mirror) | **Adopt, two levels only** (Group → Product Type). Seed groups from the head noun of the Tipo name and Carrefour Familia; LLM proposes, human confirms [I]. |
| A2 Product Type + facets | Instacart (product, brand, attributes), Walmart INSPIRE (multi-dimensional attributes) [V] | "sachet" and "larga vida" handled without exploding the vocabulary | Facet values must come from product data (names, specs) for code to filter | **Adopt for a small closed set** (package, size, maybe fat) where the Tipo does not already encode it. Fat is already in Tipos ("Leche entera"/"descremada") so it is a Product Type distinction, not a facet [V local data]. |
| A3 Embedding retrieval over Product Types with thresholds | BLINK, contextual retrieval, FoodOntoRAG [V] | Scales to many stores; gives a "nothing near" signal | Raw scores uncalibrated (e5 card, Cohere) [V]; thresholds need our own data; extra infra | **Defer; build as fallback / cross-check** once the vocabulary or Owner count grows. Use hybrid (lexical + dense), not dense only. |
| A4 Retrieval over products, group by Product Type | Product-level search is what Instacart/Walmart do for ranking [V] | Product names carry slang and brands ("Cindor" → chocolatada) | 37k grocery products vs 2k types; noisy (Carrefour search returns crisps for "pan", ADR 0001); votes skewed by how many products a Tipo has | **Use only as evidence**: example product names inside the Product Type document, not as the main index [I]. Brand-only requests ("un Cindor") are the case where it helps. |
| A5 Whole vocabulary in the prompt, LLM returns ranked candidates | Anthropic: <200k tokens can skip RAG [V]; Kwan: LLM without the list in context fails (6%) [V]; lost-in-the-middle degradation in long contexts (Liu et al., 2023, https://arxiv.org/abs/2307.03172) [V], 2023 models, may be outdated [?] | Simplest; no embedding infra; cheap with caching; the LLM sees all siblings, so it can say "ambiguous between X, Y" | Confidence numbers overconfident (Xiong) [V]; vocabulary changes invalidate the cache; scales poorly to several stores | **Adopt for v1** with structured output, ids validated in code, and the Group structure in the prompt. |
| Per-Owner memory of resolved phrases | Instacart cache for frequent queries [V]; retrieval-augmented classification with stored neighbours (Liang 2023) [V]; ADR 0002 requires it | Determinism, zero latency, learns Owner's defaults | Stale if a Product Type is split or merged — needs migration | **Mandatory, first stage.** |

## Recommended pipeline

All stages run per Item. Code decides; the LLM only proposes.

0. **Parse** [I]. One LLM call per order (or rules) splits the order into Items and separates quantity and unit words ("medio", "2 kg") from the product phrase. Normalise the phrase: lowercase, strip accents, collapse spaces, singularise simple plurals. This normalised phrase is the memory key.
1. **Owner memory** (`owner_translation`: owner, normalised phrase → Product Type id or Group id, facets, source = `owner_confirmed` | `auto`, created_at, vocabulary_version). Hit → done. No LLM. This is what makes the same words resolve the same way next time.
2. **Global alias table** (`alias`: normalised alias → Product Type id or Group id, facets). Exact hit on a Product Type → done; hit on a Group → go to step 5.
3. **Candidate generation** (LLM, Haiku 5.5, cached system prompt). Prompt holds the vocabulary as Groups with their Product Types (id, name, a few aliases), and a few worked Argentine examples. Output via strict tool / JSON schema:
   `{ status: "match" | "ambiguous" | "none", product_type_ids: string[] (ranked, ≤5), group_id?: string, facets?: {package?: ..., size?: ...}, rewrite?: string }`.
   Ask for categorical status, not a probability: verbalised confidence is overconfident [V]. Code drops any id not in the vocabulary (Instacart's guardrail) [V].
4. **Cross-check** (cheap, code). Lexical match of the phrase against names + aliases + example product names. If the LLM says `match` but the lexical layer finds no overlap and the phrase is not a known paraphrase, downgrade to `ambiguous` [I]. Later, when A3 exists, use hybrid retrieval rank here instead.
5. **Decision rule (code)**.
   - `match` with one id → resolved; store with source `auto`.
   - `ambiguous`, ids all in one Group, and the Owner has a stored default for that Group → use the default; store.
   - `ambiguous` otherwise → **ask**: "¿Qué leche? Entera / Descremada / Chocolatada / En polvo / Otra" — options = the returned ids (≤5) ordered by product count in the snapshot, plus "Otra". Owner's answer stored with source `owner_confirmed`, and also as the Group default if the Owner says so ("siempre entera").
   - `none` → one retry with the LLM's `rewrite` (CRAG / FoodOntoRAG reformulation) [V pattern]; still `none` → "No encontré «X». ¿Qué querés decir?" and store nothing until answered.
   - Later, replace the categorical rule with a conformal rule (KnowNo): calibrate a per-candidate score on the eval set so the candidate set covers the right answer ≥ 95%; set size 1 → proceed, >1 → ask among the set, 0 → "nothing matches" [V method, I application].
6. **Store everything**: phrase, LLM output, decision, Owner answer, vocabulary version. These rows are (a) the memory, (b) new aliases after review, (c) the growing eval set.

What short-circuits what: memory (1) → alias (2) → LLM (3-5). After the first few orders most Items should resolve at step 1 with no LLM call [I].

## Open questions / what to test

1. **Eval set** (build before choosing models): 150-300 Argentine phrases, each labelled with the gold Product Type, or the gold Group + "should ask", or "none". Include: plain ("yerba", "huevos"); vague ("leche", "pan", "queso"); slang ("lactal", "chocolatada", "sachet", "saché", "larga vida", "la serenísima" as brand-only); typos and missing accents; quantity mixed in ("medio sachet de leche"); non-grocery or nonsense ("pilas", "asdf") for `none`. Owner-specific defaults tested separately.
2. **Metrics**: accuracy on auto-resolved items (selective risk); coverage (share auto-resolved); ask rate; "should ask but did not" (silent wrong answers — the costly error); "asked but unnecessary"; `none` precision/recall; p50/p95 latency; stability (run each phrase 5 times, measure label agreement, since temperature cannot be fixed on Haiku 5.5).
3. **Model comparison**: Haiku 5.5 vs Sonnet 5.5 at effort `low` and default, A5 prompt; target: ≤2% silent wrong answers at the highest coverage [I target].
4. **Lost-in-the-middle check**: shuffle the vocabulary order in the prompt and compare accuracy; if it moves, add A3 retrieval to put top-k first.
5. **Grouping**: how many Groups the 2,203 Tipos collapse into, and how many Tipos are junk ("Leche balsámica", "Porta detergente") that should be filtered out of the grocery vocabulary.
6. **Facets**: which facets can code actually filter on from Carrefour data (package from product name? `Gramaje de unidad de medida`?). Only keep facets code can apply.
7. **Embedding choice** (only if A3 is needed): multilingual-e5-large-instruct vs bge-m3 vs one hosted model, recall@10 on the eval set.
8. **Unverified items to close**: Spanish MTEB ranking; Haiku 5.5 thinking-off support and latency; maximum enum size in structured outputs; OpenAI MIRACL numbers (403); Jina and Voyage rerankers/embeddings; Mercado Libre / Shopee taxonomy papers.

## Sources

Papers (arXiv, first-submission date):
- Lewis et al., RAG, 2020-05-22: https://arxiv.org/abs/2005.11401
- Nogueira & Cho, Passage re-ranking with BERT, 2019-01-13: https://arxiv.org/abs/1901.04085
- Gao et al., HyDE, 2022-12-20: https://arxiv.org/abs/2212.10496
- Wang et al., Query2doc, 2023-03-14: https://arxiv.org/abs/2303.07678
- Sarthi et al., RAPTOR, 2024-01-31: https://arxiv.org/abs/2401.18059
- Edge et al., GraphRAG, 2024-04-24: https://arxiv.org/abs/2404.16130
- Asai et al., Self-RAG, 2023-10-17: https://arxiv.org/abs/2310.11511
- Yan et al., Corrective RAG, 2024-01-29: https://arxiv.org/abs/2401.15884
- Liang et al., Retrieval-Augmented Classification with Decoupled Representation, 2023-03-23: https://arxiv.org/abs/2303.13065
- D'Oosterlinck et al., Infer-Retrieve-Rank, 2024-01-22: https://arxiv.org/abs/2401.12178
- Tay et al., DSI, 2022-02-14: https://arxiv.org/abs/2202.06991
- He et al., Hierarchical Query Classification in E-commerce Search (Amazon dataset), 2024-03-09: https://arxiv.org/abs/2403.06021
- Duraj et al., CoT Semantic Query Categorization in e-Commerce Taxonomies, 2026-01-01: https://arxiv.org/abs/2601.00510
- Desai et al., INSPIRE (Walmart), 2026-06-22: https://arxiv.org/abs/2606.23889
- Yuan et al., Semi-supervised Unified Framework for E-commerce Query Classification, 2025-06-26: https://arxiv.org/abs/2506.21049
- Wu et al., BLINK, 2019-11-10: https://arxiv.org/abs/1911.03814
- Luo et al., Entity Linking Agent for QA, 2025-08-05: https://arxiv.org/abs/2508.03865
- Kwan, LLMs are good medical coders if provided with tools, 2024-07-06: https://arxiv.org/abs/2407.12849
- Boyle et al., Automated clinical coding with off-the-shelf LLMs, 2023-10-10: https://arxiv.org/abs/2310.06552
- Dobbins, Multistage Biomedical Concept Normalization with LLMs, 2024-05-24: https://arxiv.org/abs/2405.15122
- Liu et al., SapBERT, 2020-10-22: https://arxiv.org/abs/2010.11784
- Drole et al., FoodOntoRAG, 2026-03-10: https://arxiv.org/abs/2603.09758
- Zhang et al., Few-shot intent detection, 2021-09-13: https://arxiv.org/abs/2109.06349
- Aliannejadi et al., Qulac, 2019-07-15: https://arxiv.org/abs/1907.06554
- Aliannejadi et al., ClariQ, 2020-09-23: https://arxiv.org/abs/2009.11352
- Min et al., AmbigQA, 2020-04-22: https://arxiv.org/abs/2004.10645
- Zhang et al., CLAMBER, 2024-05-20: https://arxiv.org/abs/2405.12063
- Zhang & Choi, Clarify When Necessary, 2023-11-16: https://arxiv.org/abs/2311.09469
- Zou et al., Empirical study of clarifying-question systems, 2020-08-01: https://arxiv.org/abs/2008.00279
- Geifman & El-Yaniv, Selective classification, 2017-05-23: https://arxiv.org/abs/1705.08500
- Angelopoulos & Bates, Conformal prediction intro, 2021-07-15: https://arxiv.org/abs/2107.07511
- Kumar et al., Conformal prediction with LLMs for MCQA, 2023-05-28: https://arxiv.org/abs/2305.18404
- Ren et al., KnowNo, 2023-07-04: https://arxiv.org/abs/2307.01928
- Kadavath et al., LMs (mostly) know what they know, 2022-07-11: https://arxiv.org/abs/2207.05221
- Tian et al., Just Ask for Calibration, 2023-05-24: https://arxiv.org/abs/2305.14975
- Xiong et al., Can LLMs express their uncertainty?, 2023-06-22: https://arxiv.org/abs/2306.13063
- Wang et al., Self-consistency, 2022-03-21: https://arxiv.org/abs/2203.11171
- Wen et al., Survey of abstention in LLMs, 2024-07-25: https://arxiv.org/abs/2407.18418
- Liu et al., Lost in the Middle, 2023-07-06: https://arxiv.org/abs/2307.03172
- Wang et al., Multilingual E5 technical report, 2024-02-08: https://arxiv.org/abs/2402.05672
- Chen et al., BGE M3-Embedding, 2024-02-05: https://arxiv.org/abs/2402.03216
- Sturua et al., jina-embeddings-v3, 2024-09-16: https://arxiv.org/abs/2409.10173
- Enevoldsen et al., MMTEB, 2025-02-19: https://arxiv.org/abs/2502.13595

Docs, model cards, engineering posts:
- Anthropic, Contextual Retrieval, 2024-09-19: https://www.anthropic.com/news/contextual-retrieval
- Claude models overview: https://platform.claude.com/docs/en/about-claude/models/overview
- Claude Haiku 5.5 overview: https://platform.claude.com/docs/en/models/haiku-5-5/overview
- Claude prompt caching: https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- Claude structured outputs: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
- Claude Messages API reference: https://platform.claude.com/docs/en/api/messages/create
- multilingual-e5-large-instruct card: https://huggingface.co/intfloat/multilingual-e5-large-instruct
- bge-reranker-v2-m3 card: https://huggingface.co/BAAI/bge-reranker-v2-m3
- Cohere rerank models: https://docs.cohere.com/docs/rerank
- Cohere reranking best practices: https://docs.cohere.com/docs/reranking-best-practices
- Cohere embed models: https://docs.cohere.com/docs/cohere-embed
- OpenAI embeddings guide: https://developers.openai.com/api/docs/guides/embeddings
- Instacart, Building the Intent Engine: https://company.instacart.com/tech-innovation/building-the-intent-engine-how-instacart-is-revamping-query-understanding-with-llms

Repo:
- `.data/carrefour/tipos.json` (2026-10-13T19:35Z snapshot; not committed)
- `.scratch/carrefour-cart/research/catalog-mirror.md`
- `.scratch/carrefour-cart/research/preference-to-selection-architectures.md`
- `docs/adr/0001-own-product-types-mapped-from-each-online-store.md`, `docs/adr/0002-llm-translates-preferences-code-picks-products.md`
