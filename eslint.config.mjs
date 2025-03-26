// eslint.config.mjs
import js from "@eslint/js";
import * as importPlugin from "eslint-plugin-import";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        // Selaimen yleiset globaalit
        document: "readonly",
        window: "readonly",
        console: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
        alert: "readonly",
        Sortable: "readonly",
        setTimeout: "readonly",
        navigator: "readonly",
        screen: "readonly",
        URLSearchParams: "readonly",
        EventSource: "readonly",
        MutationObserver: "readonly",
        CustomEvent: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        FormData: "readonly",
        confirm: "readonly",
        location: "readonly",
        crypto: "readonly",
        TextEncoder: "readonly",
        Event: "readonly",

        // Node-ympäristön globaalit, jos tarvitset
        process: "readonly",
        require: "readonly",
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      "import/no-unresolved": "error",
      "import/named": "error",
      "import/namespace": "error",
      "import/default": "error",
      "import/export": "error",
      "import/no-duplicates": "warn",
    },
  },
];
