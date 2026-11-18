// Wspólne narzędzia testów e2e: serwer, przeglądarka i symulowana bieżnia FTMS.
import { chromium } from "playwright-core";
import { startServer } from "../server.mjs";

/**
 * Symulowana bieżnia wstrzykiwana do strony zamiast navigator.bluetooth.
 * Konfiguracja: window.__mockConfig = { speedMax: 12 }.
 * Dostęp z testu: window.__ble.sent (wysłane komendy), window.__ble.emitStatus([..]).
 */
export const MOCK_BLE = String.raw`(() => {
  const cfg = Object.assign({ speedMax: 12 }, window.__mockConfig || {});
  const U = n => "0000" + n.toString(16).padStart(4, "0") + "-0000-1000-8000-00805f9b34fb";
  const ble = window.__ble = { sent: [], speed: 0, incline: 0 };
  function chr(uuid, bytes) {
    const c = new EventTarget(); c.uuid = uuid; c.value = null;
    c.readValue = async () => new DataView(new Uint8Array(bytes || []).buffer);
    c.startNotifications = async () => c;
    c.emit = b => { c.value = new DataView(new Uint8Array(b).buffer); c.dispatchEvent(new Event("characteristicvaluechanged")); };
    return c;
  }
  const max = Math.round(cfg.speedMax * 100);
  const td = chr(U(0x2acd)), status = chr(U(0x2ada)), cp = chr(U(0x2ad9));
  const chars = {
    [U(0x2acc)]: chr(U(0x2acc), [0xdc, 0x56, 0, 0, 0x0f, 0, 0, 0]),
    [U(0x2ad4)]: chr(U(0x2ad4), [100, 0, max & 255, max >> 8, 10, 0]),
    [U(0x2ad5)]: chr(U(0x2ad5), [0, 0, 150, 0, 10, 0]),
    [U(0x2acd)]: td, [U(0x2ada)]: status, [U(0x2ad9)]: cp
  };
  cp.writeValueWithResponse = async buf => {
    const b = Array.from(buf); ble.sent.push(b);
    if (b[0] === 2) ble.speed = (b[1] | b[2] << 8) / 100;
    if (b[0] === 3) ble.incline = ((b[1] | b[2] << 8) << 16 >> 16) / 10;
    if (b[0] === 8) ble.speed = 0;
    if (b[0] === 8 && b[1] === 1) ble.incline = 0; // jak prawdziwa bieżnia: stop zeruje nachylenie
    setTimeout(() => cp.emit([0x80, b[0], 1]), 10);
  };
  ble.emitStatus = b => status.emit(b);
  setInterval(() => {
    const v = Math.round(ble.speed * 100), i = Math.round(ble.incline * 10);
    td.emit([0x88, 0x00, v & 255, v >> 8, i & 255, (i >> 8) & 255, 0, 0, 0x2a, 0, 0, 0, 0]); // prędkość, nachylenie, kalorie
  }, 250);
  const svc = { getCharacteristic: async u => { if (chars[u]) return chars[u]; throw new Error("not found"); } };
  const dis = { getCharacteristic: async u => {
    const m = { [U(0x2a29)]: "FITSHOW", [U(0x2a24)]: "FS-BT-D2" };
    if (m[u]) return chr(u, Array.from(new TextEncoder().encode(m[u]))); throw new Error("not found"); } };
  const dev = new EventTarget(); dev.name = "FS-C7F4F0";
  dev.gatt = {
    connected: false,
    connect: async () => { dev.gatt.connected = true; return { getPrimaryService: async u => u === U(0x1826) ? svc : u === U(0x180a) ? dis : Promise.reject(new Error("nf")) }; },
    disconnect() { dev.gatt.connected = false; dev.dispatchEvent(new Event("gattserverdisconnected")); }
  };
  ble.device = dev;
  Object.defineProperty(navigator, "bluetooth", { value: { requestDevice: async () => dev }, configurable: true });
})();`;

/** Program testowy: 3 krótkie odcinki. */
export const TEST_PROGRAM = {
  id: "t1",
  name: "Test",
  segments: [
    { id: "a", name: "A", dur: 3, speed: 6, incline: 2 },
    { id: "b", name: "B", dur: 3, speed: 8.5, incline: 5 },
    { id: "c", name: "C", dur: 3, speed: 4, incline: 0 }
  ]
};

/**
 * Startuje serwer i przeglądarkę. Zwraca funkcję openApp(options) do otwierania aplikacji.
 */
export async function setup() {
  const server = await startServer();
  const browser = await chromium.launch(
    process.env.CHROME_PATH
      ? { executablePath: process.env.CHROME_PATH }
      : { channel: process.env.PW_CHANNEL || "chrome" }
  );
  /**
   * @param {{programs?: object[], settings?: object, seen?: boolean, mock?: object|false, viewport?: object, storage?: object}} [o]
   */
  async function openApp(o = {}) {
    const ctx = await browser.newContext({
      viewport: o.viewport || { width: 1000, height: 900 },
      hasTouch: !!o.hasTouch
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", e => errors.push(String(e)));
    const seed = {
      "bieznia.helpseen.v1": o.seen === false ? null : 1,
      "bieznia.settings.v1": Object.assign({ startDelay: 1 }, o.settings || {}),
      ...(o.programs
        ? {
            "bieznia.programs.v1": o.programs,
            "bieznia.programs.ts.v1": Date.now(),
            "bieznia.selected.v1": o.programs[0].id
          }
        : {}),
      ...(o.storage || {})
    };
    await page.addInitScript(
      ([seedJson, mockCfg]) => {
        if (sessionStorage.getItem("__seeded")) return; // tylko przy pierwszym otwarciu, nie po przeładowaniu
        sessionStorage.setItem("__seeded", "1");
        for (const [k, v] of Object.entries(JSON.parse(seedJson)))
          if (v !== null) localStorage.setItem(k, JSON.stringify(v));
        if (mockCfg) window.__mockConfig = mockCfg;
      },
      [JSON.stringify(seed), o.mock || null]
    );
    if (o.mock !== false) {
      await page.addInitScript(cfg => {
        window.__mockConfig = Object.assign({}, window.__mockConfig, cfg);
      }, o.mock || {});
      await page.addInitScript(MOCK_BLE);
    }
    await page.goto(server.url);
    return { page, ctx, errors };
  }
  return {
    server,
    browser,
    openApp,
    close: async () => {
      await browser.close();
      await server.close();
    }
  };
}

/** Zwraca komendy Control Point wysłane do bieżni jako tablice bajtów. */
export const sent = page => page.evaluate(() => window.__ble.sent);

/** Czeka, aż warunek w stronie będzie spełniony. */
export async function until(page, fn, arg, timeout = 15000) {
  await page.waitForFunction(fn, arg, { timeout, polling: 100 });
}
