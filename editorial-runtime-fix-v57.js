(() => {
  if (window.__LION_RUNTIME_V57__) return;
  window.__LION_RUNTIME_V57__ = true;
  let reloading = false;

  function repair(attempt = 0) {
    const mode = document.getElementById('pixelMode');
    if (!mode) {
      if (attempt < 40) setTimeout(() => repair(attempt + 1), 150);
      return;
    }

    const labels = [...mode.options].map(o => o.textContent || '');
    const legacyHasControl = labels.some(t => /Dessin en courbes/i.test(t));
    const v53Active = labels.some(t => /V5\.3/i.test(t));

    if (!legacyHasControl || v53Active || reloading) return;
    reloading = true;

    // L'ancien convertisseur asynchrone vient de finir. On relance V5.3 maintenant,
    // afin qu'il soit définitivement le dernier moteur à prendre la main.
    window.__LION_EDITORIAL_V53__ = false;
    const script = document.createElement('script');
    script.src = `editorial-mode-v53.js?v=57-${Date.now()}`;
    script.onload = () => {
      reloading = false;
      const readable = document.getElementById('editorialLabelReadability');
      if (readable) window.__LION_LABEL_READABILITY__ = readable.value;
    };
    script.onerror = () => { reloading = false; };
    document.body.appendChild(script);
  }

  setTimeout(() => repair(), 1800);
  setTimeout(() => repair(), 3200);
  setTimeout(() => repair(), 5000);
})();

// V5.16 : moteur séparé Paint by Numbers détaillé (SVG).
setTimeout(() => {
  if (window.__LION_SVG_LOADER_V516__) return;
  window.__LION_SVG_LOADER_V516__ = true;
  const script = document.createElement('script');
  script.src = 'https://cdn.jsdelivr.net/gh/mimiossart/lion-dynasty-hub@ac37cbe664c6826bbd16a5c7b1b3e56db341e375/paint-by-numbers-svg-v516.js';
  script.crossOrigin = 'anonymous';
  document.body.appendChild(script);
}, 5800);
