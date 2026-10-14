import type { TipoMapping, Vocabulary } from "../product-types/schema.ts";
import { buildBm25Index } from "./bm25.ts";
import type { Evidence, Item, Llm, QuestionInput } from "./llm.ts";

export const EVIDENCE_LIMIT = 10;

export type CatalogProduct = { name: string; brand: string | null; tipo: string | null };

export type ProductTypeRef = { id: string; name: string };

export type ResolvedItem = Item & { status: "resolved"; productTypes: ProductTypeRef[] };

export type PendingItem = Item & {
  status: "pending";
  reason: "group" | "ambiguous" | "none";
  candidates: ProductTypeRef[];
};

export type OrderItem = ResolvedItem | PendingItem;

export type OrderResolution = { items: OrderItem[]; message: string | null };

export type OrderDependencies = {
  products: CatalogProduct[];
  vocabulary: Vocabulary;
  mapping: TipoMapping;
  llm: Llm;
};

export type OrderResolver = {
  resolveOrder: (orderText: string) => Promise<OrderResolution>;
  answerQuestions: (resolution: OrderResolution, answerText: string) => Promise<OrderResolution>;
};

export function createOrderResolver({
  products,
  vocabulary,
  mapping,
  llm,
}: OrderDependencies): OrderResolver {
  const productTypes = new Map<string, ProductTypeRef>();
  const groupChildren = new Map<string, ProductTypeRef[]>();
  for (const group of vocabulary.groups) {
    groupChildren.set(group.id, group.productTypes);
    for (const productType of group.productTypes) productTypes.set(productType.id, productType);
  }

  const indexed = products.flatMap((product) => {
    const id = product.tipo ? mapping[product.tipo] : undefined;
    const productType = id ? productTypes.get(id) : undefined;
    return productType ? [{ product, productType }] : [];
  });
  const index = buildBm25Index(
    indexed.map(({ product }) => [product.name, product.brand ?? ""].join(" ")),
  );

  const evidenceFor = (item: Item): Evidence[] => {
    const query = [item.phrase, item.brand ?? "", ...item.terms].join(" ");
    const seen = new Set<string>();
    return index
      .search(query, EVIDENCE_LIMIT * 3)
      .map((position) => indexed[position]!)
      .filter(({ product }) => !seen.has(product.name) && seen.add(product.name))
      .slice(0, EVIDENCE_LIMIT)
      .map(({ product, productType }) => ({
        product: product.name,
        productTypeId: productType.id,
        productTypeName: productType.name,
      }));
  };

  const expand = (ids: string[]) => {
    const refs = new Map<string, ProductTypeRef>();
    for (const id of ids) {
      const productType = productTypes.get(id);
      if (productType) refs.set(productType.id, productType);
      for (const child of groupChildren.get(id) ?? []) refs.set(child.id, child);
    }
    return [...refs.values()];
  };

  const attempt = async (item: Item, phrase: string): Promise<OrderItem> => {
    const query = { ...item, phrase };
    const answer = await llm.resolveItem({ item: query, evidence: evidenceFor(query) });
    const known = answer.candidates.filter((id) => productTypes.has(id) || groupChildren.has(id));
    const candidates = expand(known);
    if (candidates.length === 0 || answer.kind === "none") {
      return { ...item, status: "pending", reason: "none", candidates: [] };
    }
    const [only] = candidates;
    if (answer.kind === "match" && candidates.length === 1 && only && productTypes.has(known[0]!)) {
      return { ...item, status: "resolved", productTypes: [only] };
    }
    const reason = known.some((id) => groupChildren.has(id)) ? "group" : "ambiguous";
    return { ...item, status: "pending", reason, candidates };
  };

  const resolveItem = async (item: Item): Promise<OrderItem> => {
    const first = await attempt(item, item.phrase);
    if (first.status === "resolved" || first.reason !== "none") return first;
    const { phrase } = await llm.rewordItem({ item, evidence: evidenceFor(item) });
    return attempt(item, phrase);
  };

  const answerQuestions = async (
    resolution: OrderResolution,
    answerText: string,
  ): Promise<OrderResolution> => {
    const questions = questionsOf(resolution.items);
    if (questions.length === 0) return resolution;
    const { answers } = await llm.mapAnswer({
      questions: questions.map(({ question, item }) => ({
        question,
        phrase: item.phrase,
        options: item.candidates.map(({ name }, index) => ({ option: index + 1, name })),
      })),
      answer: answerText,
    });

    const updates = new Map<PendingItem, Promise<OrderItem>>();
    for (const answer of answers) {
      const item = questions.find(({ question }) => question === answer.question)?.item;
      if (!item || updates.has(item)) continue;
      if (item.candidates.length === 0) {
        if (answer.kind === "rephrased" && answer.phrase) {
          updates.set(item, resolveItem({ ...pendingItemFields(item), phrase: answer.phrase }));
        }
        continue;
      }
      const chosen =
        answer.kind === "any"
          ? item.candidates
          : answer.kind === "chosen"
            ? item.candidates.filter((_, index) => answer.options.includes(index + 1))
            : [];
      if (chosen.length > 0) {
        updates.set(
          item,
          Promise.resolve({ ...pendingItemFields(item), status: "resolved", productTypes: chosen }),
        );
      }
    }

    return withMessage(
      await Promise.all(
        resolution.items.map((item) =>
          item.status === "pending"
            ? (updates.get(item) ?? Promise.resolve(item))
            : Promise.resolve(item),
        ),
      ),
    );
  };

  return {
    resolveOrder: async (orderText) => {
      const { items } = await llm.splitOrder(orderText);
      return withMessage(await Promise.all(items.map(resolveItem)));
    },
    answerQuestions,
  };
}

function pendingItemFields(pending: PendingItem): Item {
  const { reason: _reason, candidates: _candidates, status: _status, ...item } = pending;
  return item;
}

type Question = Pick<QuestionInput, "question"> & { item: PendingItem };

function questionsOf(items: OrderItem[]): Question[] {
  return items
    .filter((item): item is PendingItem => item.status === "pending")
    .map((item, index) => ({ question: index + 1, item }));
}

function withMessage(items: OrderItem[]): OrderResolution {
  const questions = questionsOf(items);
  if (questions.length === 0) return { items, message: null };
  const asked = questions.map(({ question, item }) => {
    if (item.candidates.length === 0) {
      return `${question}. No encontré "${item.phrase}". ¿A qué te referís?`;
    }
    const options = item.candidates.map(({ name }, index) => `   ${index + 1}) ${name}`);
    return [`${question}. Para "${item.phrase}", ¿cuál querés?`, ...options].join("\n");
  });
  const intro = questions.length === 1 ? "Tengo una pregunta:" : "Tengo unas preguntas:";
  const outro = questions.some(({ item }) => item.candidates.length > 0)
    ? 'Respondé con el número o con palabras ("la 2", "entera"), o "cualquiera" si te da igual.'
    : null;
  const parts = [intro, ...asked, ...(outro ? [outro] : [])];
  return { items, message: parts.join("\n\n") };
}

export function resolveOrder(
  orderText: string,
  dependencies: OrderDependencies,
): Promise<OrderResolution> {
  return createOrderResolver(dependencies).resolveOrder(orderText);
}

export function answerQuestions(
  resolution: OrderResolution,
  answerText: string,
  dependencies: OrderDependencies,
): Promise<OrderResolution> {
  return createOrderResolver(dependencies).answerQuestions(resolution, answerText);
}
