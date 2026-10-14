import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { checkDocs, slugify, type DocFinding, type Repo, type Rule } from "./check-docs.ts";

const SCRATCH = ".scratch";

const CLAUDE_MD = [
  "# CLAUDE.md",
  "",
  "## Map",
  "",
  "- [Architecture](ARCHITECTURE.md)",
  "- [ADRs](docs/adr/README.md)",
  "",
  "## Commands",
].join("\n");

const BASE: Record<string, string> = {
  "CLAUDE.md": CLAUDE_MD,
  "ARCHITECTURE.md": "# Architecture\n\n`src/core/catalog/` and `src/adapters/carrefour/`.\n",
  "docs/adr/README.md": "# ADRs\n\n- [0001](0001-first-decision.md)\n",
  "docs/adr/0001-first-decision.md": "---\nStatus: accepted\n---\n\n# First decision\n",
  "src/core/catalog/catalog.ts": "export const catalog = 1;\n",
  "src/adapters/carrefour/carrefour-store.ts": "export const store = 1;\n",
};

function repo(changes: Record<string, string | null>): Repo {
  const files: Record<string, string> = { ...BASE };
  for (const [path, text] of Object.entries(changes)) {
    if (text === null) delete files[path];
    else files[path] = text;
  }
  return { paths: Object.keys(files), read: (path) => files[path]! };
}

function findings(changes: Record<string, string | null>, rule?: Rule): DocFinding[] {
  const all = checkDocs(repo(changes));
  return rule === undefined ? all : all.filter((finding) => finding.rule === rule);
}

function at(found: DocFinding[]): string[] {
  return found.map(({ path, line, rule }) => `${path}:${line}:${rule}`);
}

describe("checkDocs", () => {
  it("accepts a knowledge base that follows every rule", () => {
    assert.deepEqual(findings({}), []);
  });

  describe("links", () => {
    it("reports a relative link to a missing file", () => {
      const found = findings({ "ARCHITECTURE.md": "# A\n\nSee [x](docs/missing.md).\n" }, "links");
      assert.deepEqual(at(found), ["ARCHITECTURE.md:3:links"]);
    });

    it("resolves links relative to the document and accepts folders", () => {
      const text = "# A\n\n[up](../../CLAUDE.md) [folder](../adr/) [root](/ARCHITECTURE.md)\n";
      assert.deepEqual(
        findings(
          { "docs/adr/0001-first-decision.md": `---\nStatus: accepted\n---\n${text}` },
          "links",
        ),
        [],
      );
    });

    it("reports an anchor that matches no heading under GitHub's slug rules", () => {
      const target = "# Target\n\n## The `pnpm docs:check` command\n\n## Same\n\n## Same\n";
      const good =
        "[a](docs/target.md#the-pnpm-docscheck-command) [b](docs/target.md#same-1) [c](#a)";
      const bad = "[d](docs/target.md#nowhere)";
      const found = findings(
        {
          "docs/target.md": target,
          "ARCHITECTURE.md": `# A\n\n${good}\n${bad}\n`,
        },
        "links",
      );
      assert.deepEqual(at(found), ["ARCHITECTURE.md:4:links"]);
    });

    it("ignores external links and links in code", () => {
      const text = [
        "# A",
        "[web](https://example.com/missing.md) [mail](mailto:a@b.c)",
        "`[x](missing.md)`",
        "```",
        "[y](missing.md)",
        "```",
      ].join("\n");
      assert.deepEqual(findings({ "ARCHITECTURE.md": text }, "links"), []);
    });
  });

  describe("scratch", () => {
    it("reports a literal path into the scratch folder in Markdown and in code", () => {
      const found = findings(
        {
          "ARCHITECTURE.md": `# A\n\nSee \`${SCRATCH}/notes/research.md\`.\n`,
          "src/core/catalog/catalog.ts": `export const path = "${SCRATCH}/x";\n`,
        },
        "scratch",
      );
      assert.deepEqual(at(found), [
        "ARCHITECTURE.md:3:scratch",
        "src/core/catalog/catalog.ts:1:scratch",
      ]);
    });

    it("accepts placeholders and the bare folder", () => {
      const text = `# A\n\n\`${SCRATCH}/<feature>/\`, \`${SCRATCH}/\` and ${SCRATCH}/**\n`;
      assert.deepEqual(findings({ "ARCHITECTURE.md": text }, "scratch"), []);
    });

    it("skips the scratch folder and prompts", () => {
      const text = `${SCRATCH}/a/b.md\n`;
      assert.deepEqual(
        findings({ [`${SCRATCH}/a/spec.md`]: text, "prompts/x/split.md": text }, "scratch"),
        [],
      );
    });
  });

  describe("indexes", () => {
    it("reports a document its folder README does not link", () => {
      const found = findings(
        { "docs/adr/0002-second-decision.md": "---\nStatus: accepted\n---\n\n# Second\n" },
        "indexes",
      );
      assert.deepEqual(at(found), ["docs/adr/README.md:1:indexes"]);
    });

    it("reports a docs subfolder without a README", () => {
      const found = findings({ "docs/references/store-api.md": "# Store\n" }, "indexes");
      assert.deepEqual(at(found), ["docs/references/store-api.md:1:indexes"]);
    });

    it("reports a top-level document or folder README the Map does not link", () => {
      const found = findings(
        {
          "docs/TESTING.md": "# Testing\n",
          "docs/agents/README.md": "# Agents\n",
        },
        "indexes",
      );
      assert.deepEqual(
        found.map(({ message }) => message),
        ["the Map does not link docs/TESTING.md", "the Map does not link docs/agents/README.md"],
      );
    });

    it("reports a CLAUDE.md without a Map", () => {
      const found = findings({ "CLAUDE.md": "# CLAUDE.md\n" }, "indexes");
      assert.deepEqual(at(found), ["CLAUDE.md:1:indexes"]);
    });
  });

  describe("adr-status", () => {
    const adr = (status: string) => ({
      "docs/adr/0001-first-decision.md": `---\nStatus: ${status}\n---\n\n# First\n`,
    });

    it("accepts the four statuses", () => {
      for (const status of ["proposed", "accepted", "deprecated", "superseded by ADR-0001"]) {
        assert.deepEqual(findings(adr(status), "adr-status"), [], status);
      }
    });

    it("reports any other status on its line", () => {
      const found = findings(adr("accepted, partly superseded by ADR 0005"), "adr-status");
      assert.deepEqual(at(found), ["docs/adr/0001-first-decision.md:2:adr-status"]);
    });

    it("reports a superseding ADR that does not exist", () => {
      const found = findings(adr("superseded by ADR-0009"), "adr-status");
      assert.deepEqual(
        found.map(({ message }) => message),
        ["ADR-0009 does not exist"],
      );
    });

    it("reports an ADR without front matter", () => {
      const found = findings({ "docs/adr/0001-first-decision.md": "# First\n" }, "adr-status");
      assert.deepEqual(at(found), ["docs/adr/0001-first-decision.md:1:adr-status"]);
    });
  });

  describe("claude-md-length", () => {
    it("accepts 120 lines and reports 121", () => {
      const filler = (count: number) => `${CLAUDE_MD}\n${"line\n".repeat(count - 8)}`;
      assert.deepEqual(findings({ "CLAUDE.md": filler(120) }, "claude-md-length"), []);
      assert.deepEqual(at(findings({ "CLAUDE.md": filler(121) }, "claude-md-length")), [
        "CLAUDE.md:121:claude-md-length",
      ]);
    });
  });

  describe("src-paths", () => {
    it("reports a cited src path that does not exist and accepts placeholders", () => {
      const text = [
        "# A",
        "`src/core/catalog/` `src/adapters/carrefour/` `src/core/catalog/catalog.ts:12`",
        "`src/core/<feature>/` `src/...`",
        "`src/core/gone.ts`",
      ].join("\n");
      assert.deepEqual(at(findings({ "ARCHITECTURE.md": text }, "src-paths")), [
        "ARCHITECTURE.md:4:src-paths",
      ]);
    });

    it("does not check ADRs, which can name paths before they exist", () => {
      const text = "---\nStatus: accepted\n---\n\n# First\n\n`src/app/`\n";
      assert.deepEqual(findings({ "docs/adr/0001-first-decision.md": text }, "src-paths"), []);
    });

    it("reports a core feature or adapter folder ARCHITECTURE.md does not name", () => {
      const found = findings(
        { "src/core/order-resolution/resolve-order.ts": "export const x = 1;\n" },
        "src-paths",
      );
      assert.deepEqual(
        found.map(({ message }) => message),
        ["does not name src/core/order-resolution/"],
      );
    });
  });

  describe("naming", () => {
    it("reports a lowercase top-level document and an uppercase subfolder document", () => {
      const found = findings(
        {
          "docs/testing.md": "# Testing\n",
          "docs/references/Store_API.md": "# Store\n",
          "docs/references/README.md": "[s](Store_API.md)\n",
        },
        "naming",
      );
      assert.deepEqual(at(found), [
        "docs/testing.md:1:naming",
        "docs/references/Store_API.md:1:naming",
      ]);
    });

    it("reports a lowercase folder index", () => {
      const found = findings({ "docs/references/readme.md": "# References\n" }, "naming");
      assert.deepEqual(
        found.map(({ message }) => message),
        ["folder indexes are README.md"],
      );
    });

    it("reports a badly named, duplicated or missing ADR number", () => {
      const adr = "---\nStatus: accepted\n---\n\n# X\n";
      const found = findings(
        {
          "docs/adr/0001-other-decision.md": adr,
          "docs/adr/0003-third.md": adr,
          "docs/adr/4-fourth.md": adr,
        },
        "naming",
      );
      assert.deepEqual(found.map(({ path, message }) => `${path}: ${message}`).sort(), [
        "docs/adr/0001-first-decision.md: ADR number 0001 is not unique",
        "docs/adr/0001-other-decision.md: ADR number 0001 is not unique",
        "docs/adr/0003-third.md: ADR 0002 is missing before this one",
        "docs/adr/4-fourth.md: ADRs are named NNNN-kebab-slug.md",
      ]);
    });
  });
});

describe("slugify", () => {
  it("follows GitHub's heading anchors", () => {
    assert.equal(slugify("Before every push"), "before-every-push");
    assert.equal(slugify("`pnpm docs:check`: checks (seven)"), "pnpm-docscheck-checks-seven");
    assert.equal(slugify("Código postal y [link](x.md)"), "código-postal-y-link");
    assert.equal(slugify("snake_case _emphasis_"), "snake_case-emphasis");
  });
});
