import type { TipoMapping, Vocabulary } from "../product-types/schema.ts";
import { buildBm25Index } from "./bm25.ts";
import { distinctSizes, nameMatchesTerm, productMatchesBrand } from "./catalog.ts";
import type { Evidence, Item, Llm, MapAnswerOutput, QuestionInput } from "./llm.ts";

export const EVIDENCE_LIMIT = 10;

export type CatalogProduct = {
  name: string;
  brand: string | null;
  tipo: string | null;
  inStock: boolean;
};

export type ProductTypeRef = { id: string; name: string };

export type Question =
  | { kind: "productType"; reason: "group" | "ambiguous"; options: ProductTypeRef[] }
  | { kind: "phrase" }
  | { kind: "term"; term: string }
  | { kind: "size"; options: string[] };

export type OrderItem = Item & { productTypes: ProductTypeRef[]; question: Question | null };

export type OrderResolution = {
  items: OrderItem[];
  postalCode: string | null;
  message: string | null;
};

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

type Answer = MapAnswerOutput["answers"][number];

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

  const candidateProducts = (item: Item, types: ProductTypeRef[]) => {
    const ids = new Set(types.map(({ id }) => id));
    return indexed
      .filter(({ productType }) => ids.has(productType.id))
      .map(({ product }) => product)
      .filter((product) => !item.brand || productMatchesBrand(product, item.brand));
  };

  const settle = (item: Item, types: ProductTypeRef[]): OrderItem => {
    const candidates = candidateProducts(item, types);
    const missing = item.terms.find(
      (term) => !candidates.some(({ name }) => nameMatchesTerm(name, term)),
    );
    if (missing !== undefined) {
      return { ...item, productTypes: types, question: { kind: "term", term: missing } };
    }
    if (item.vagueWords.length > 0) {
      const inStock = candidates.filter(
        (product) =>
          product.inStock && item.terms.every((term) => nameMatchesTerm(product.name, term)),
      );
      const sizes = distinctSizes(inStock.map(({ name }) => name)).map(({ label }) => label);
      if (sizes.length > 0) {
        return { ...item, productTypes: types, question: { kind: "size", options: sizes } };
      }
    }
    return { ...item, productTypes: types, question: null };
  };

  const attempt = async (item: Item, phrase: string): Promise<OrderItem> => {
    const query = { ...item, phrase };
    const answer = await llm.resolveItem({ item: query, evidence: evidenceFor(query) });
    const known = answer.candidates.filter((id) => productTypes.has(id) || groupChildren.has(id));
    const candidates = expand(known);
    if (candidates.length === 0 || answer.kind === "none") {
      return { ...item, productTypes: [], question: { kind: "phrase" } };
    }
    const [only] = candidates;
    if (answer.kind === "match" && candidates.length === 1 && only && productTypes.has(known[0]!)) {
      return settle(item, [only]);
    }
    const reason = known.some((id) => groupChildren.has(id)) ? "group" : "ambiguous";
    return {
      ...item,
      productTypes: [],
      question: { kind: "productType", reason, options: candidates },
    };
  };

  const resolveItem = async (item: Item): Promise<OrderItem> => {
    const first = await attempt(item, item.phrase);
    if (first.question?.kind !== "phrase") return first;
    const { phrase } = await llm.rewordItem({ item, evidence: evidenceFor(item) });
    return attempt(item, phrase);
  };

  const apply = (orderItem: OrderItem, answer: Answer): Promise<OrderItem> | null => {
    const { question } = orderItem;
    const item = itemFields(orderItem);
    if (!question) return null;
    switch (question.kind) {
      case "productType": {
        const chosen =
          answer.kind === "any"
            ? question.options
            : answer.kind === "chosen"
              ? question.options.filter((_, index) => answer.options.includes(index + 1))
              : [];
        return chosen.length > 0 ? Promise.resolve(settle(item, chosen)) : null;
      }
      case "phrase":
        return answer.kind === "rephrased" && answer.phrase
          ? resolveItem({ ...item, phrase: answer.phrase })
          : null;
      case "term": {
        const others = item.terms.filter((term) => term !== question.term);
        if (answer.kind === "any") {
          return Promise.resolve(settle({ ...item, terms: others }, orderItem.productTypes));
        }
        if (answer.kind === "rephrased" && answer.phrase) {
          const terms = [...others, answer.phrase];
          return Promise.resolve(settle({ ...item, terms }, orderItem.productTypes));
        }
        return null;
      }
      case "size": {
        if (answer.kind === "any") {
          return Promise.resolve(settle({ ...item, vagueWords: [] }, orderItem.productTypes));
        }
        const chosen = question.options.filter((_, index) => answer.options.includes(index + 1));
        if (answer.kind !== "chosen" || chosen.length !== 1) return null;
        const terms = [...item.terms, ...chosen];
        return Promise.resolve(settle({ ...item, terms, vagueWords: [] }, orderItem.productTypes));
      }
    }
  };

  const answerQuestions = async (
    resolution: OrderResolution,
    answerText: string,
  ): Promise<OrderResolution> => {
    const questions = questionsOf(resolution.items);
    const postalQuestion = resolution.postalCode === null ? questions.length + 1 : null;
    if (questions.length === 0 && postalQuestion === null) return resolution;
    const { answers } = await llm.mapAnswer({
      questions: [
        ...questions.map(({ question, item }) => questionInput(question, item)),
        ...(postalQuestion === null ? [] : [postalCodeInput(postalQuestion)]),
      ],
      answer: answerText,
    });

    let postalCode = resolution.postalCode;
    const updates = new Map<OrderItem, Promise<OrderItem>>();
    for (const answer of answers) {
      if (answer.question === postalQuestion) {
        if (answer.kind === "rephrased" && answer.phrase)
          postalCode ??= postalCodeFrom(answer.phrase);
        continue;
      }
      const item = questions.find(({ question }) => question === answer.question)?.item;
      if (!item || updates.has(item)) continue;
      const update = apply(item, answer);
      if (update) updates.set(item, update);
    }

    return withMessage(
      await Promise.all(resolution.items.map((item) => updates.get(item) ?? Promise.resolve(item))),
      postalCode,
    );
  };

  return {
    resolveOrder: async (orderText) => {
      const { items, postalCode } = await llm.splitOrder(orderText);
      return withMessage(
        await Promise.all(items.map(resolveItem)),
        postalCode === null ? null : postalCodeFrom(postalCode),
      );
    },
    answerQuestions,
  };
}

export function postalCodeFrom(text: string): string | null {
  return /\d{4}/.exec(text)?.[0] ?? null;
}

function itemFields(orderItem: OrderItem): Item {
  const { productTypes: _productTypes, question: _question, ...item } = orderItem;
  return item;
}

type Asked = { question: number; item: OrderItem & { question: Question } };

function questionsOf(items: OrderItem[]): Asked[] {
  return items
    .filter((item): item is Asked["item"] => item.question !== null)
    .map((item, index) => ({ question: index + 1, item }));
}

function optionNames(question: Question): string[] {
  if (question.kind === "productType") return question.options.map(({ name }) => name);
  if (question.kind === "size") return question.options;
  return [];
}

function questionInput(number: number, item: Asked["item"]): QuestionInput {
  return {
    question: number,
    phrase: item.phrase,
    asks: item.question.kind,
    term: item.question.kind === "term" ? item.question.term : null,
    options: optionNames(item.question).map((name, index) => ({ option: index + 1, name })),
  };
}

function postalCodeInput(number: number): QuestionInput {
  return { question: number, phrase: "código postal", asks: "postalCode", term: null, options: [] };
}

function questionText(number: number, item: Asked["item"]): string {
  const { question, phrase } = item;
  const options = optionNames(question).map((name, index) => `   ${index + 1}) ${name}`);
  switch (question.kind) {
    case "productType":
      return [`${number}. Para "${phrase}", ¿cuál querés?`, ...options].join("\n");
    case "phrase":
      return `${number}. No encontré "${phrase}". ¿A qué te referís?`;
    case "term": {
      const names = item.productTypes.map(({ name }) => name).join(" ni ");
      return `${number}. Para "${phrase}", no hay ${names} con "${question.term}". ¿Lo saco o lo cambio por otra cosa?`;
    }
    case "size":
      return [
        `${number}. Para "${phrase}" (${item.vagueWords.join(", ")}), ¿qué tamaño?`,
        ...options,
      ].join("\n");
  }
}

function withMessage(items: OrderItem[], postalCode: string | null): OrderResolution {
  const questions = questionsOf(items);
  const asked = questions.map(({ question, item }) => questionText(question, item));
  if (postalCode === null) {
    asked.push(`${questions.length + 1}. ¿A qué código postal es el envío?`);
  }
  if (asked.length === 0) return { items, postalCode, message: null };
  const intro = asked.length === 1 ? "Tengo una pregunta:" : "Tengo unas preguntas:";
  const outro = questions.some(({ item }) => optionNames(item.question).length > 0)
    ? 'Respondé con el número o con palabras ("la 2", "entera"), o "cualquiera" si te da igual.'
    : null;
  const parts = [intro, ...asked, ...(outro ? [outro] : [])];
  return { items, postalCode, message: parts.join("\n\n") };
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
