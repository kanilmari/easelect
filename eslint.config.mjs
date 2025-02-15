// // eslint.config.mjs
// import js from "@eslint/js";
// import * as importPlugin from "eslint-plugin-import";

// export default [
//   // ESLintin omat suositukset flat config -muodossa
//   js.configs.recommended,

//   // Omat asetukset ja pluginin säännöt
//   {
//     files: ["**/*.js"],
//     languageOptions: {
//       ecmaVersion: "latest",
//       sourceType: "module",
//     },
//     // plugins on nyt objekti, ei taulukko
//     plugins: {
//       import: importPlugin,
//     },
//     rules: {
//       // Plugin:import "recommended" -sääntöjä (kopioitu pluginin configista)
//       "import/no-unresolved": "error",
//       "import/named": "error",
//       "import/namespace": "error",
//       "import/default": "error",
//       "import/export": "error",

//       // Voit lisätä myös omia lisäsääntöjä, esim.:
//       "import/no-duplicates": "warn",
//     },
//   },
// ];
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
        document: "readonly",
        window: "readonly",
        console: "readonly",
        localStorage: "readonly",
        fetch: "readonly",
        alert: "readonly",
        confirm: "readonly",
        Sortable: "readonly",
        EventSource: "readonly",
        setTimeout: "readonly",
        MutationObserver: "readonly",
        navigator: "readonly",
        screen: "readonly",
        TextEncoder: "readonly",
        crypto: "readonly",
        URLSearchParams: "readonly",
        Event: "readonly",
        CustomEvent: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        FormData: "readonly",
        location: "readonly",
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
      
      // Muitakin sääntöjä voi halutessaan lisätä tai muokata
      // "no-prototype-builtins": "off", tms.
    },
  },
];
