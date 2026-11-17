// Konfiguracja ESLint (format „flat config”, bez dodatkowych pakietów).
const browser = Object.fromEntries(
  [
    "window",
    "document",
    "navigator",
    "location",
    "localStorage",
    "sessionStorage",
    "indexedDB",
    "caches",
    "console",
    "setTimeout",
    "clearTimeout",
    "setInterval",
    "clearInterval",
    "requestAnimationFrame",
    "performance",
    "structuredClone",
    "URL",
    "Blob",
    "FileReader",
    "TextDecoder",
    "TextEncoder",
    "DataView",
    "Event",
    "CustomEvent",
    "EventTarget",
    "ResizeObserver",
    "AudioContext",
    "SpeechSynthesisUtterance",
    "speechSynthesis",
    "self",
    "globalThis",
    "Response",
    "Request",
    "fetch",
    "HTMLElement",
    "SVGSVGElement",
    "File",
    "Storage"
  ].map(g => [g, "readonly"])
);
const node = Object.fromEntries(["process", "console", "URL", "setTimeout", "globalThis"].map(g => [g, "readonly"]));

export default [
  { ignores: ["node_modules/**"] },
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: browser },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["error", { args: "none", caughtErrors: "none" }],
      "no-var": "error",
      "prefer-const": "error",
      eqeqeq: ["error", "smart"],
      "no-implicit-globals": "error",
      "no-shadow": "error"
    }
  },
  { files: ["tests/**", "tools/**", "eslint.config.js"], languageOptions: { globals: { ...browser, ...node } } }
];
