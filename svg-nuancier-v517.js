(() => {
  if (window.__LION_SVG_NUANCIER_V517__) return;
  window.__LION_SVG_NUANCIER_V517__ = true;

  const NativeBlob = window.Blob;

  function readPalette() {
    const items = [...document.querySelectorAll('#pixelLegend .swatch')];
    return items.map((item, index) => {
      const txt = item.querySelector('small')?.textContent || '';
      const match = txt.match(/(\d+)\s*(#[0-9A-Fa-f]{6})/);
      if (!match) return null;
      return { number: Number(match[1]) || index + 1, hex: match[2].toUpperCase() };
    }).filter(Boolean);
  }

  function luminance(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return .2126 * r + .7152 * g + .0722 * b;
  }

  function addLegend(svg) {
    if (typeof svg !== 'string' || !svg.includes('<svg') || !svg.includes('#ef4b4b')) return svg;
    if (svg.includes('id="lion-svg-nuancier"')) return svg;

    const palette = readPalette();
    if (!palette.length) return svg;

    const open = svg.match(/<svg\b[^>]*viewBox="0 0 ([\d.]+) ([\d.]+)"[^>]*>/i);
    if (!open) return svg;

    const width = Number(open[1]);
    const height = Number(open[2]);
    if (!Number.isFinite(width) || !Number.isFinite(height)) return svg;

    const cols = palette.length > 24 ? 8 : 6;
    const rows = Math.ceil(palette.length / cols);
    const titleH = 25;
    const rowH = 25;
    const pad = 12;
    const legendH = pad * 2 + titleH + rows * rowH;
    const totalH = height + legendH;
    const itemW = width / cols;
    const startY = height + pad;

    let legend = `<g id="lion-svg-nuancier">`;
    legend += `<line x1="0" y1="${height + 2}" x2="${width}" y2="${height + 2}" stroke="#D8D3CD" stroke-width="1"/>`;
    legend += `<text x="12" y="${startY + 10}" font-family="Arial,sans-serif" font-size="10" font-weight="700" fill="#332B25">Nuancier — numéro / couleur / code HEX</text>`;

    palette.forEach((entry, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = col * itemW + 10;
      const y = startY + titleH + row * rowH;
      const fg = luminance(entry.hex) < 128 ? '#FFFFFF' : '#241F1B';
      legend += `<rect x="${x}" y="${y}" width="18" height="18" rx="2" fill="${entry.hex}" stroke="#9D9892" stroke-width="0.5"/>`;
      legend += `<text x="${x + 9}" y="${y + 9}" font-family="Arial,sans-serif" font-size="6.5" font-weight="700" fill="${fg}" text-anchor="middle" dominant-baseline="central">${entry.number}</text>`;
      legend += `<text x="${x + 23}" y="${y + 9}" font-family="Arial,sans-serif" font-size="6.3" fill="#514B46" dominant-baseline="central">${entry.number}  ${entry.hex}</text>`;
    });

    legend += '</g>';

    let out = svg.replace(/viewBox="0 0 ([\d.]+) ([\d.]+)"/i, `viewBox="0 0 ${width} ${totalH}"`);
    out = out.replace(/(<svg\b[^>]*\sheight=")[^"]+("[^>]*>)/i, `$1${totalH}$2`);
    out = out.replace('</svg>', legend + '</svg>');
    return out;
  }

  class LionPaletteBlob extends NativeBlob {
    constructor(parts = [], options = {}) {
      let nextParts = parts;
      const type = String(options?.type || '').toLowerCase();
      if (type.includes('image/svg+xml') && parts.length === 1 && typeof parts[0] === 'string') {
        nextParts = [addLegend(parts[0])];
      }
      super(nextParts, options);
    }
  }

  window.Blob = LionPaletteBlob;
})();
