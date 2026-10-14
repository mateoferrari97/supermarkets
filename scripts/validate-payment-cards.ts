import { validatePaymentCards } from "../src/core/product-selection/payment-cards.ts";
import { PAYMENT_CARDS_PATH } from "./order-files.ts";
import { readJson } from "./seed-files.ts";

const errors = validatePaymentCards(readJson(PAYMENT_CARDS_PATH));

for (const error of errors) console.error(error);
if (errors.length > 0) process.exit(1);
console.log("Payment Card table is valid");
