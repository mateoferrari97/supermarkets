import { loadTurnLog } from "../compose.ts";
import { fail } from "./report.ts";
import { DEFAULT_TURNS, formatTurns } from "./chat-turns-report.ts";

const args = process.argv.slice(2);
const usage = "Usage: pnpm chat:turns [N], N a whole number of at least 1";
if (args.length > 1) fail([usage]);
const last = args[0] === undefined ? DEFAULT_TURNS : Number(args[0]);
if (!Number.isInteger(last) || last < 1) fail([usage]);

const turnLog = loadTurnLog();
if (!turnLog.found) {
  console.log("There is no Turn Log yet: no turn of the Chat has been recorded.");
  process.exit(0);
}
for (const error of turnLog.errors) console.error(`Skipped: ${error}`);
console.log(formatTurns(turnLog.entries, last));
