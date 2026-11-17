// Aktualizuje listę plików i wersję w sw.js.
// Wersja rośnie tylko wtedy, gdy zmieniła się treść któregoś pliku aplikacji – dzięki temu
// zainstalowane aplikacje zawsze dostają aktualizację i nie trzeba pamiętać o ręcznym podbijaniu.
//
//   npm run version          – zaktualizuj sw.js
//   npm run version -- --check – tylko sprawdź (CI); kod wyjścia 1, gdy sw.js jest nieaktualny
import { createHash } from "node:crypto";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const APP = ["index.html", "manifest.webmanifest", "css", "js", "icons"];

async function walk(path) {
  const full = join(ROOT, path);
  const entries = await readdir(full, { withFileTypes: true }).catch(() => null);
  if (!entries) return [path];
  const nested = await Promise.all(entries.map(e => walk(join(path, e.name))));
  return nested.flat();
}

const files = (await Promise.all(APP.map(walk)))
  .flat()
  .map(f => relative(ROOT, join(ROOT, f)).split("\\").join("/"))
  .sort();
const hash = createHash("sha256");
for (const f of files)
  hash
    .update(f)
    .update("\0")
    .update(await readFile(join(ROOT, f)))
    .update("\0");
const build = hash.digest("hex").slice(0, 12);

const swPath = join(ROOT, "sw.js");
const sw = await readFile(swPath, "utf8");
const current = sw.match(/const BUILD = "([^"]*)";/)?.[1];
const version = Number(sw.match(/const VERSION = "(\d+)";/)?.[1] || 0);

if (process.argv.includes("--check")) {
  if (current !== build) {
    console.error(`sw.js jest nieaktualny (BUILD ${current} ≠ ${build}). Uruchom: npm run version`);
    process.exit(1);
  }
  console.log(`sw.js aktualny: v${version} (${build})`);
  process.exit(0);
}

if (current === build) {
  console.log(`Bez zmian: v${version} (${build})`);
} else {
  const next = version + 1;
  const list = ["./", ...files].map(f => `  "${f}"`).join(",\n");
  const out = sw
    .replace(/const VERSION = "\d+";/, `const VERSION = "${next}";`)
    .replace(/const BUILD = "[^"]*";/, `const BUILD = "${build}";`)
    .replace(/const FILES = \[[^\]]*\];/, `const FILES = [\n${list}\n];`);
  await writeFile(swPath, out);
  console.log(`sw.js: v${version} → v${next} (${build}), plików: ${files.length + 1}`);
}
