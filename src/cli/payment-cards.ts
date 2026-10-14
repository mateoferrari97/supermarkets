import { loadPaymentCards } from "../compose.ts";
import { reportChecked } from "./report.ts";

reportChecked(loadPaymentCards(), "Payment Card table is valid");
