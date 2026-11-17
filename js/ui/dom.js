// Drobne narzędzia DOM wspólne dla widoków.

/** Element po id (typ „any”, żeby nie rzutować przy .value, .checked itp.). @returns {any} */
export const $ = id => document.getElementById(id);

/** Pokazuje/ukrywa element przez klasę „hidden”. */
export const showIf = (el, visible) => el.classList.toggle("hidden", !visible);

/** Ustawia tekst tylko, gdy się zmienił (mniej pracy przy częstym odświeżaniu). */
export function setText(el, text) {
  if (el.textContent !== text) el.textContent = text;
}

/** Ustawia HTML tylko, gdy się zmienił. */
export function setHtml(el, html) {
  if (el._html !== html) {
    el.innerHTML = html;
    el._html = html;
  }
}

/**
 * Pobiera tekst jako plik. Zwraca false, gdy przeglądarka na to nie pozwala.
 * @param {string} text
 * @param {string} filename
 * @param {string} [type]
 */
export function downloadText(text, filename, type = "application/json") {
  try {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    return true;
  } catch {
    return false;
  }
}

/** Wczytuje tekst z wybranego pliku (input type=file). @param {File} file @returns {Promise<string>} */
export const readFileText = file =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });

/** Data do nazw plików, np. 2026-11-17. */
export const today = () => new Date().toISOString().slice(0, 10);

/**
 * Przycisk wymagający potwierdzenia drugim kliknięciem (zamiast okna confirm()).
 * @param {HTMLElement} btn
 * @param {string} armedText tekst po pierwszym kliknięciu, np. „Na pewno?”
 * @param {() => void} action
 * @param {() => string} [key] identyfikator potwierdzanej rzeczy – zmiana resetuje potwierdzenie
 */
export function confirmButton(btn, armedText, action, key = () => "") {
  let armed = null;
  let timer = null;
  const original = btn.textContent;
  const reset = () => {
    armed = null;
    btn.textContent = original;
  };
  btn.addEventListener("click", () => {
    if (armed !== key()) {
      armed = key();
      btn.textContent = armedText;
      clearTimeout(timer);
      timer = setTimeout(reset, 3000);
      return;
    }
    clearTimeout(timer);
    reset();
    action();
  });
}
