// @ts-check
// Protokół Bluetooth FTMS (Fitness Machine Service): identyfikatory, parsowanie danych i kodowanie komend.
// Same czyste funkcje – bez Web Bluetooth i bez DOM, dzięki czemu łatwo je testować.

/** @typedef {{min: number, max: number, inc: number, known: boolean}} Range */
/**
 * @typedef {object} TreadmillData
 * @property {number} [speed]   km/h
 * @property {number} [dist]    m
 * @property {number} [incline] w jednostkach FTMS (na tej bieżni: poziom)
 * @property {number} [kcal]
 * @property {number} [hr]      uderzenia/min
 * @property {number} [elapsed] s
 */

/** Pełny UUID z 16-bitowego identyfikatora Bluetooth SIG. */
export const uuid16 = n => `0000${n.toString(16).padStart(4, "0")}-0000-1000-8000-00805f9b34fb`;

export const UUID = Object.freeze({
  FTMS: uuid16(0x1826),
  DEVICE_INFO: uuid16(0x180a),
  FEATURE: uuid16(0x2acc),
  TREADMILL_DATA: uuid16(0x2acd),
  SPEED_RANGE: uuid16(0x2ad4),
  INCLINE_RANGE: uuid16(0x2ad5),
  CONTROL_POINT: uuid16(0x2ad9),
  STATUS: uuid16(0x2ada),
  MANUFACTURER: uuid16(0x2a29),
  MODEL: uuid16(0x2a24),
  FIRMWARE: uuid16(0x2a26),
  HARDWARE: uuid16(0x2a27),
  SERIAL: uuid16(0x2a25)
});

/** Kody operacji Control Point. */
export const OP = Object.freeze({
  REQUEST_CONTROL: 0x00,
  RESET: 0x01,
  SET_SPEED: 0x02,
  SET_INCLINE: 0x03,
  START: 0x07,
  STOP_PAUSE: 0x08
});
export const OP_NAME = {
  0: "Request Control",
  1: "Reset",
  2: "Set Speed",
  3: "Set Incline",
  7: "Start/Resume",
  8: "Stop/Pause"
};

/** Kody wyniku odpowiedzi Control Point. */
export const RESULT = Object.freeze({ SUCCESS: 1, NOT_SUPPORTED: 2, INVALID_PARAM: 3, FAILED: 4, NOT_PERMITTED: 5 });
export const RESULT_NAME = {
  1: "OK",
  2: "nieobsługiwane",
  3: "zły parametr",
  4: "operacja nieudana",
  5: "brak kontroli"
};

/** Kody statusu maszyny (charakterystyka 0x2ADA). */
export const STATUS = Object.freeze({ RESET: 1, STOPPED: 2, STOPPED_SAFETY: 3, STARTED: 4, CONTROL_LOST: 0xff });
export const STATUS_NAME = {
  1: "reset",
  2: "zatrzymana/pauza",
  3: "zatrzymana (bezpieczeństwo)",
  4: "uruchomiona",
  5: "zmiana prędkości",
  6: "zmiana nachylenia",
  0xff: "utracono kontrolę"
};

/**
 * Bajty jako tekst szesnastkowy, np. "02 2c 01".
 * @param {DataView|Uint8Array|number[]} data
 */
export function toHex(data) {
  const bytes = data instanceof DataView ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : data;
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join(" ");
}

/**
 * Dekoduje pakiet Treadmill Data (0x2ACD). Pola są opcjonalne – obecność określają flagi.
 * Bieżnie FitShow wysyłają czasem dane w kilku pakietach, więc wynik należy scalać z poprzednim stanem.
 * @param {DataView} dv
 * @returns {TreadmillData}
 */
export function parseTreadmillData(dv) {
  /** @type {TreadmillData} */
  const r = {};
  if (dv.byteLength < 2) return r;
  const flags = dv.getUint16(0, true);
  let o = 2;
  const has = n => o + n <= dv.byteLength;
  // bit 0 = „More Data”: gdy 0, pakiet zawiera prędkość chwilową
  if (!(flags & 0x0001)) {
    if (!has(2)) return r;
    r.speed = dv.getUint16(o, true) / 100;
    o += 2;
  }
  if (flags & 0x0002) {
    if (!has(2)) return r;
    o += 2;
  } // średnia prędkość
  if (flags & 0x0004) {
    if (!has(3)) return r;
    r.dist = dv.getUint8(o) | (dv.getUint8(o + 1) << 8) | (dv.getUint8(o + 2) << 16);
    o += 3;
  }
  if (flags & 0x0008) {
    if (!has(4)) return r;
    r.incline = dv.getInt16(o, true) / 10;
    o += 4;
  } // + kąt rampy
  if (flags & 0x0010) {
    if (!has(4)) return r;
    o += 4;
  } // przewyższenie
  if (flags & 0x0020) {
    if (!has(1)) return r;
    o += 1;
  } // tempo chwilowe
  if (flags & 0x0040) {
    if (!has(1)) return r;
    o += 1;
  } // tempo średnie
  if (flags & 0x0080) {
    if (!has(5)) return r;
    const k = dv.getUint16(o, true);
    if (k !== 0xffff) r.kcal = k;
    o += 5;
  }
  if (flags & 0x0100) {
    if (!has(1)) return r;
    const h = dv.getUint8(o);
    if (h) r.hr = h;
    o += 1;
  }
  if (flags & 0x0200) {
    if (!has(1)) return r;
    o += 1;
  } // MET
  if (flags & 0x0400) {
    if (!has(2)) return r;
    r.elapsed = dv.getUint16(o, true);
    o += 2;
  }
  return r;
}

/**
 * Dekoduje Fitness Machine Feature (0x2ACC).
 * @param {DataView} dv
 */
export function parseFeatures(dv) {
  const features = dv.getUint32(0, true);
  const targets = dv.byteLength >= 8 ? dv.getUint32(4, true) : 0;
  // Część bieżni nie deklaruje celów, a i tak je przyjmuje – wtedy zakładamy, że można.
  const declared = targets !== 0;
  return {
    features,
    targets,
    declared,
    canSpeed: !declared || !!(targets & 1),
    canIncline: !declared || !!(targets & 2)
  };
}

/**
 * Supported Speed Range (0x2AD4): wartości w 0,01 km/h.
 * @param {DataView} dv
 * @returns {Range}
 */
export const parseSpeedRange = dv => ({
  min: dv.getUint16(0, true) / 100,
  max: dv.getUint16(2, true) / 100,
  inc: dv.getUint16(4, true) / 100 || 0.1,
  known: true
});

/**
 * Supported Inclination Range (0x2AD5): wartości w 0,1 jednostki.
 * @param {DataView} dv
 * @returns {Range}
 */
export const parseInclineRange = dv => ({
  min: dv.getInt16(0, true) / 10,
  max: dv.getInt16(2, true) / 10,
  inc: dv.getUint16(4, true) / 10 || 1,
  known: true
});

/**
 * Odpowiedź Control Point: [0x80, kod operacji, wynik].
 * @param {DataView} dv
 * @returns {{op: number, result: number} | null}
 */
export function parseControlResponse(dv) {
  if (dv.byteLength < 3 || dv.getUint8(0) !== 0x80) return null;
  return { op: dv.getUint8(1), result: dv.getUint8(2) };
}

/**
 * Fitness Machine Status (0x2ADA).
 * @param {DataView} dv
 * @returns {{op: number, param: number|null, name: string} | null}
 */
export function parseStatus(dv) {
  if (!dv.byteLength) return null;
  const op = dv.getUint8(0);
  return { op, param: dv.byteLength > 1 ? dv.getUint8(1) : null, name: STATUS_NAME[op] || String(op) };
}

/**
 * Zaokrągla wartość do kroku i przycina do zakresu urządzenia.
 * @param {number} v
 * @param {Range} range
 */
export function snapToRange(v, range) {
  // toFixed usuwa błędy zmiennoprzecinkowe (5,55 / 0,1 = 55,4999…)
  const snapped = Math.round(+(v / range.inc).toFixed(6)) * range.inc;
  return Math.round(Math.min(range.max, Math.max(range.min, snapped)) * 100) / 100;
}

const u16 = v => [v & 0xff, (v >> 8) & 0xff];

/** Komendy Control Point jako bajty. */
export const command = {
  requestControl: () => [OP.REQUEST_CONTROL],
  /** @param {number} kmh */
  setSpeed: kmh => [OP.SET_SPEED, ...u16(Math.round(kmh * 100))],
  /** @param {number} level wartość w jednostkach FTMS (0,1) – liczby ujemne w kodzie U2 */
  setIncline: level => [OP.SET_INCLINE, ...u16(Math.round(level * 10) & 0xffff)],
  start: () => [OP.START],
  pause: () => [OP.STOP_PAUSE, 0x02],
  stop: () => [OP.STOP_PAUSE, 0x01]
};
