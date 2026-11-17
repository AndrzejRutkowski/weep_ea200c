// @ts-check
// Sygnały dźwiękowe, komunikaty głosowe i blokada wygaszania ekranu w trakcie treningu.
// Wszystko „best effort”: gdy przeglądarka czegoś nie obsługuje, po prostu nic się nie dzieje.

export class Feedback {
  constructor() {
    /** @type {AudioContext|null} */ this.audio = null;
    /** @type {any} */ this.wakeLock = null;
    this.wantAwake = false;
    document.addEventListener("visibilitychange", () => {
      // przeglądarka zwalnia blokadę po schowaniu karty – odnów po powrocie
      if (document.visibilityState === "visible" && this.wantAwake) this._acquire();
    });
  }

  /** Dźwięk wymaga wcześniejszej interakcji użytkownika – wywołuj z obsługi kliknięcia. */
  unlockAudio() {
    try {
      const Ctx = window.AudioContext || /** @type {any} */ (window).webkitAudioContext;
      if (!this.audio && Ctx) this.audio = new Ctx();
      if (this.audio?.state === "suspended") this.audio.resume();
    } catch {
      /* brak Web Audio */
    }
  }

  beep(freq = 880, ms = 120) {
    const a = this.audio;
    if (!a) return;
    try {
      const osc = a.createOscillator();
      const gain = a.createGain();
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(a.destination);
      gain.gain.setValueAtTime(0.25, a.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, a.currentTime + ms / 1000);
      osc.start();
      osc.stop(a.currentTime + ms / 1000 + 0.02);
    } catch {
      /* ignoruj */
    }
  }

  countBeep() {
    this.beep(880, 110);
  }
  changeBeep() {
    this.beep(1320, 300);
  }
  endBeep() {
    this.beep(988, 150);
    setTimeout(() => this.beep(1319, 350), 180);
  }

  /** @param {string} text */
  say(text) {
    if (!window.speechSynthesis) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "pl-PL";
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch {
      /* ignoruj */
    }
  }

  /** Utrzymuj ekran włączony (true) albo pozwól mu zgasnąć (false). */
  keepAwake(on) {
    this.wantAwake = on;
    if (on) this._acquire();
    else {
      try {
        this.wakeLock?.release();
      } catch {
        /* ignoruj */
      }
      this.wakeLock = null;
    }
  }

  async _acquire() {
    try {
      const nav = /** @type {any} */ (navigator);
      if (!nav.wakeLock || this.wakeLock) return;
      this.wakeLock = await nav.wakeLock.request("screen");
      this.wakeLock.addEventListener("release", () => {
        this.wakeLock = null;
      });
    } catch {
      /* odmowa lub brak obsługi */
    }
  }
}
