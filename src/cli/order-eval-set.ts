import { loadEvalSet } from "../compose.ts";
import { reportChecked } from "./report.ts";

reportChecked(loadEvalSet(), "Order matching eval set is valid");
