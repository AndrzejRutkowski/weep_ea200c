// Testy end-to-end całej aplikacji z symulowaną bieżnią FTMS.
// Uruchomienie: npm run test:e2e  (wymaga Chrome; ścieżkę można podać w CHROME_PATH)
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { setup, sent, until, TEST_PROGRAM } from "./helpers.mjs";

let env;
before(async () => { env = await setup(); });
after(async () => { await env.close(); });

const hex = cmds => cmds.map(c => c.map(b => b.toString(16).padStart(2, "0")).join(" "));

async function connect(page) {
  await page.click("#btnConnect");
  await until(page, () => document.getElementById("connText").textContent.includes("FS-"));
}

test("strona ładuje się bez błędów, zakładki działają", async () => {
  const { page, ctx, errors } = await env.openApp({ seen: false });
  assert.equal(await page.title(), "Bieżnia Weep EA200C");
  assert.ok(await page.isVisible("#firstRun"), "pasek pierwszego uruchomienia");
  await page.click("#btnFirstHelp");
  assert.ok(await page.isVisible("#tab-help"));
  assert.ok(await page.isHidden("#firstRun"));
  for (const tab of ["programs", "history", "settings", "help", "train"]) {
    await page.click(`.tabs button[data-tab=${tab}]`);
    assert.ok(await page.isVisible(`#tab-${tab}`), `zakładka ${tab}`);
  }
  await page.reload();
  assert.ok(await page.isHidden("#firstRun"), "pasek nie wraca po przeładowaniu");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("połączenie odczytuje model i zakresy bieżni", async () => {
  const { page, ctx, errors } = await env.openApp();
  await connect(page);
  await page.click(".tabs button[data-tab=settings]");
  const info = await page.innerText("#devInfo");
  assert.match(info, /FITSHOW/);
  assert.match(info, /FS-BT-D2/);
  assert.match(info, /1–12 km\/h/);
  assert.match(info, /0–15/);
  assert.deepEqual(hex(await sent(page)), ["00"], "po połączeniu tylko Request Control");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("program: start, zmiany odcinków, stop na końcu, podsumowanie", async () => {
  const { page, ctx, errors } = await env.openApp({ programs: [TEST_PROGRAM] });
  await connect(page);
  await page.click("#btnStart");
  await until(page, () => /1\/3/.test(document.getElementById("segName").textContent) &&
    window.__ble.sent.some(c => c[0] === 2));
  await until(page, () => !document.getElementById("summary").classList.contains("hidden"));
  const cmds = hex(await sent(page));
  assert.equal(cmds[1], "07", "start taśmy");
  assert.ok(cmds.includes("03 14 00"), "nachylenie 2 (odcinek A)");
  assert.ok(cmds.includes("02 58 02"), "prędkość 6,0 km/h (odcinek A)");
  assert.ok(cmds.includes("02 52 03"), "prędkość 8,5 km/h (odcinek B)");
  assert.ok(cmds.includes("03 32 00"), "nachylenie 5 (odcinek B)");
  assert.ok(cmds.includes("02 90 01"), "prędkość 4,0 km/h (odcinek C)");
  assert.equal(cmds[cmds.length - 1], "08 01", "stop na końcu");
  assert.match(await page.innerText("#summary"), /Program zakończony – Test/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("pauza z pilota wstrzymuje program, Wznów uruchamia taśmę", async () => {
  const prog = { ...TEST_PROGRAM, segments: TEST_PROGRAM.segments.map(s => ({ ...s, dur: 30 })) };
  const { page, ctx, errors } = await env.openApp({ programs: [prog] });
  await connect(page);
  await page.click("#btnStart");
  await until(page, () => window.__ble.sent.some(c => c[0] === 2));
  await page.evaluate(() => window.__ble.emitStatus([2, 2]));
  await until(page, () => /Pauza/.test(document.getElementById("phaseMsg").textContent));
  assert.ok(await page.isVisible("#btnResume"));
  const before = (await sent(page)).length;
  await page.click("#btnResume");
  await until(page, n => window.__ble.sent.length > n && window.__ble.sent.slice(n).some(c => c[0] === 2), before);
  const after = hex((await sent(page)).slice(before));
  assert.equal(after[0], "07", "wznowienie wysyła start");
  await page.click("#btnStop");
  assert.equal(hex(await sent(page)).pop(), "08 01");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("tryb chodzenia: ostrzeżenie i przycięcie prędkości do 6 km/h", async () => {
  const { page, ctx, errors } = await env.openApp({ programs: [TEST_PROGRAM], mock: { speedMax: 6 } });
  await connect(page);
  await page.click("#btnStart");
  assert.ok(await page.isVisible("#runWarn"), "ostrzeżenie o 6 km/h");
  await until(page, () => window.__ble.sent.some(c => c[0] === 2 && (c[1] | c[2] << 8) === 600));
  await page.click("#btnStop");
  assert.ok(!(await sent(page)).some(c => c[0] === 2 && (c[1] | c[2] << 8) > 600), "nic powyżej 6 km/h");
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("historia: trening ≥ 1 min trafia do historii, przerwany jest odzyskiwany", async () => {
  const prog = { id: "h1", name: "Minuta", segments: [{ id: "s", name: "S", dur: 62, speed: 6, incline: 0 }] };
  const now = Date.now();
  const interrupted = { id: "x1", start: now - 3 * 864e5, end: now - 3 * 864e5 + 15e5, program: "Przerwany", duration: 1500,
    dist: 3.1, kcal: 200, elev: 10, maxSpeed: 9, segDone: 3, segTotal: 8, status: "przerwany" };
  const { page, ctx, errors } = await env.openApp({ programs: [prog], storage: { "bieznia.currentrun.v1": interrupted } });
  await page.click(".tabs button[data-tab=history]");
  assert.match(await page.innerText("#hList"), /Przerwany/, "odzyskany trening");
  await page.click(".tabs button[data-tab=train]");
  await connect(page);
  await page.click("#btnStart");
  await until(page, () => !document.getElementById("summary").classList.contains("hidden"), null, 80000);
  assert.match(await page.innerText("#summary"), /Zapisano w historii/);
  await page.click(".tabs button[data-tab=history]");
  const list = await page.innerText("#hList");
  assert.match(list, /Minuta/);
  assert.match(list, /ukończony/);
  assert.equal(await page.locator(".hitem").count(), 2);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("edytor: zmiany odcinków, generator interwałów, zapis po przeładowaniu", async () => {
  const { page, ctx, errors } = await env.openApp({ programs: [TEST_PROGRAM] });
  await page.click(".tabs button[data-tab=programs]");
  await page.fill("#edName", "Mój program");
  const row = page.locator(".segrow").nth(1); // pierwsza to nagłówek
  await row.locator("input[data-f=dur]").fill("2:30"); await row.locator("input[data-f=dur]").press("Tab");
  await row.locator("input[data-f=speed]").fill("7.5"); await row.locator("input[data-f=speed]").press("Tab");
  await page.fill("#gN", "2"); await page.click("#btnGen");
  assert.equal(await page.locator("#segList .segrow").count(), 3 + 4);
  await page.reload();
  await page.click(".tabs button[data-tab=programs]");
  assert.equal(await page.inputValue("#edName"), "Mój program");
  const first = page.locator("#segList .segrow").first();
  assert.equal(await first.locator("input[data-f=dur]").inputValue(), "2:30");
  assert.equal(await first.locator("input[data-f=speed]").inputValue(), "7.5");
  assert.equal(await page.locator("#segList .segrow").count(), 7);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("kolejność programów: strzałki i przeciąganie", async () => {
  const { page, ctx, errors } = await env.openApp();
  await page.click(".tabs button[data-tab=programs]");
  const names = () => page.locator("#plist .pitem > button").evaluateAll(b => b.map(x => x.firstChild.textContent));
  const start = await names();
  await page.locator(".pitem .handle").first().focus();
  await page.keyboard.press("ArrowDown");
  assert.deepEqual(await names(), [start[1], start[0], start[2]]);
  const h = await page.locator(".pitem .handle").nth(2).boundingBox();
  const top = await page.locator(".pitem").first().boundingBox();
  await page.mouse.move(h.x + 10, h.y + 10); await page.mouse.down();
  for (let y = h.y + 10; y > top.y + 4; y -= 8) await page.mouse.move(h.x + 10, y);
  await page.mouse.up();
  assert.deepEqual(await names(), [start[2], start[1], start[0]]);
  const select = await page.locator("#selProgram option").allInnerTexts();
  assert.deepEqual(select, [start[2], start[1], start[0]], "ta sama kolejność w zakładce Trening");
  await page.reload();
  await page.click(".tabs button[data-tab=programs]");
  assert.deepEqual(await names(), [start[2], start[1], start[0]]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("eksport i import programów przez JSON", async () => {
  const { page, ctx, errors } = await env.openApp({ programs: [TEST_PROGRAM] });
  await page.click(".tabs button[data-tab=programs]");
  await page.click("#btnExportCopy");
  const json = await page.inputValue("#jsonBox");
  assert.match(json, /"Test"/);
  await page.click("#btnImportText");
  assert.match(await page.innerText("#ioMsg"), /Dodano programów: 1/);
  assert.equal(await page.locator("#plist .pitem").count(), 2);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("wykres: tooltip z parametrami odcinka", async () => {
  const { page, ctx, errors } = await env.openApp({ programs: [TEST_PROGRAM] });
  const box = await page.locator("#profileTrain").boundingBox();
  await page.mouse.move(box.x + box.width - 20, box.y + 40);
  const tip = await page.innerText("#segTip");
  assert.match(tip, /3\/3 · C/);
  assert.match(tip, /4,0 km\/h/);
  await page.mouse.move(5, 5);
  assert.ok(await page.isHidden("#segTip"));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test("aktualizacja: pasek nowej wersji i przeładowanie po kliknięciu", async () => {
  const { page, ctx, errors } = await env.openApp({ mock: false });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await until(page, () => !!navigator.serviceWorker.controller);
  await until(page, () => /^v\d+$/.test(document.getElementById("appVersion").textContent));
  const v = Number((await page.innerText("#appVersion")).slice(1));
  assert.ok(await page.isHidden("#updBar"));
  const fs = await import("node:fs/promises");
  const sw = await fs.readFile(new URL("../../sw.js", import.meta.url), "utf8");
  env.server.overrides.set("sw.js", sw.replace(/const VERSION = "[^"]+"/, `const VERSION = "${v + 1}"`));
  try {
    await page.click(".tabs button[data-tab=settings]");
    await page.click("#btnCheckUpd");
    await until(page, () => !document.getElementById("updBar").classList.contains("hidden"));
    await Promise.all([page.waitForEvent("load"), page.click("#btnUpdate")]);
    await until(page, n => document.getElementById("appVersion").textContent === "v" + n, v + 1);
  } finally { env.server.overrides.clear(); }
  assert.deepEqual(errors, []);
  await ctx.close();
});
