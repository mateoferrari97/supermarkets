import { loadEvalSet } from "../compose.ts";
import { reportChecked } from "./report.ts";

reportChecked(loadEvalSet(), "Order resolution eval set is valid");
