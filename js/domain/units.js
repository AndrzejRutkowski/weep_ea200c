// @ts-check
// Przeliczanie poziomów nachylenia bieżni na kąt i procent.
// EA200C ma poziomy 0–15. Bieżnia przesyła je w polu FTMS przeznaczonym na procenty,
// a rzeczywisty kąt przy najwyższym poziomie podaje użytkownik w Ustawieniach (domyślnie 6°).
// Zakładamy liniową zależność kąta od poziomu – to przybliżenie.

import { fmtNum } from "../util/format.js";

const DEG = Math.PI / 180;

/**
 * Kąt w stopniach dla danego poziomu.
 * @param {number|null|undefined} level
 * @param {number} maxLevel najwyższy poziom bieżni (np. 15)
 * @param {number} maxDeg kąt przy najwyższym poziomie
 */
export function inclineDeg(level, maxLevel, maxDeg) {
  const top = maxLevel > 0 ? maxLevel : 15;
  return ((level || 0) / top) * maxDeg;
}

/** Nachylenie w procentach (wzniesienie na 100 m). */
export const inclinePct = (level, maxLevel, maxDeg) => Math.tan(inclineDeg(level, maxLevel, maxDeg) * DEG) * 100;

/** Nachylenie jako ułamek (np. 0,07 dla 7%) – do liczenia przewyższenia. */
export function inclineGrade(level, maxLevel, maxDeg) {
  if (level == null || isNaN(level) || level <= 0) return 0;
  return Math.tan(inclineDeg(level, maxLevel, maxDeg) * DEG);
}

/** Opis do wyświetlenia, np. "≈7,0%". */
export function describeIncline(level, maxLevel, maxDeg) {
  if (level == null || isNaN(level)) return "";
  return `≈${fmtNum(inclinePct(level, maxLevel, maxDeg))}%`;
}
