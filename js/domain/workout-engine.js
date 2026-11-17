// @ts-check
// Silnik treningu jako maszyna stanów. Nie wysyła komend Bluetooth, nie zna DOM ani zegara:
// dostaje zdarzenia (start, tick z upływem czasu, pauza z pilota…) i zwraca listę efektów,
// które wykonuje warstwa aplikacji. Dzięki temu całą logikę da się przetestować bez bieżni.
//
//   idle ──start──▶ starting ──(opóźnienie)──▶ running ──(ostatni odcinek)──▶ done
//                      │                         │  ▲
//                      └──────pause / pilot──────▶ paused ──resume──▶ resuming ──(opóźnienie)──┘
//
// Efekty (pole "type"):
//   belt     { action: "start"|"pause"|"stop" }  – komenda dla taśmy
//   incline  { level }                            – ustaw nachylenie (przed ruszeniem taśmy)
//   segment  { index, announce }                  – ustaw prędkość i nachylenie odcinka (announce = sygnał/komunikat)
//   beep     { kind: "count" }                    – sygnał odliczania 3-2-1
//   persist  {}                                   – zapisz postęp (na wypadek zamknięcia strony)
//   finished { status: "ukończony"|"zatrzymany" }

import { uid } from "../util/format.js";
import { programDuration, segmentStart } from "./program.js";

/** @typedef {import("./program.js").Program} Program */
/** @typedef {"starting"|"running"|"paused"|"resuming"|"done"} Phase */
/** @typedef {{type: string, [key: string]: any}} Effect */

const PERSIST_EVERY_S = 10;
/** Po ilu sekundach odcinka „Poprzedni” zaczyna bieżący od nowa zamiast cofać. */
const RESTART_THRESHOLD_S = 5;

export class WorkoutEngine {
  /**
   * @param {Program} program
   * @param {{startDelay: number, now?: number, id?: string}} options
   */
  constructor(program, { startDelay, now = Date.now(), id = uid() }) {
    /** Kopia programu – zmiany w trakcie treningu (+1 min) nie dotykają zapisanego programu. */
    this.program = structuredClone(program);
    this.startDelay = startDelay;
    this.id = id;
    this.startedAt = now;
    /** @type {Phase|"idle"} */ this.phase = "idle";
    this.segIdx = 0;
    this.segT = 0; // czas w bieżącym odcinku (s)
    this.t = 0; // aktywny czas treningu, bez pauz (s)
    this.dist = 0; // km
    this.elev = 0; // m
    this.maxSpeed = 0; // km/h
    this.wait = 0; // odliczanie przed ustawieniem prędkości (s)
    /** @type {string|null} */ this.pausedBy = null;
    /** @type {number|null} */ this.lastBeep = null;
    this.sincePersist = 0;
  }

  get active() {
    return this.phase !== "idle" && this.phase !== "done";
  }
  get segments() {
    return this.program.segments;
  }
  get current() {
    return this.segments[this.segIdx];
  }
  get next() {
    return this.segments[this.segIdx + 1];
  }
  /** Miejsce w programie (s), liczone z planowanych długości odcinków. */
  get elapsedPlanned() {
    return segmentStart(this.program, this.segIdx) + this.segT;
  }
  get remainingPlanned() {
    return programDuration(this.program) - this.elapsedPlanned;
  }
  get segmentRemaining() {
    return this.current ? this.current.dur - this.segT : 0;
  }

  /** @returns {Effect[]} */
  start() {
    if (this.phase !== "idle" || !this.segments.length) return [];
    this.phase = "starting";
    this.wait = this.startDelay;
    // nachylenie można ustawić od razu, prędkość dopiero po odliczaniu bieżni
    return [
      { type: "belt", action: "start" },
      { type: "incline", level: this.segments[0].incline }
    ];
  }

  /**
   * Upływ czasu.
   * @param {number} dt sekundy od poprzedniego wywołania
   * @param {{speed?: number, grade?: number}} [sample] aktualna prędkość bieżni i nachylenie (ułamek)
   * @returns {Effect[]}
   */
  tick(dt, { speed = 0, grade = 0 } = {}) {
    /** @type {Effect[]} */
    const fx = [];
    if (this.phase === "starting" || this.phase === "resuming") {
      this.wait -= dt;
      if (this.wait <= 0) {
        const first = this.phase === "starting";
        this.phase = "running";
        fx.push({ type: "segment", index: this.segIdx, announce: first });
      }
      return fx;
    }
    if (this.phase !== "running") return fx;

    this.t += dt;
    this.segT += dt;
    const dKm = (speed * dt) / 3600;
    this.dist += dKm;
    this.elev += dKm * 1000 * grade;
    this.maxSpeed = Math.max(this.maxSpeed, speed);

    this.sincePersist += dt;
    if (this.sincePersist >= PERSIST_EVERY_S) {
      this.sincePersist = 0;
      fx.push({ type: "persist" });
    }

    const rem = this.segmentRemaining;
    const sec = Math.ceil(rem);
    if (sec >= 1 && sec <= 3 && this.lastBeep !== sec) {
      this.lastBeep = sec;
      fx.push({ type: "beep", kind: "count" });
    }

    if (rem <= 0) {
      this.segT = -rem; // nadwyżkę czasu przenosimy na kolejny odcinek
      this.segIdx++;
      this.lastBeep = null;
      if (this.segIdx >= this.segments.length) fx.push(...this._finish("ukończony"));
      else fx.push({ type: "segment", index: this.segIdx, announce: true });
    }
    return fx;
  }

  /** Pauza z aplikacji. */
  pause() {
    if (!this.active || this.phase === "paused") return [];
    this.phase = "paused";
    this.pausedBy = null;
    return [{ type: "belt", action: "pause" }];
  }

  /** Wznowienie z aplikacji. */
  resume() {
    if (this.phase !== "paused") return [];
    this.phase = "resuming";
    this.wait = this.startDelay;
    this.pausedBy = null;
    return [{ type: "belt", action: "start" }];
  }

  /** Bieżnia zgłosiła zatrzymanie (pilot, przycisk, klucz bezpieczeństwa). */
  remotePause() {
    if (!["running", "starting", "resuming"].includes(this.phase)) return [];
    this.phase = "paused";
    this.pausedBy = "z bieżni lub pilota";
    return [];
  }

  /** Bieżnia zgłosiła uruchomienie (start z pilota) – po odliczaniu wracamy do odcinka. */
  remoteStart() {
    if (this.phase !== "paused") return [];
    this.phase = "resuming";
    this.wait = this.startDelay;
    return [];
  }

  disconnected() {
    if (!this.active) return [];
    this.phase = "paused";
    this.pausedBy = "rozłączenie";
    return [];
  }

  reconnected() {
    if (this.phase === "paused" && this.pausedBy === "rozłączenie") this.pausedBy = "rozłączenie – kliknij Wznów";
    return [];
  }

  /** „Poprzedni odcinek”: na początku odcinka cofa, później zaczyna bieżący od nowa. */
  previous() {
    return this._jump(this.segT > RESTART_THRESHOLD_S ? 0 : -1);
  }
  skip() {
    return this._jump(1);
  }

  /** Wydłuża bieżący odcinek o minutę (tylko w tym treningu). */
  addMinute() {
    if (this.active && this.current) this.current.dur += 60;
    return [];
  }

  /** Stop z aplikacji. */
  stop() {
    if (!this.active) return [];
    return this._finish("zatrzymany");
  }

  _jump(delta) {
    if (!this.active) return [];
    const idx = this.segIdx + delta;
    if (idx >= this.segments.length) return this._finish("ukończony");
    this.segIdx = Math.max(0, idx);
    this.segT = 0;
    this.lastBeep = null;
    return this.phase === "running" ? [{ type: "segment", index: this.segIdx, announce: true }] : [];
  }

  /** @param {"ukończony"|"zatrzymany"} status */
  _finish(status) {
    this.phase = "done";
    return [{ type: "finished", status }];
  }
}
