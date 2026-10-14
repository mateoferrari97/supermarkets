import { loadPart, loadProposal } from "../compose.ts";
import { fail, valueOf } from "./report.ts";

const partId = process.argv[2];
if (!partId) fail(["Usage: pnpm seed:check-proposal <part-id>"]);

const part = valueOf(loadPart(partId));
valueOf(loadProposal(part));
console.log(`Proposal for ${partId} is valid: ${part.tipos.length} Tipos placed`);
