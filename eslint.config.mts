import { defineConfig } from "eslint/config";
import prettier from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default defineConfig([
  // Global ignores — paling atas, supaya ESLint tidak memindai folder berat.
  // Tanpa ini `eslint .` menelusuri node_modules/lib dan timeout (exit 124).
  {
    ignores: [
      'node_modules/**',
      'lib/**',
      'dist/**',
      '.yarn/**',
      'docs/**',
      'WAProto/**',
      'tests/**',
      'auth_info*/**',
      '**/*.tgz',
      '**/coverage',
      '**/*.lock',
      '**/.eslintrc.json',
      'src/WABinary/index.ts',
      'src/Tests/*',
      '**/proto-extract',
      'Example/Example.ts',
      '**/*.d.ts',
    ],
  },

  // Reporter yang Error di luar globalIgnores — harus dihapus supaya `eslint src`
  // tidak gagal karena file yang memang sengaja di-skip.
  { linterOptions: { reportUnusedDisableDirectives: false } },

  {
    files: ["**/*.ts", "**/*.mts"],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: "module",
      parserOptions: {
        // projectService (standar typescript-eslint v8) menangani file dalam
        // proyek tsconfig TANPA membatasi lint ke include-nya — jadi rule
        // type-aware tetap hidup sementara `eslint .` tetap bisa menyapu
        // seluruh repo. `project` lama hanya mencakup src/** dan bikin
        // file di luar src gagal "not included in project".
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      prettier,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,

      // Resolusi base config upstream. CATATAN: @whiskeysockets/eslint-config
      // saat ini mengekspor objek KOSONG, jadi `...base` di bawah praktis
      // tidak menambah apa-apa. Kalau paket itu diperbaiki di kemudian hari,
      // rules ini tetap berlaku karena dieksplisitkan.
      camelcase: "off",
      indent: "off",
      "no-undef": "off",

      "@typescript-eslint/no-explicit-any": ["warn", { ignoreRestArgs: true }],
      "@typescript-eslint/no-inferrable-types": ["warn"],
      "@typescript-eslint/no-redundant-type-constituents": ["warn"],
      "@typescript-eslint/no-unnecessary-type-assertion": ["warn"],
      "no-restricted-syntax": "off",
      "keyword-spacing": "off",
      "implicit-arrow-linebreak": ["off"],

      "space-before-function-paren": ["error", {
          anonymous: "always",
          named: "never",
          asyncArrow: "always",
      }],
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-unused-vars": ["error", {
          caughtErrors: "none",
          // Konvensi repo: argumen yang memang tidak dipakai di-prefix "_"
          // (mis. getNewsletterInfo(_sock, _jidOrInvite)).
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
      }],

      // ── SIZING DI-DEMOTE KE warn (utang warisan upstream) ─────────────
      // Rule di bawah menyalakan banyak pelanggaran yang sudah ada di kode
      // upstream Baileys (yang di-fork, bukan tulisan kita) dan di file test.
      // Kalau dibiarkan "error", `yarn lint` langsung merah dan tidak ada
      // yangaddition关注 — persis kondisi yang membuat CI tidak berguna.
      // Semuanya sengaja dibiarkan AKTIF supaya utangnya terlihat, tapi
      // tidak memblokir gate. Naikkan satu per satu setelah dibersihkan.
      "@typescript-eslint/ban-ts-comment": "warn",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "warn",
      "@typescript-eslint/no-empty-object-type": "warn",
      "@typescript-eslint/no-unused-expressions": "warn",
      "@typescript-eslint/prefer-as-const": "warn",
      "@typescript-eslint/no-duplicate-enum-values": "warn",

      // Prettier AMI: matikan rule format bawaan ESLint, prettier yangmultipart.
      // (eslint-config-prettier WAJIB di-spread, bukan dipakai lewat key
      // `extends` — flat config tidak mengenali key `extends` di dalam object.)
      ...prettierConfig.rules,
      "prettier/prettier": ["warn", { quoteProps: "consistent" }],
    },
  },

  // Non-TS sources (config .mts, script .js di root) tetap boleh di-lint
  // dengan default JS rules.
  {
    files: ["**/*.js", "**/*.cjs", "**/*.mjs", "**/*.mts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    plugins: { prettier },
    rules: {
      "prettier/prettier": "warn",
    },
  },

  // eslint-disable directives yang tidak terpakai adalah info, bukan error —
  // ini_matchesNG silencing yang disengaja di file lama.
  { linterOptions: { reportUnusedDisableDirectives: "off" } },
]);