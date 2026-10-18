/* Apply before the stylesheet so the first paint uses the saved appearance. */
(() => {
  "use strict";
  const key = "triage-desk-theme";
  const valid = (value) => ["system", "light", "dark"].includes(value);
  const system = window.matchMedia("(prefers-color-scheme: dark)");
  const native = window.triageNative;
  let mode = valid(native?.initialTheme) ? native.initialTheme : "system";
  try {
    const saved = localStorage.getItem(key);
    if (valid(saved)) mode = saved;
  } catch {}

  function apply() {
    const theme =
      mode === "system" ? (system.matches ? "dark" : "light") : mode;
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    const control = document.getElementById("theme");
    if (control) control.value = mode;
  }

  async function select(value) {
    if (!valid(value)) return;
    mode = value;
    apply();
    try {
      if (native?.setTheme) await native.setTheme(mode);
      localStorage.setItem(key, mode);
    } catch {
      const notification = document.getElementById("notification");
      if (notification) {
        notification.textContent =
          "Theme changed for this session. The preference could not be saved.";
        notification.hidden = false;
      }
    }
  }

  // Change appearance only; rebuilding the workspace would discard form drafts.
  system.addEventListener("change", () => {
    if (mode === "system") apply();
  });
  window.addEventListener("storage", (event) => {
    if (!native && (event.key === key || event.key === null)) {
      mode = valid(event.newValue) ? event.newValue : "system";
      apply();
    }
  });
  document.addEventListener("change", (event) => {
    if (event.target.id === "theme") void select(event.target.value);
  });
  document.addEventListener("DOMContentLoaded", apply);
  apply();
})();
