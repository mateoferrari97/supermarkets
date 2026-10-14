import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import tseslint from "typescript-eslint";

const onlyImports = (allowed, message) => ({
  "no-restricted-imports": [
    "error",
    { patterns: [{ regex: `^(?!${allowed.join("|")})`, caseSensitive: true, message }] },
  ],
});

const zod = "zod$";
const nodeBuiltin = "node:";
const vitest = "vitest$";
const nodeAssert = "node:assert/strict$";
const sameFolder = "\\./";
const coreFromFeature = ["\\./", "\\.\\./(?!\\.\\./)", "\\.\\./\\.\\./core/"];
const coreFromAdapter = "\\.\\./\\.\\./core/";

const coreMessage = "core imports only core and zod (ADR 0006).";
const adaptersMessage = "adapters import only core, node:* and zod (ADR 0006).";
const deliveryMessage = "cli and app import core and compose, never adapters (ADR 0006).";
const cliFilesMessage = "cli reads and writes files through compose, never fs (ADR 0006).";
const adapters = "(^|/)adapters(/|$)";

export default tseslint.config(
  { ignores: ["node_modules", ".claude", ".scratch", ".data", ".next", "next-env.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^_" }],
      "@typescript-eslint/consistent-type-definitions": ["error", "type"],
    },
  },
  {
    files: ["src/core/**"],
    rules: onlyImports([zod, ...coreFromFeature], coreMessage),
  },
  {
    files: ["src/core/**/*.test.ts"],
    rules: onlyImports([zod, vitest, nodeAssert, ...coreFromFeature], coreMessage),
  },
  {
    files: ["src/adapters/**"],
    rules: onlyImports([zod, nodeBuiltin, sameFolder, coreFromAdapter], adaptersMessage),
  },
  {
    files: ["src/adapters/**/*.test.ts"],
    rules: onlyImports([zod, nodeBuiltin, vitest, sameFolder, coreFromAdapter], adaptersMessage),
  },
  {
    files: ["src/compose.ts"],
    rules: onlyImports(
      ["\\./core/", "\\./adapters/"],
      "compose imports only core and adapters (ADR 0006).",
    ),
  },
  {
    files: ["src/app/**"],
    ...nextPlugin.configs["core-web-vitals"],
  },
  {
    files: ["src/app/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: adapters, caseSensitive: true, message: deliveryMessage }] },
      ],
    },
  },
  {
    files: ["src/cli/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { regex: adapters, caseSensitive: true, message: deliveryMessage },
            { regex: "^(node:)?fs(/|$)", caseSensitive: true, message: cliFilesMessage },
          ],
        },
      ],
    },
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    ...tseslint.configs.disableTypeChecked,
    rules: { ...tseslint.configs.disableTypeChecked.rules, "no-undef": "off" },
  },
);
