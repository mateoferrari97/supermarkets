import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export type Rule =
  "links" | "scratch" | "indexes" | "adr-status" | "claude-md-length" | "src-paths" | "naming";

export type DocFinding = { path: string; line: number; rule: Rule; message: string };

export type Repo = { paths: string[]; read(path: string): string };

const SCRATCH_DIR = ".scratch/";
const PROMPTS_DIR = "prompts/";
const ADR_DIR = "docs/adr/";
const CLAUDE_MD = "CLAUDE.md";
const ARCHITECTURE_MD = "ARCHITECTURE.md";
const MAX_CLAUDE_MD_LINES = 120;
const SCRATCH_LITERAL = /\.scratch\/(?=[\w.-])/g;
const ADR_STATUS = /^(proposed|accepted|deprecated|superseded by ADR-(\d{4}))$/;
const ADR_NAME = /^(\d{4})-[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const UPPERCASE_NAME = /^[A-Z0-9]+(?:_[A-Z0-9]+)*\.md$/;
const KEBAB_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*\.md$/;
const EXTERNAL_TARGET = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
const INLINE_LINK = /\[(?:[^\]\\]|\\.)*\]\(\s*(<[^>]*>|[^\s)]+)(?:\s+(?:"[^"]*"|'[^']*'))?\s*\)/g;
const REFERENCE_DEFINITION = /^\s{0,3}\[[^\]]+\]:\s*(<[^>]*>|\S+)/;
const INLINE_CODE = /(`+)([^`]|[^`][\s\S]*?[^`])\1(?!`)/g;

type Line = { number: number; text: string };

function dirname(path: string): string {
  const slash = path.lastIndexOf("/");
  return slash === -1 ? "" : path.slice(0, slash);
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

function normalizePath(path: string): string {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (text[i] === "\n") line++;
  return line;
}

function proseLines(text: string): Line[] {
  const lines: Line[] = [];
  let fence: string | null = null;
  text.split("\n").forEach((text, index) => {
    const opener = FENCE.exec(text)?.[1];
    if (fence !== null) {
      if (opener?.startsWith(fence[0]!) && opener.length >= fence.length) fence = null;
      return;
    }
    if (opener) {
      fence = opener;
      return;
    }
    lines.push({ number: index + 1, text });
  });
  return lines;
}

function withoutInlineCode(text: string): string {
  return text.replace(INLINE_CODE, (span) => " ".repeat(span.length));
}

function inlineCodeSpans(text: string): string[] {
  return [...text.matchAll(INLINE_CODE)].map((match) => match[2]!.trim());
}

function linkTargets(line: string): string[] {
  const prose = withoutInlineCode(line);
  const targets = [...prose.matchAll(INLINE_LINK)].map((match) => match[1]!);
  const definition = REFERENCE_DEFINITION.exec(prose)?.[1];
  if (definition) targets.push(definition);
  return targets.map((target) => target.replace(/^<|>$/g, ""));
}

export function slugify(heading: string): string {
  return heading
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(^|[^\p{L}\p{N}])_+([^_]+?)_+(?=[^\p{L}\p{N}]|$)/gu, "$1$2")
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, "")
    .replace(/ /g, "-");
}

export function headingSlugs(text: string): Set<string> {
  const slugs = new Set<string>();
  const counts = new Map<string, number>();
  for (const { text: line } of proseLines(text)) {
    const heading = /^\s{0,3}#{1,6}\s+(.*?)(?:\s+#+\s*)?$/.exec(line)?.[1];
    if (heading === undefined) continue;
    const slug = slugify(heading);
    const seen = counts.get(slug) ?? 0;
    counts.set(slug, seen + 1);
    slugs.add(seen === 0 ? slug : `${slug}-${seen}`);
  }
  return slugs;
}

function createIndex(repo: Repo) {
  const files = new Set(repo.paths);
  const directories = new Set<string>();
  for (const path of repo.paths) {
    for (let dir = dirname(path); dir !== ""; dir = dirname(dir)) directories.add(dir);
  }
  const exists = (path: string) => path === "" || files.has(path) || directories.has(path);
  return { files, directories, exists };
}

function resolveTarget(from: string, target: string): { path: string; anchor: string | null } {
  const hash = target.indexOf("#");
  const rawPath = hash === -1 ? target : target.slice(0, hash);
  const anchor = hash === -1 ? null : decodeURIComponent(target.slice(hash + 1));
  const decoded = decodeURIComponent(rawPath);
  if (decoded === "") return { path: from, anchor };
  const joined = decoded.startsWith("/") ? decoded : `${dirname(from)}/${decoded}`;
  return { path: normalizePath(joined), anchor };
}

function linkedPaths(from: string, text: string): string[] {
  return proseLines(text).flatMap(({ text: line }) =>
    linkTargets(line)
      .filter((target) => !EXTERNAL_TARGET.test(target))
      .map((target) => resolveTarget(from, target).path),
  );
}

function checkLinks(repo: Repo, documents: string[]): DocFinding[] {
  const { files, exists } = createIndex(repo);
  const slugCache = new Map<string, Set<string>>();
  const slugsOf = (path: string) => {
    let slugs = slugCache.get(path);
    if (!slugs) {
      slugs = headingSlugs(repo.read(path));
      slugCache.set(path, slugs);
    }
    return slugs;
  };
  return documents.flatMap((path) =>
    proseLines(repo.read(path)).flatMap(({ number, text }) =>
      linkTargets(text).flatMap((target): DocFinding[] => {
        if (EXTERNAL_TARGET.test(target)) return [];
        const resolved = resolveTarget(path, target);
        if (!exists(resolved.path)) {
          return [{ path, line: number, rule: "links", message: `${target} does not exist` }];
        }
        if (resolved.anchor === null || !files.has(resolved.path)) return [];
        if (!resolved.path.endsWith(".md")) return [];
        if (slugsOf(resolved.path).has(resolved.anchor)) return [];
        return [
          {
            path,
            line: number,
            rule: "links",
            message: `${target} matches no heading in ${resolved.path}`,
          },
        ];
      }),
    ),
  );
}

function checkScratch(repo: Repo, checked: string[]): DocFinding[] {
  return checked.flatMap((path) => {
    const text = repo.read(path);
    return [...text.matchAll(SCRATCH_LITERAL)].map((match) => ({
      path,
      line: lineOf(text, match.index),
      rule: "scratch" as const,
      message: `refers into ${SCRATCH_DIR}, which can be deleted at any time`,
    }));
  });
}

function mapSection(text: string): { start: number; text: string } | null {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => /^##\s+Map\s*$/.test(line));
  if (start === -1) return null;
  const end = lines.findIndex((line, index) => index > start && /^#{1,2}\s/.test(line));
  const body = lines.slice(start, end === -1 ? lines.length : end).join("\n");
  return { start: start + 1, text: body };
}

function checkIndexes(repo: Repo): DocFinding[] {
  const { files, directories } = createIndex(repo);
  const findings: DocFinding[] = [];
  const docFolders = [...directories].filter((dir) => dir.startsWith("docs/")).sort();
  for (const folder of docFolders) {
    const readme = `${folder}/README.md`;
    const siblings = repo.paths
      .filter((path) => dirname(path) === folder && path.endsWith(".md") && path !== readme)
      .sort();
    if (!files.has(readme)) {
      findings.push({
        path: siblings[0] ?? folder,
        line: 1,
        rule: "indexes",
        message: `${folder}/ has no README.md index`,
      });
      continue;
    }
    const linked = new Set(linkedPaths(readme, repo.read(readme)));
    for (const sibling of siblings) {
      if (linked.has(sibling)) continue;
      findings.push({
        path: readme,
        line: 1,
        rule: "indexes",
        message: `does not link ${basename(sibling)}`,
      });
    }
  }

  if (!files.has(CLAUDE_MD)) {
    return [...findings, { path: CLAUDE_MD, line: 1, rule: "indexes", message: "is missing" }];
  }
  const map = mapSection(repo.read(CLAUDE_MD));
  if (map === null) {
    return [...findings, { path: CLAUDE_MD, line: 1, rule: "indexes", message: "has no ## Map" }];
  }
  const linked = new Set(linkedPaths(CLAUDE_MD, map.text));
  const wanted = repo.paths
    .filter(
      (path) =>
        path !== CLAUDE_MD &&
        path.endsWith(".md") &&
        (dirname(path) === "" ||
          dirname(path) === "docs" ||
          (path.startsWith("docs/") && basename(path) === "README.md")),
    )
    .sort();
  for (const path of wanted) {
    if (linked.has(path)) continue;
    findings.push({
      path: CLAUDE_MD,
      line: map.start,
      rule: "indexes",
      message: `the Map does not link ${path}`,
    });
  }
  return findings;
}

function adrNumbers(repo: Repo): Map<string, string[]> {
  const numbers = new Map<string, string[]>();
  for (const path of repo.paths) {
    if (dirname(path) !== "docs/adr") continue;
    const number = ADR_NAME.exec(basename(path))?.[1];
    if (number === undefined) continue;
    numbers.set(number, [...(numbers.get(number) ?? []), path]);
  }
  return numbers;
}

function checkAdrStatus(repo: Repo): DocFinding[] {
  const numbers = adrNumbers(repo);
  return [...numbers.values()].flat().flatMap((path): DocFinding[] => {
    const lines = repo.read(path).split("\n");
    const close = lines[0] === "---" ? lines.indexOf("---", 1) : -1;
    const statusIndex =
      close === -1 ? -1 : lines.slice(1, close).findIndex((line) => line.startsWith("Status:"));
    if (statusIndex === -1) {
      return [{ path, line: 1, rule: "adr-status", message: "has no Status front matter" }];
    }
    const line = statusIndex + 2;
    const status = lines[statusIndex + 1]!.slice("Status:".length).trim();
    const match = ADR_STATUS.exec(status);
    if (!match) {
      return [
        {
          path,
          line,
          rule: "adr-status",
          message: `Status "${status}" is not proposed, accepted, deprecated or superseded by ADR-NNNN`,
        },
      ];
    }
    const superseding = match[2];
    if (superseding !== undefined && !numbers.has(superseding)) {
      return [{ path, line, rule: "adr-status", message: `ADR-${superseding} does not exist` }];
    }
    return [];
  });
}

function checkClaudeMdLength(repo: Repo): DocFinding[] {
  if (!repo.paths.includes(CLAUDE_MD)) return [];
  const lines = repo.read(CLAUDE_MD).replace(/\n$/, "").split("\n");
  if (lines.length <= MAX_CLAUDE_MD_LINES) return [];
  return [
    {
      path: CLAUDE_MD,
      line: MAX_CLAUDE_MD_LINES + 1,
      rule: "claude-md-length",
      message: `has ${lines.length} lines, more than ${MAX_CLAUDE_MD_LINES}`,
    },
  ];
}

function citedSrcPath(span: string): string | null {
  if (!span.startsWith("src/") || /[\s<>*{}]|\.\.\./.test(span)) return null;
  return span.replace(/[#:].*$/, "").replace(/\/$/, "");
}

function checkSrcPaths(repo: Repo, documents: string[]): DocFinding[] {
  const { directories, exists } = createIndex(repo);
  const findings = documents
    .filter((path) => !path.startsWith(ADR_DIR))
    .flatMap((path) =>
      proseLines(repo.read(path)).flatMap(({ number, text }) =>
        inlineCodeSpans(text).flatMap((span): DocFinding[] => {
          const cited = citedSrcPath(span);
          if (cited === null || exists(cited)) return [];
          return [{ path, line: number, rule: "src-paths", message: `${span} does not exist` }];
        }),
      ),
    );

  const layerFolders = [...directories]
    .filter((dir) => /^src\/(?:core|adapters)\/[^/]+$/.test(dir))
    .sort();
  if (!repo.paths.includes(ARCHITECTURE_MD)) {
    if (layerFolders.length === 0) return findings;
    return [
      ...findings,
      { path: ARCHITECTURE_MD, line: 1, rule: "src-paths", message: "is missing" },
    ];
  }
  const architecture = repo.read(ARCHITECTURE_MD);
  for (const folder of layerFolders) {
    if (architecture.includes(`${folder}/`)) continue;
    findings.push({
      path: ARCHITECTURE_MD,
      line: 1,
      rule: "src-paths",
      message: `does not name ${folder}/`,
    });
  }
  return findings;
}

function checkNaming(repo: Repo): DocFinding[] {
  const findings: DocFinding[] = [];
  const name = (path: string, message: string) =>
    findings.push({ path, line: 1, rule: "naming", message });
  for (const path of repo.paths) {
    if (!path.endsWith(".md")) continue;
    const folder = dirname(path);
    const file = basename(path);
    if (folder === "" || folder === "docs") {
      if (!UPPERCASE_NAME.test(file)) name(path, "top-level documents are UPPERCASE");
    } else if (path.startsWith("docs/") && file !== "README.md") {
      if (file.toLowerCase() === "readme.md") {
        name(path, "folder indexes are README.md");
      } else if (folder === "docs/adr") {
        if (!ADR_NAME.test(file)) name(path, "ADRs are named NNNN-kebab-slug.md");
      } else if (!KEBAB_NAME.test(file)) {
        name(path, "documents in subfolders are lowercase kebab-case");
      }
    }
  }

  const numbers = adrNumbers(repo);
  for (const [number, paths] of numbers) {
    if (paths.length > 1)
      for (const path of paths) name(path, `ADR number ${number} is not unique`);
  }
  const sorted = [...numbers.keys()].sort();
  const gap = sorted.findIndex((number, index) => Number(number) !== index + 1);
  if (gap !== -1) {
    const expected = String(gap + 1).padStart(4, "0");
    name(numbers.get(sorted[gap]!)![0]!, `ADR ${expected} is missing before this one`);
  }
  return findings;
}

export function checkDocs(repo: Repo): DocFinding[] {
  const checked = repo.paths.filter(
    (path) => !path.startsWith(SCRATCH_DIR) && !path.startsWith(PROMPTS_DIR),
  );
  const documents = checked.filter((path) => path.endsWith(".md"));
  return [
    ...checkLinks(repo, documents),
    ...checkScratch(repo, checked),
    ...checkIndexes(repo),
    ...checkAdrStatus(repo),
    ...checkClaudeMdLength(repo),
    ...checkSrcPaths(repo, documents),
    ...checkNaming(repo),
  ];
}

function repoFiles(): string[] {
  const result = spawnSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    encoding: "utf8",
  });
  if (result.status !== 0) throw new Error(result.stderr);
  return [...new Set(result.stdout.split("\n"))].filter((path) => path !== "" && existsSync(path));
}

function main(): void {
  const findings = checkDocs({ paths: repoFiles(), read: (path) => readFileSync(path, "utf8") });
  for (const { path, line, rule, message } of findings) {
    console.error(`${path}:${line}: [${rule}] ${message}`);
  }
  process.exit(findings.length === 0 ? 0 : 1);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
