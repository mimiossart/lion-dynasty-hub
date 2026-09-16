(() => {
  if (window.__LION_LABELS_V55__) return;
  window.__LION_LABELS_V55__ = true;
  window.__LION_LABEL_READABILITY__ = 'readable';

  const proto = CanvasRenderingContext2D.prototype;
  const originalFillText = proto.fillText;
  const originalStrokeText = proto.strokeText;

  const fontSize = font => {
    const m = String(font || '').match(/([0-9.]+)px/);
    return m ? Number(m[1]) : 0;
  };
  const replaceFontSize = (font, px) => String(font || '600 10px Arial').replace(/([0-9.]+)px/, `${px}px`);
  const isCode = value => /^[0-9A-Z]{1,2}$/.test(String(value || '').trim());

  proto.fillText = function(text, x, y, maxWidth) {
    const editorialPage = this.canvas && this.canvas.width === 1240 && this.canvas.height === 1754;
    const size = fontSize(this.font);
    const insideDrawing = editorialPage && y < this.canvas.height - 230;

    if (insideDrawing && isCode(text) && size > 0 && size <= 10.5) {
      const readability = window.__LION_LABEL_READABILITY__ || 'readable';
      const minimum = readability === 'xl' ? 15 : readability === 'standard' ? 9.5 : 12;
      const target = Math.max(minimum, Math.min(readability === 'xl' ? 18 : 15, size * 1.55));

      this.save();
      this.font = replaceFontSize(this.font, target);
      this.fillStyle = readability === 'standard' ? '#66615c' : '#4f4a45';
      this.strokeStyle = '#ffffff';
      this.lineJoin = 'round';
      this.miterLimit = 2;
      this.lineWidth = readability === 'xl' ? 4 : 3;
      originalStrokeText.call(this, text, x, y, maxWidth);
      originalFillText.call(this, text, x, y, maxWidth);
      this.restore();
      return;
    }
    return originalFillText.call(this, text, x, y, maxWidth);
  };

  function installControls(attempt = 0) {
    const controls = document.getElementById('exampleControls');
    const merge = document.getElementById('editorialMerge');
    const detail = document.getElementById('gridSize');
    const redraw = document.getElementById('editorialStrokeColor');

    if (!controls || !merge || !detail) {
      if (attempt < 120) setTimeout(() => installControls(attempt + 1), 100);
      return;
    }

    if (!document.getElementById('editorialLabelReadability')) {
      const label = document.createElement('label');
      label.innerHTML = `Lisibilité des codes
        <select class="field" id="editorialLabelReadability">
          <option value="standard">Standard</option>
          <option value="readable" selected>Lisible</option>
          <option value="xl">Très lisible</option>
        </select>`;
      controls.appendChild(label);

      const select = document.getElementById('editorialLabelReadability');
      select.addEventListener('change', () => {
        window.__LION_LABEL_READABILITY__ = select.value;
        redraw?.dispatchEvent(new Event('change', { bubbles: true }));
      });
    }

    // Réglage par défaut plus adapté à un coloriage réellement utilisable.
    if (merge.value === 'low') {
      merge.value = 'medium';
      merge.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (detail.value === 'ultra') {
      detail.value = 'high';
      detail.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  setTimeout(() => installControls(), 180);
})();
