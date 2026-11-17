// Minimalny serwer statyczny (bez zależności) – do testów i lokalnego uruchomienia.
// Użycie: node tests/server.mjs [port]  →  http://localhost:8080/
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png"
};

/**
 * Uruchamia serwer. `overrides` pozwala w testach podmienić treść plików (np. symulować nową wersję).
 * @param {number} [port=0]
 * @returns {Promise<{url: string, close: () => Promise<void>, overrides: Map<string, string>}>}
 */
export async function startServer(port = 0) {
  const overrides = new Map();
  const server = createServer(async (req, res) => {
    let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (path.endsWith("/")) path += "index.html";
    const file = normalize(join(ROOT, path));
    if (!file.startsWith(ROOT) || file.includes("node_modules") || file.includes(`${ROOT}/.git`)) {
      res.writeHead(403).end();
      return;
    }
    try {
      const rel = path.replace(/^\//, "");
      const body = overrides.has(rel) ? overrides.get(rel) : await readFile(file);
      res.writeHead(200, {
        "Content-Type": TYPES[extname(file)] || "application/octet-stream",
        "Cache-Control": "no-cache"
      });
      res.end(body);
    } catch {
      res.writeHead(404).end("Not found");
    }
  });
  await new Promise(r => server.listen(port, "127.0.0.1", r));
  const url = `http://localhost:${server.address().port}/`;
  return {
    url,
    overrides,
    close: () =>
      new Promise(r => {
        server.closeAllConnections();
        server.close(() => r());
      })
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { url } = await startServer(Number(process.argv[2]) || 8080);
  console.log(`Aplikacja: ${url}`);
}
