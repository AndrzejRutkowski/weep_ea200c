// @ts-check
// Jedno miejsce dostępu do danych zapisanych w przeglądarce (localStorage).
// Klucze są zgodne z wcześniejszymi wersjami aplikacji – nie zmieniaj ich bez migracji,
// bo użytkownik straci programy i historię.

import { defaultPrograms } from "../domain/program.js";
import { normalizeSettings } from "../domain/settings.js";

export const KEYS = Object.freeze({
  SCHEMA: "bieznia.schema",
  PROGRAMS: "bieznia.programs.v1",
  PROGRAMS_TS: "bieznia.programs.ts.v1",
  SELECTED: "bieznia.selected.v1",
  SETTINGS: "bieznia.settings.v1",
  HISTORY: "bieznia.history.v1",
  CURRENT_RUN: "bieznia.currentrun.v1",
  HELP_SEEN: "bieznia.helpseen.v1"
});

/** Aktualna wersja schematu danych. Zwiększ i dopisz krok w MIGRATIONS przy zmianie formatu. */
export const SCHEMA_VERSION = 2;

/**
 * Kolejne migracje: klucz = wersja, DO której migrujemy.
 * @type {Record<number, (repo: Repository) => void>}
 */
const MIGRATIONS = {
  // v2: usunięto zapis programów w pliku HTML (tryb pliku lokalnego)
  2: repo => {
    repo.remove("bieznia.filesaved.ts.v1");
    try {
      indexedDB.deleteDatabase("bieznia");
    } catch {
      /* brak IndexedDB – nic do sprzątania */
    }
  }
};

export class Repository {
  /** @param {Storage} [storage] */
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
  }

  /** @template T @param {string} key @param {T} fallback @returns {T} */
  get(key, fallback) {
    try {
      const v = this.storage.getItem(key);
      return v == null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  }

  set(key, value) {
    try {
      this.storage.setItem(key, JSON.stringify(value));
    } catch {
      /* brak miejsca lub tryb prywatny */
    }
  }

  remove(key) {
    try {
      this.storage.removeItem(key);
    } catch {
      /* jw. */
    }
  }

  /** Uruchamia brakujące migracje. Wywołaj raz przy starcie. */
  migrate() {
    const from = /** @type {number} */ (this.get(KEYS.SCHEMA, 1));
    for (let v = from + 1; v <= SCHEMA_VERSION; v++) MIGRATIONS[v]?.(this);
    if (from !== SCHEMA_VERSION) this.set(KEYS.SCHEMA, SCHEMA_VERSION);
  }

  // ---- ustawienia ----
  loadSettings() {
    return normalizeSettings(this.get(KEYS.SETTINGS, {}));
  }
  /** @param {import("../domain/settings.js").Settings} s */
  saveSettings(s) {
    this.set(KEYS.SETTINGS, s);
  }

  // ---- programy ----
  /** @returns {import("../domain/program.js").Program[]} */
  loadPrograms() {
    const list = this.get(KEYS.PROGRAMS, null);
    if (Array.isArray(list) && list.length) return list;
    const defaults = defaultPrograms();
    this.savePrograms(defaults);
    return defaults;
  }
  /** @param {import("../domain/program.js").Program[]} programs */
  savePrograms(programs) {
    this.set(KEYS.PROGRAMS, programs);
    this.set(KEYS.PROGRAMS_TS, Date.now());
  }
  /** @param {import("../domain/program.js").Program[]} programs */
  loadSelectedId(programs) {
    const id = this.get(KEYS.SELECTED, null);
    return programs.some(p => p.id === id) ? id : programs[0].id;
  }
  saveSelectedId(id) {
    this.set(KEYS.SELECTED, id);
  }

  // ---- historia ----
  /** @returns {import("../domain/history.js").HistoryEntry[]} */
  loadHistory() {
    const list = this.get(KEYS.HISTORY, []);
    return Array.isArray(list) ? list : [];
  }
  saveHistory(list) {
    this.set(KEYS.HISTORY, list);
  }

  /** Postęp trwającego treningu – odzyskiwany, gdy strona zostanie zamknięta w trakcie. */
  loadCurrentRun() {
    return this.get(KEYS.CURRENT_RUN, null);
  }
  saveCurrentRun(entry) {
    this.set(KEYS.CURRENT_RUN, entry);
  }
  clearCurrentRun() {
    this.remove(KEYS.CURRENT_RUN);
  }

  // ---- pozostałe ----
  get helpSeen() {
    return !!this.get(KEYS.HELP_SEEN, 0);
  }
  markHelpSeen() {
    this.set(KEYS.HELP_SEEN, 1);
  }
}
