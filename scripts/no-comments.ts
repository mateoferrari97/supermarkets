import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export type CommentFinding = { path: string; line: number };

type Language = "script" | "sql" | "shell";
type RawComment = { index: number; body: string };

const IGNORED_DIRECTORIES = [".scratch/", ".claude/", "node_modules/", ".data/"];
const SCRIPT_EXTENSIONS = [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs"];
const DIRECTIVE = /^\s*(?:eslint-disable|eslint-enable|@ts-expect-error|@ts-ignore)(?=$|[\s-])/;
const REFERENCE_DIRECTIVE = /^\/\s*<reference\s/;
const REGEX_PRECEDERS = new Set([
  "",
  "(",
  ",",
  "=",
  ":",
  "[",
  "!",
  "&",
  "|",
  "?",
  "{",
  "}",
  ";",
  "+",
  "-",
  "*",
  "%",
  "<",
  ">",
  "~",
  "^",
  "return",
  "typeof",
  "case",
  "delete",
  "void",
  "throw",
  "in",
  "of",
  "instanceof",
  "new",
  "yield",
  "await",
  "do",
  "else",
]);

function languageOf(path: string): Language | null {
  if (path.endsWith(".sql")) return "sql";
  if (path.startsWith(".githooks/") || path.endsWith(".sh")) return "shell";
  if (SCRIPT_EXTENSIONS.some((extension) => path.endsWith(extension))) return "script";
  return null;
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (text[i] === "\n") line++;
  return line;
}

function endOfLine(text: string, from: number): number {
  const end = text.indexOf("\n", from);
  return end === -1 ? text.length : end;
}

function skipQuoted(
  text: string,
  start: number,
  quote: string,
  escapes: boolean,
  singleLine = false,
): number {
  let i = start + 1;
  while (i < text.length) {
    if (singleLine && text[i] === "\n") return i;
    if (escapes && text[i] === "\\") i += 2;
    else if (text[i] === quote) {
      if (!escapes && text[i + 1] === quote) i += 2;
      else return i + 1;
    } else i++;
  }
  return text.length;
}

function skipRegex(text: string, start: number): number {
  let i = start + 1;
  let inClass = false;
  while (i < text.length && text[i] !== "\n") {
    const char = text[i];
    if (char === "\\") i += 2;
    else if (char === "[") {
      inClass = true;
      i++;
    } else if (char === "]") {
      inClass = false;
      i++;
    } else if (char === "/" && !inClass) return i + 1;
    else i++;
  }
  return i;
}

function readBlockComment(text: string, start: number): { comment: RawComment; end: number } {
  const close = text.indexOf("*/", start + 2);
  const end = close === -1 ? text.length : close + 2;
  const body = text.slice(start + 2, close === -1 ? end : close);
  return { comment: { index: start, body }, end };
}

function scanScript(text: string): RawComment[] {
  const found: RawComment[] = [];
  const templateDepths: number[] = [];
  let braces = 0;
  let previous = "";
  let i = 0;

  function scanTemplate(from: number): void {
    i = from;
    while (i < text.length) {
      if (text[i] === "\\") i += 2;
      else if (text[i] === "`") {
        i++;
        previous = "`";
        return;
      } else if (text[i] === "$" && text[i + 1] === "{") {
        templateDepths.push(braces);
        braces++;
        i += 2;
        previous = "{";
        return;
      } else i++;
    }
  }

  while (i < text.length) {
    const char = text[i]!;
    const next = text[i + 1];
    if (char === "/" && next === "/") {
      const end = endOfLine(text, i);
      found.push({ index: i, body: text.slice(i + 2, end) });
      i = end;
    } else if (char === "/" && next === "*") {
      const block = readBlockComment(text, i);
      found.push(block.comment);
      i = block.end;
    } else if (char === '"' || char === "'") {
      i = skipQuoted(text, i, char, true, true);
      previous = char;
    } else if (char === "`") {
      scanTemplate(i + 1);
    } else if (char === "/" && REGEX_PRECEDERS.has(previous)) {
      i = skipRegex(text, i);
      previous = "/";
    } else {
      if (char === "{") braces++;
      if (char === "}") {
        braces--;
        if (templateDepths[templateDepths.length - 1] === braces) {
          templateDepths.pop();
          scanTemplate(i + 1);
          continue;
        }
      }
      if (/[\w$]/.test(char)) {
        const start = i;
        while (i < text.length && /[\w$]/.test(text[i]!)) i++;
        previous = text.slice(start, i);
      } else if ((char === "+" || char === "-") && next === char) {
        previous = "++";
        i += 2;
      } else {
        if (!/\s/.test(char)) previous = char;
        i++;
      }
    }
  }
  return found;
}

function scanSql(text: string): RawComment[] {
  const found: RawComment[] = [];
  let i = 0;
  while (i < text.length) {
    const char = text[i]!;
    const next = text[i + 1];
    if (char === "-" && next === "-") {
      const end = endOfLine(text, i);
      found.push({ index: i, body: text.slice(i + 2, end) });
      i = end;
    } else if (char === "/" && next === "*") {
      const block = readBlockComment(text, i);
      found.push(block.comment);
      i = block.end;
    } else if (char === "'" || char === '"') {
      i = skipQuoted(text, i, char, false);
    } else i++;
  }
  return found;
}

function scanShell(text: string): RawComment[] {
  const found: RawComment[] = [];
  let i = 0;
  while (i < text.length) {
    const char = text[i]!;
    if (char === "'") {
      i = skipQuoted(text, i, "'", false);
    } else if (char === '"') {
      i = skipQuoted(text, i, '"', true);
    } else if (char === "\\") {
      i += 2;
    } else if (char === "#" && (i === 0 || /[\s;&|()<>]/.test(text[i - 1]!))) {
      const end = endOfLine(text, i);
      found.push({ index: i, body: text.slice(i + 1, end) });
      i = end;
    } else i++;
  }
  return found;
}

export function findComments(path: string, text: string): CommentFinding[] {
  const language = languageOf(path);
  if (language === null) return [];
  const scan = { script: scanScript, sql: scanSql, shell: scanShell }[language];
  return scan(text)
    .filter(({ index, body }) => {
      if (language === "shell" && index === 0 && body.startsWith("!")) return false;
      if (language === "script" && REFERENCE_DIRECTIVE.test(body)) return false;
      return !(language === "script" && DIRECTIVE.test(body));
    })
    .map(({ index }) => ({ path, line: lineOf(text, index) }));
}

function trackedFiles(): string[] {
  const result = spawnSync("git", ["ls-files"], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr);
  return result.stdout
    .split("\n")
    .filter((path) => path !== "" && !IGNORED_DIRECTORIES.some((dir) => path.startsWith(dir)));
}

function main(): void {
  const findings = trackedFiles().flatMap((path) => {
    const language = languageOf(path);
    return language === null ? [] : findComments(path, readFileSync(path, "utf8"));
  });
  for (const { path, line } of findings) console.error(`${path}:${line}: comment found`);
  process.exit(findings.length === 0 ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
