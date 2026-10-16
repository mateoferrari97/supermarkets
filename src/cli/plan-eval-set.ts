import { loadPlanningEvalSet } from "../compose.ts";
import { reportChecked } from "./report.ts";

reportChecked(loadPlanningEvalSet(), "Planning eval set is valid");
