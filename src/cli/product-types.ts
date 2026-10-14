import { loadProductTypes } from "../compose.ts";
import { reportChecked } from "./report.ts";

reportChecked(loadProductTypes(), "Product Type vocabulary and Carrefour mapping are valid");
