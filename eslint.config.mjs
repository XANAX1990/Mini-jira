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
    // `auth()` must run after `connection()` (Cache Components); getSession()/requireUser() do that.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/auth.ts", "src/proxy.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@/lib/auth",
              importNames: ["auth"],
              message: "Use getSession() or requireUser(): auth() alone logs crypto.getRandomValues() errors while prerendering.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
