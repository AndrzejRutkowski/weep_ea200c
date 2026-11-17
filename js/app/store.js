// @ts-check
// Minimalny magazyn stanu: jedno źródło prawdy + powiadamianie subskrybentów.
// Widoki czytają stan i porównują go z poprzednim, żeby przerysować tylko to, co się zmieniło.

/**
 * @template S
 * @typedef {object} Store
 * @property {() => S} get
 * @property {(patch: Partial<S> | ((s: S) => Partial<S>)) => void} set
 * @property {(fn: (state: S, prev: S) => void) => () => void} subscribe
 */

/**
 * @template S
 * @param {S} initial
 * @returns {Store<S>}
 */
export function createStore(initial) {
  let state = initial;
  const listeners = new Set();
  return {
    get: () => state,
    set(patch) {
      const prev = state;
      state = { ...state, ...(typeof patch === "function" ? patch(state) : patch) };
      for (const fn of listeners) fn(state, prev);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }
  };
}
