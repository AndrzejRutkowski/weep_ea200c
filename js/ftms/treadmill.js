// @ts-check
// Połączenie z bieżnią przez Web Bluetooth (FTMS). Klasa ukrywa szczegóły GATT:
// kolejkuje komendy (Web Bluetooth nie pozwala na równoległe zapisy), czeka na odpowiedzi
// Control Point i rozsyła zdarzenia, na które reaguje reszta aplikacji.
//
// Zdarzenia (CustomEvent):
//   "change" – zmienił się stan połączenia, zakresy, cele itp. (odczytaj właściwości obiektu)
//   "data"   – detail: TreadmillData (scalone w this.data)
//   "status" – detail: { op, param, name } z charakterystyki statusu maszyny
//   "log"    – detail: tekst do logu diagnostycznego

import {
  UUID,
  OP,
  OP_NAME,
  RESULT,
  RESULT_NAME,
  STATUS,
  command,
  parseControlResponse,
  parseFeatures,
  parseInclineRange,
  parseSpeedRange,
  parseStatus,
  parseTreadmillData,
  snapToRange,
  toHex
} from "./protocol.js";

/** @typedef {import("./protocol.js").Range} Range */

const RESPONSE_TIMEOUT_MS = 3000;
/** Wynik, gdy komendy nie udało się wysłać (brak połączenia, błąd GATT). */
export const SEND_FAILED = -1;
/** Wynik, gdy bieżnia nie odpowiedziała w czasie. */
export const NO_RESPONSE = 0;

export class Treadmill extends EventTarget {
  /** @param {{bluetooth?: any}} [deps] */
  constructor({ bluetooth } = {}) {
    super();
    this.bluetooth =
      bluetooth ?? (typeof navigator !== "undefined" ? /** @type {any} */ (navigator).bluetooth : undefined);
    this.device = null;
    this.server = null;
    this.service = null;
    this.controlPoint = null;
    this.state = /** @type {"disconnected"|"connecting"|"connected"} */ ("disconnected");
    this.hasControl = false;
    /** @type {Range} */ this.speedRange = { min: 1, max: 12, inc: 0.1, known: false };
    /** @type {Range} */ this.inclineRange = { min: 0, max: 15, inc: 1, known: false };
    this.canSpeed = true;
    this.canIncline = true;
    /** @type {Record<string, string>} */ this.info = {};
    /** @type {import("./protocol.js").TreadmillData} */ this.data = {};
    /** Ostatnio zadane wartości (pokazywane w sterowaniu ręcznym). */
    this.target = { speed: /** @type {number|null} */ (null), incline: /** @type {number|null} */ (null) };
    this._queue = Promise.resolve();
    /** @type {{op: number, resolve: (r: number) => void, timer: any} | null} */
    this._pending = null;
    /** Charakterystyki, które już mają podpięte nasłuchiwanie (po ponownym połączeniu mogą być te same obiekty). */
    this._listened = new WeakSet();
  }

  get available() {
    return !!this.bluetooth;
  }
  get connected() {
    return this.state === "connected";
  }
  get canControl() {
    return !!this.controlPoint;
  }
  get name() {
    return this.device?.name || "";
  }

  /** Wybór urządzenia przez użytkownika i połączenie. */
  async connect() {
    if (!this.bluetooth) throw new Error("Brak Web Bluetooth w tej przeglądarce");
    let device;
    try {
      device = await this.bluetooth.requestDevice({
        filters: [{ services: [UUID.FTMS] }, { namePrefix: "FS-" }],
        optionalServices: [UUID.FTMS, UUID.DEVICE_INFO]
      });
    } catch (e) {
      if (e?.name === "NotFoundError") {
        this._log("Wybór urządzenia anulowany");
        return false;
      }
      throw e;
    }
    if (this.device !== device) {
      this.device = device;
      device.addEventListener("gattserverdisconnected", () => this._onDisconnected());
    }
    await this._setup();
    return true;
  }

  /** Ponowne połączenie z ostatnio wybranym urządzeniem (bez okna wyboru). */
  async reconnect() {
    if (!this.device) return this.connect();
    await this._setup();
    return true;
  }

  disconnect() {
    if (this.device?.gatt?.connected) this.device.gatt.disconnect();
  }

  async _setup() {
    this._setState("connecting");
    this._log(`Łączenie z ${this.name || "bieżnią"}…`);
    try {
      this.server = await this.device.gatt.connect();
      const svc = (this.service = await this.server.getPrimaryService(UUID.FTMS));

      try {
        const dv = await (await svc.getCharacteristic(UUID.FEATURE)).readValue();
        const f = parseFeatures(dv);
        this.canSpeed = f.canSpeed;
        this.canIncline = f.canIncline;
        this._log(
          `Cechy: ${toHex(dv)} → zadawanie prędkości: ${f.canSpeed ? "tak" : "nie"}, nachylenia: ${f.canIncline ? "tak" : "nie"}` +
            (f.declared ? "" : " (bieżnia nie deklaruje celów – próbuję mimo to)")
        );
      } catch {
        this._log("Brak charakterystyki cech (2ACC)");
      }

      await this.refreshSpeedRange(true);

      try {
        const dv = await (await svc.getCharacteristic(UUID.INCLINE_RANGE)).readValue();
        this.inclineRange = parseInclineRange(dv);
        this._log(
          `Zakres nachylenia: ${toHex(dv)} → ${this.inclineRange.min}–${this.inclineRange.max}, krok ${this.inclineRange.inc}`
        );
      } catch {
        this._log("Brak zakresu nachylenia (2AD5) – zakładam 0–15");
      }

      const td = await svc.getCharacteristic(UUID.TREADMILL_DATA);
      this._listen(td, dv => this._onData(dv));
      await td.startNotifications();

      try {
        this.controlPoint = await svc.getCharacteristic(UUID.CONTROL_POINT);
        this._listen(this.controlPoint, dv => this._onControlResponse(dv));
        await this.controlPoint.startNotifications(); // włącza „indications” – wymagane przed zapisem komend
      } catch {
        this.controlPoint = null;
        this._log("✖ Brak Control Point (2AD9) – sterowanie niemożliwe, tylko odczyt");
      }

      try {
        const st = await svc.getCharacteristic(UUID.STATUS);
        this._listen(st, dv => this._onStatus(dv));
        await st.startNotifications();
      } catch {
        this._log("Brak statusu maszyny (2ADA)");
      }

      await this._readDeviceInfo();
    } catch (e) {
      this._setState("disconnected");
      throw e;
    }
    this.hasControl = false;
    this._setState("connected");
    this._log("Połączono ✔");
    if (this.controlPoint) await this.requestControl();
  }

  async _readDeviceInfo() {
    try {
      const dis = await this.server.getPrimaryService(UUID.DEVICE_INFO);
      const dec = new TextDecoder();
      const fields = [
        ["Producent", UUID.MANUFACTURER],
        ["Model", UUID.MODEL],
        ["Firmware", UUID.FIRMWARE],
        ["Hardware", UUID.HARDWARE],
        ["Nr seryjny", UUID.SERIAL]
      ];
      for (const [label, uuid] of fields) {
        try {
          this.info[label] = dec.decode(await (await dis.getCharacteristic(uuid)).readValue()).replace(/\0/g, "");
        } catch {
          /* pole opcjonalne */
        }
      }
    } catch {
      /* usługa opcjonalna */
    }
  }

  /**
   * Odczytuje zakres prędkości. EA200C zmienia go z trybem (chodzenie 6 km/h, bieganie 12 km/h),
   * dlatego warto go odświeżać przed startem programu.
   * @param {boolean} [first]
   */
  async refreshSpeedRange(first = false) {
    if (!this.service) return;
    try {
      const dv = await (await this.service.getCharacteristic(UUID.SPEED_RANGE)).readValue();
      const r = parseSpeedRange(dv);
      if (first || r.max !== this.speedRange.max || r.min !== this.speedRange.min) {
        this._log(`Zakres prędkości: ${toHex(dv)} → ${r.min}–${r.max} km/h, krok ${r.inc}`);
      }
      this.speedRange = r;
      this._emit("change");
    } catch {
      if (first) this._log("Brak zakresu prędkości (2AD4) – zakładam 1–12 km/h");
    }
  }

  // ---- komendy ----

  /** @param {number} kmh */
  setSpeed(kmh) {
    const v = snapToRange(kmh, this.speedRange);
    this.target.speed = v;
    this._emit("change");
    return this._command(command.setSpeed(v));
  }

  /** @param {number} level */
  setIncline(level) {
    if (!this.canIncline) return Promise.resolve(RESULT.NOT_SUPPORTED);
    const v = snapToRange(level, this.inclineRange);
    this.target.incline = v;
    this._emit("change");
    return this._command(command.setIncline(v));
  }

  start() {
    return this._command(command.start());
  }
  pause() {
    this._clearTarget();
    return this._command(command.pause());
  }
  stop() {
    this._clearTarget();
    return this._command(command.stop());
  }

  /** Po zatrzymaniu zadane wartości są nieaktualne – widoki pokażą wtedy rzeczywiste odczyty z bieżni. */
  _clearTarget() {
    this.target = { speed: null, incline: null };
    this._emit("change");
  }

  async requestControl() {
    const r = await this._send(command.requestControl());
    this.hasControl = r === RESULT.SUCCESS || r === NO_RESPONSE; // bez odpowiedzi – spróbujemy i tak
    return r;
  }

  /** Wysyła komendę, w razie potrzeby najpierw przejmując kontrolę. */
  async _command(bytes) {
    try {
      if (!this.hasControl) await this.requestControl();
      let r = await this._send(bytes);
      if (r === RESULT.NOT_PERMITTED) {
        this.hasControl = false;
        await this.requestControl();
        r = await this._send(bytes);
      }
      return r;
    } catch (e) {
      this._log(`✖ ${e?.message || e}`);
      return SEND_FAILED;
    }
  }

  /** Kolejkuje zapis i czeka na odpowiedź Control Point (lub timeout). */
  _send(bytes) {
    const op = bytes[0];
    const job = async () => {
      if (!this.controlPoint || !this.connected) throw new Error("brak połączenia");
      const response = new Promise(resolve => {
        const timer = setTimeout(() => {
          if (this._pending?.op === op) {
            this._pending = null;
            this._log(`⚠ brak odpowiedzi na ${OP_NAME[op]}`);
            resolve(NO_RESPONSE);
          }
        }, RESPONSE_TIMEOUT_MS);
        this._pending = { op, resolve, timer };
      });
      const buf = new Uint8Array(bytes);
      this._log(`→ ${OP_NAME[op] || op} [${toHex(buf)}]`);
      const cp = this.controlPoint;
      if (cp.writeValueWithResponse) await cp.writeValueWithResponse(buf);
      else await cp.writeValue(buf);
      return response;
    };
    const p = this._queue.then(job, job);
    this._queue = p.catch(() => {});
    return p;
  }

  // ---- zdarzenia z bieżni ----

  _onControlResponse(dv) {
    const r = parseControlResponse(dv);
    if (!r) {
      this._log(`← CP ${toHex(dv)}`);
      return;
    }
    this._log(`← odpowiedź ${OP_NAME[r.op] || r.op}: ${RESULT_NAME[r.result] || r.result}`);
    if (this._pending?.op === r.op) {
      const p = this._pending;
      this._pending = null;
      clearTimeout(p.timer);
      p.resolve(r.result);
    }
  }

  _onData(dv) {
    const d = parseTreadmillData(dv);
    Object.assign(this.data, d);
    this._emit("data", d);
  }

  _onStatus(dv) {
    const s = parseStatus(dv);
    if (!s) return;
    this._log(`ⓘ status: ${s.name} [${toHex(dv)}]`);
    if (s.op === STATUS.CONTROL_LOST) this.hasControl = false;
    if (s.op === STATUS.STOPPED || s.op === STATUS.STOPPED_SAFETY) this._clearTarget(); // np. pilot albo klucz
    this._emit("status", s);
  }

  _onDisconnected() {
    this.controlPoint = null;
    this.hasControl = false;
    if (this._pending) {
      clearTimeout(this._pending.timer);
      this._pending.resolve(SEND_FAILED);
      this._pending = null;
    }
    this._log("Bieżnia rozłączona");
    this._setState("disconnected");
  }

  // ---- pomocnicze ----

  _listen(characteristic, handler) {
    if (this._listened.has(characteristic)) return;
    this._listened.add(characteristic);
    characteristic.addEventListener("characteristicvaluechanged", ev => handler(ev.target.value));
  }
  _setState(s) {
    this.state = s;
    this._emit("change");
  }
  _emit(type, detail) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
  _log(msg) {
    this._emit("log", msg);
  }
}

export { OP };
