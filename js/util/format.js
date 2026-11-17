// @ts-check
// Formatowanie liczb i czasu (polskie zapisy) oraz drobne narzędzia bez zależności od DOM.

/** Ogranicza wartość do przedziału [min, max]. */
export const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * Liczba z przecinkiem dziesiętnym, np. 8.5 → "8,5". Brak wartości → "–".
 * @param {number|null|undefined} v
 * @param {number} [digits=1]
 */
export const fmtNum = (v, digits = 1) => (v == null || isNaN(v) ? "–" : v.toFixed(digits).replace(".", ","));

/** Jak fmtNum, ale bez części ułamkowej dla liczb całkowitych (np. poziomy nachylenia). */
export const fmtLevel = v => (v == null || isNaN(v) ? "–" : fmtNum(v, v % 1 ? 1 : 0));

/**
 * Sekundy → "m:ss" albo "h:mm:ss".
 * @param {number} sec
 */
export function fmtTime(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = n => String(n).padStart(2, "0");
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Sekundy → "25 min" albo "1 h 5 min".
 * @param {number} sec
 */
export function fmtDuration(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h} h ${m} min` : `${m} min`;
}

/**
 * Tekst czasu → sekundy. Akceptuje "m:ss", "h:mm:ss" albo samą liczbę minut ("5", "2,5").
 * @param {string} str
 * @returns {number} NaN, gdy nie da się odczytać
 */
export function parseTime(str) {
  str = String(str).trim().replace(",", ".");
  if (!str) return NaN;
  if (!str.includes(":")) return Math.round(parseFloat(str) * 60);
  const parts = str.split(":").map(Number);
  if (parts.some(isNaN)) return NaN;
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
}

/**
 * Liczba z tekstu, akceptuje przecinek dziesiętny.
 * @param {unknown} v
 */
export const parseNum = v => parseFloat(String(v).replace(",", "."));

/** Krótki losowy identyfikator. */
export const uid = () => Math.random().toString(36).slice(2, 10);

/**
 * Zabezpiecza tekst przed wstawieniem jako HTML.
 * @param {unknown} s
 */
export const escapeHtml = s =>
  String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] || c);

/**
 * Polska odmiana: 1 trening, 2 treningi, 5 treningów.
 * @param {number} n
 * @param {[string, string, string]} forms
 */
export function plural(n, [one, few, many]) {
  if (n === 1) return one;
  const d = n % 10;
  const dd = n % 100;
  return d >= 2 && d <= 4 && (dd < 12 || dd > 14) ? few : many;
}
