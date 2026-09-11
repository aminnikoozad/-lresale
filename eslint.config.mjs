import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    files: ["components/ui/**/*.{ts,tsx}", "hooks/use-mobile.ts"],
    rules: {
      // These files are vendored verbatim from shadcn@4.17.0. Keep the
      // registry source intact while applying the stricter rules to Site code.
      "@typescript-eslint/no-unused-vars": "off",
      "react-hooks/purity": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    files: ["supabase/functions/**/*.ts"],
    rules: {
      // Supabase Edge Functions cross the untyped PostgREST/Edge runtime
      // boundary in a few tightly-scoped helpers. Keep the rest of the
      // TypeScript/ESLint rules active while allowing those boundary values.
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    files: ["app/admin/support/**/support-thread-client.tsx"],
    rules: {
      // The initial presence refresh is an external realtime synchronization
      // operation. State is only changed after its async database read returns.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
