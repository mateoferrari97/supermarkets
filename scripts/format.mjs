import { spawnSync } from "node:child_process";

const mode = process.argv.includes("--check") ? "--check" : "--write";
const result = spawnSync("prettier", [mode, "."], { stdio: "inherit" });
process.exit(result.status ?? 1);
