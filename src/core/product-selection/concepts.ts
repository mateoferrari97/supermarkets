export type Measure = { dimension: "volume" | "weight"; amount: number };

export type PaymentCard = { paymentSystem: string; bin: string | null };
