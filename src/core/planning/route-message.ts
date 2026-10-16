export const TOPICS = ["order", "plan", "off-topic"] as const;

export type Topic = (typeof TOPICS)[number];

export type RouteMessageOutput = { topic: Topic };

export type RouteMessageLlm = {
  routeMessage(text: string, signal: AbortSignal): Promise<RouteMessageOutput>;
};
