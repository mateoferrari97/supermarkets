import type { ChatOrder } from "./order.ts";

export type OrdersStore = {
  load: () => ChatOrder[];
  save: (orders: ChatOrder[]) => void;
};
