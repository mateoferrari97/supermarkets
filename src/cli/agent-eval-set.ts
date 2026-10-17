import { loadAgentEvalSet } from "../compose.ts";
import { reportChecked } from "./report.ts";

reportChecked(loadAgentEvalSet(), "Agent eval set is valid");
