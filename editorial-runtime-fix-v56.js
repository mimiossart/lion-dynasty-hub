(() => {
  if (window.__LION_RUNTIME_FIX_V56__) return;
  window.__LION_RUNTIME_FIX_V56__ = true;

  let reloads = 0;

  const modeIsCurrent = () => {
    const mode = document.getElementById('pixelMode');
    if (!mode) return false;
    return [...mode.options].some(o => /V5\.4/i.test(o.textContent || ''));
  };

  const loadScript = (src) => new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `${src}?v=56-${Date.now()}`;
    s.onload = resolve;
    s.onerror = reject;
    document.body.appendChild(s);
  });

  async function restoreEditorial() {
    if (modeIsCurrent()) return;
    if (reloads >= 2) return;
    reloads++;

    window.__LION_EDITORIAL_V54__ = false;
    window.__LION_LABELS_V55__ = false;

    try {
      await loadScript('editorial-mode-v54.js');
      setTimeout(async () => {
        try {
          await loadScript('editorial-labels-v55.js');
        } catch (err) {
          console.error('Lion Dynasty labels reload failed', err);
        }
      }, 260);
    } catch (err) {
      console.error('Lion Dynasty V5.4 restore failed', err);
    }
  }

  // L'ancien convertisseur se charge de façon asynchrone. On laisse son
  // initialisation se terminer puis on réapplique V5.4 en dernier.
  setTimeout(restoreEditorial, 1400);
  setTimeout(restoreEditorial, 3600);
})();
