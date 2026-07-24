import solid from "eslint-plugin-solid/configs/typescript";
import { defineConfig } from "oxlint";

export default defineConfig({
  jsPlugins: ["eslint-plugin-solid"],
  rules: {
    ...solid.rules,
  },
  options: {
    denyWarnings: true,
    reportUnusedDisableDirectives: "error",
  },
  overrides: [
    {
      files: ["packages/dapjs/**/enums.ts"],
      rules: {
        "typescript/no-duplicate-enum-values": "off",
      },
    },
  ],
});
