// @ts-check
// Ustawienia aplikacji: wartości domyślne i walidacja.

import { clamp, parseNum } from "../util/format.js";

/**
 * @typedef {object} Settings
 * @property {number} startDelay  sekundy między startem taśmy a ustawieniem prędkości odcinka
 * @property {"stop"|"cool"} endAction  co zrobić po zakończeniu programu
 * @property {number} inclMaxDeg  kąt (°) przy najwyższym poziomie nachylenia
 * @property {number} spdStep     krok ręcznej zmiany prędkości (km/h)
 * @property {boolean} beep       sygnał 3-2-1 przed zmianą odcinka
 * @property {boolean} voice      komunikat głosowy przy zmianie odcinka
 * @property {"day"|"week"|"month"} historyGroup  grupowanie wykresu w zakładce Historia
 */

/** @type {Readonly<Settings>} */
export const DEFAULT_SETTINGS = Object.freeze({
  startDelay: 4,
  endAction: "stop",
  inclMaxDeg: 6,
  spdStep: 0.5,
  beep: true,
  voice: false,
  historyGroup: "week"
});

/**
 * Uzupełnia brakujące pola i przycina wartości do sensownych zakresów.
 * @param {Partial<Settings>|null|undefined} raw
 * @returns {Settings}
 */
export function normalizeSettings(raw) {
  const s = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  const n = (v, def) => (isNaN(parseNum(v)) ? def : parseNum(v));
  return {
    startDelay: clamp(n(s.startDelay, DEFAULT_SETTINGS.startDelay), 0, 15),
    endAction: s.endAction === "cool" ? "cool" : "stop",
    inclMaxDeg: clamp(n(s.inclMaxDeg, DEFAULT_SETTINGS.inclMaxDeg) || DEFAULT_SETTINGS.inclMaxDeg, 1, 20),
    spdStep: clamp(n(s.spdStep, DEFAULT_SETTINGS.spdStep) || DEFAULT_SETTINGS.spdStep, 0.1, 2),
    beep: !!s.beep,
    voice: !!s.voice,
    historyGroup: ["day", "week", "month"].includes(s.historyGroup) ? s.historyGroup : "week"
  };
}
