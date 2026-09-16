(() => {
  let sourceImage = null;
  let currentSvg = '';
  let currentPalette = [];
  let runToken = 0;

  const wait = (n = 0) => {
    const upload = document.getElementById('pixelUpload');
    const mode = document.getElementById('pixelMode');
    const canvas = document.getElementById('pixelCanvas');
    if (!upload || !mode || !canvas) {
      if (n < 180) setTimeout(() => wait(n + 1), 100);
      return;
    }
    if (window.__LION_SVG_PBN_V516__) return;
    window.__LION_SVG_PBN_V516__ = true;
    init(upload, mode, canvas);
  };

  function init(upload, mode, canvas) {
    const colors = document.getElementById('colorCount');
    const controls = document.getElementById('exampleControls');
    const complexity = document.getElementById('exampleComplexity');
    const merge = document.getElementById('exampleMerge');
    const info = document.getElementById('pixelInfo');
    const legend = document.getElementById('pixelLegend');
    const pngButton = document.getElementById('downloadPixel');

    if (![...mode.options].some(o => o.value === 'svg-detailed')) {
      const option = document.createElement('option');
      option.value = 'svg-detailed';
      option.textContent = 'Paint by Numbers détaillé (SVG)';
      mode.appendChild(option);
    }

    if (colors) {
      if (![...colors.options].some(o => o.value === '24')) colors.add(new Option('24 couleurs', '24'));
      if (![...colors.options].some(o => o.value === '32')) colors.add(new Option('32 couleurs', '32'));
    }

    let svgButton = document.getElementById('downloadSvgDetailed');
    if (!svgButton && pngButton) {
      svgButton = document.createElement('button');
      svgButton.id = 'downloadSvgDetailed';
      svgButton.type = 'button';
      svgButton.className = pngButton.className || 'btn light';
      svgButton.textContent = 'SVG';
      svgButton.style.display = 'none';
      pngButton.insertAdjacentElement('afterend', svgButton);
    }

    const applyModeUi = () => {
      const active = mode.value === 'svg-detailed';
      if (svgButton) svgButton.style.display = active ? '' : 'none';
      if (pngButton) pngButton.textContent = active ? 'PNG aperçu' : 'PNG';
      if (controls && active) controls.hidden = false;
      const grid = document.getElementById('gridSize');
      const gridLabel = grid?.closest('label');
      if (gridLabel && active) gridLabel.style.display = 'none';
      if (active) {
        if (colors) colors.value = [...colors.options].some(o => o.value === '32') ? '32' : '24';
        if (complexity) complexity.value = 'high';
        if (merge) merge.value = 'weak';
        const codes = document.getElementById('editorialCodes');
        if (codes) codes.value = 'numbers';
        if (info) info.textContent = 'Mode SVG détaillé : importe une image pour générer les régions numérotées.';
      }
    };

    const readUpload = () => {
      const file = upload.files?.[0];
      if (!file) return Promise.resolve(null);
      return new Promise(resolve => {
        const fr = new FileReader();
        fr.onload = e => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = e.target.result;
        };
        fr.onerror = () => resolve(null);
        fr.readAsDataURL(file);
      });
    };

    const regenerate = async () => {
      if (mode.value !== 'svg-detailed') return;
      const token = ++runToken;
      if (!sourceImage) sourceImage = await readUpload();
      if (!sourceImage || token !== runToken) return;
      if (info) info.textContent = 'SVG détaillé : segmentation des couleurs et création des régions…';
      setTimeout(() => {
        try {
          if (token !== runToken) return;
          const result = buildDetailedModel(sourceImage, +(colors?.value || 32));
          currentPalette = result.palette;
          currentSvg = buildSvg(result);
          drawSvgPreview(currentSvg, canvas);
          renderLegend(currentPalette, legend);
          if (info) info.textContent = `Paint by Numbers SVG • ${result.palette.length} couleurs • ${result.regions.length} régions • ${result.labeled} codes`;
        } catch (err) {
          console.error(err);
          if (info) info.textContent = 'La génération SVG détaillée a échoué. Essaie 24 couleurs.';
        }
      }, 40);
    };

    upload.addEventListener('change', async () => {
      sourceImage = await readUpload();
      if (mode.value === 'svg-detailed') regenerate();
    });

    mode.addEventListener('change', () => {
      applyModeUi();
      if (mode.value === 'svg-detailed') setTimeout(regenerate, 90);
    });

    colors?.addEventListener('change', () => {
      if (mode.value === 'svg-detailed') regenerate();
    });

    svgButton?.addEventListener('click', () => {
      if (!currentSvg) return;
      const blob = new Blob([currentSvg], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lion-dynasty-paint-by-numbers.svg';
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });

    applyModeUi();
  }

  function clamp(v) { return Math.max(0, Math.min(255, v)); }
  function lum(c) { return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; }
  function dist(a, b) {
    const dr = a[0] - b[0], dg = a[1] - b[1], db = a[2] - b[2];
    return .30 * dr * dr + .59 * dg * dg + .11 * db * db;
  }
  function hex(c) { return '#' + c.map(v => Math.round(clamp(v)).toString(16).padStart(2, '0')).join('').toUpperCase(); }

  function cropRect(img, w, h) {
    const sa = img.width / img.height, da = w / h;
    let sw = img.width, sh = img.height, sx = 0, sy = 0;
    if (sa > da) { sw = img.height * da; sx = (img.width - sw) / 2; }
    else if (sa < da) { sh = img.width / da; sy = (img.height - sh) / 2; }
    return { sx, sy, sw, sh };
  }

  function avg(points) {
    let r = 0, g = 0, b = 0;
    for (const p of points) { r += p[0]; g += p[1]; b += p[2]; }
    const n = Math.max(1, points.length);
    return [r / n, g / n, b / n];
  }

  function medianCut(points, count) {
    const range = (pts, c) => {
      let lo = 255, hi = 0;
      for (const p of pts) { lo = Math.min(lo, p[c]); hi = Math.max(hi, p[c]); }
      return hi - lo;
    };
    let boxes = [points.slice()];
    while (boxes.length < count) {
      let bi = -1, channel = 0, score = -1;
      boxes.forEach((box, i) => {
        if (box.length < 2) return;
        const rs = [0, 1, 2].map(c => range(box, c));
        const c = rs.indexOf(Math.max(...rs));
        const s = rs[c] * Math.sqrt(box.length);
        if (s > score) { score = s; bi = i; channel = c; }
      });
      if (bi < 0) break;
      const box = boxes.splice(bi, 1)[0].sort((a, b) => a[channel] - b[channel]);
      const mid = Math.floor(box.length / 2);
      boxes.push(box.slice(0, mid), box.slice(mid));
    }
    return boxes.map(avg);
  }

  function refine(sample, palette, loops = 5) {
    let cs = palette.map(c => c.slice());
    for (let k = 0; k < loops; k++) {
      const sums = cs.map(() => [0, 0, 0, 0]);
      for (const p of sample) {
        let bi = 0, bd = Infinity;
        for (let i = 0; i < cs.length; i++) {
          const d = dist(p, cs[i]);
          if (d < bd) { bd = d; bi = i; }
        }
        const s = sums[bi];
        s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; s[3]++;
      }
      cs = cs.map((c, i) => sums[i][3]
        ? [sums[i][0] / sums[i][3], sums[i][1] / sums[i][3], sums[i][2] / sums[i][3]]
        : c);
    }
    return cs;
  }

  function modeSmooth(values, w, h, passes = 1) {
    let cur = new Uint8Array(values);
    for (let pass = 0; pass < passes; pass++) {
      const next = new Uint8Array(cur);
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const counts = new Uint8Array(32);
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) counts[cur[(y + dy) * w + x + dx]]++;
          }
          let best = cur[y * w + x], n = counts[best];
          for (let i = 0; i < counts.length; i++) {
            if (counts[i] > n) { n = counts[i]; best = i; }
          }
          if (n >= 5) next[y * w + x] = best;
        }
      }
      cur = next;
    }
    return cur;
  }

  function mergeTiny(values, w, h, minSize = 5) {
    const out = new Uint8Array(values);
    const regs = components(out, w, h);
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (const reg of regs) {
      if (reg.size >= minSize) continue;
      const neighbors = new Map();
      for (const idx of reg.cells) {
        const x = idx % w, y = (idx / w) | 0;
        for (const [dx, dy] of dirs) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const c = out[ny * w + nx];
          if (c !== reg.color) neighbors.set(c, (neighbors.get(c) || 0) + 1);
        }
      }
      let best = reg.color, score = -1;
      for (const [c, n] of neighbors) if (n > score) { score = n; best = c; }
      if (best !== reg.color) for (const idx of reg.cells) out[idx] = best;
    }
    return out;
  }

  function components(values, w, h) {
    const seen = new Uint8Array(w * h);
    const out = [];
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const start = y * w + x;
      if (seen[start]) continue;
      const color = values[start], q = [start];
      seen[start] = 1;
      let qp = 0, sx = 0, sy = 0, minX = x, maxX = x, minY = y, maxY = y;
      const cells = [];
      while (qp < q.length) {
        const idx = q[qp++], cx = idx % w, cy = (idx / w) | 0;
        cells.push(idx); sx += cx; sy += cy;
        minX = Math.min(minX, cx); maxX = Math.max(maxX, cx); minY = Math.min(minY, cy); maxY = Math.max(maxY, cy);
        for (const [dx, dy] of dirs) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = ny * w + nx;
          if (!seen[ni] && values[ni] === color) { seen[ni] = 1; q.push(ni); }
        }
      }
      out.push({ color, cells, size: cells.length, cx: sx / cells.length, cy: sy / cells.length, minX, maxX, minY, maxY });
    }
    return out;
  }

  function labelPoint(reg, w) {
    const set = new Set(reg.cells);
    let bx = Math.round(reg.cx), by = Math.round(reg.cy), best = -1;
    const sample = Math.max(1, Math.floor(Math.sqrt(reg.size) / 9));
    for (let y = reg.minY; y <= reg.maxY; y += sample) {
      for (let x = reg.minX; x <= reg.maxX; x += sample) {
        if (!set.has(y * w + x)) continue;
        let clear = 0;
        for (let r = 1; r <= 10; r++) {
          if (!set.has(y * w + (x-r)) || !set.has(y * w + (x+r)) ||
              !set.has((y-r) * w + x) || !set.has((y+r) * w + x)) break;
          clear = r;
        }
        const score = clear - Math.hypot(x - reg.cx, y - reg.cy) * .015;
        if (score > best) { best = score; bx = x; by = y; }
      }
    }
    return [bx, by];
  }

  const key = (x, y) => `${x},${y}`;
  function loopsFor(reg, w, h) {
    const set = new Set(reg.cells), map = new Map();
    const has = (x, y) => x >= 0 && y >= 0 && x < w && y < h && set.has(y * w + x);
    const add = (x1, y1, x2, y2) => {
      const k = key(x1, y1);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push([x2, y2]);
    };
    for (const idx of reg.cells) {
      const x = idx % w, y = (idx / w) | 0;
      if (!has(x, y - 1)) add(x, y, x + 1, y);
      if (!has(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!has(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!has(x - 1, y)) add(x, y + 1, x, y);
    }
    const loops = [];
    while (map.size) {
      const start = map.keys().next().value;
      const [sx, sy] = start.split(',').map(Number);
      const loop = [[sx, sy]];
      let cur = start, guard = 0;
      while (guard++ < 200000) {
        const list = map.get(cur);
        if (!list?.length) break;
        const next = list.shift();
        if (!list.length) map.delete(cur);
        loop.push(next);
        cur = key(next[0], next[1]);
        if (cur === start) break;
      }
      if (loop.length > 4) loops.push(loop);
    }
    return loops;
  }

  function simplifyLoop(points) {
    if (points.length <= 10) return points;
    const out = [];
    const step = points.length > 180 ? 3 : 2;
    for (let i = 0; i < points.length; i += step) out.push(points[i]);
    if (out.length && (out[0][0] !== out[out.length - 1][0] || out[0][1] !== out[out.length - 1][1])) out.push(out[0]);
    return out;
  }

  function buildDetailedModel(img, colorCount) {
    const longSide = 720;
    const aspect = img.width / img.height;
    let w, h;
    if (aspect >= 1) { w = longSide; h = Math.max(260, Math.round(longSide / aspect)); }
    else { h = longSide; w = Math.max(260, Math.round(longSide * aspect)); }

    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    const cr = cropRect(img, w, h);
    x.drawImage(img, cr.sx, cr.sy, cr.sw, cr.sh, 0, 0, w, h);
    const raw = x.getImageData(0, 0, w, h).data;

    const sample = [];
    const n = w * h;
    const stride = Math.max(1, Math.floor(n / 52000));
    for (let i = 0; i < n; i += stride) {
      const o = i * 4;
      sample.push([raw[o], raw[o + 1], raw[o + 2]]);
    }
    const palette = refine(sample, medianCut(sample, colorCount), 5).sort((a, b) => lum(a) - lum(b));

    const values = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const o = i * 4, p = [raw[o], raw[o + 1], raw[o + 2]];
      let bi = 0, bd = Infinity;
      for (let j = 0; j < palette.length; j++) {
        const d = dist(p, palette[j]);
        if (d < bd) { bd = d; bi = j; }
      }
      values[i] = bi;
    }

    let clean = modeSmooth(values, w, h, 1);
    clean = mergeTiny(clean, w, h, 5);
    const regions = components(clean, w, h);
    for (const reg of regions) reg.label = labelPoint(reg, w);

    let labeled = 0;
    for (const r of regions) if (r.size >= 8) labeled++;
    return { w, h, raw, palette, regions, labeled };
  }

  function esc(v) { return String(v).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[m])); }

  function buildSvg(model) {
    const { w, h, regions } = model;
    const parts = [
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">`,
      '<rect width="100%" height="100%" fill="#fff"/>',
      '<g fill="none" stroke="#b8b8b8" stroke-width="0.42" stroke-linejoin="round" stroke-linecap="round">'
    ];

    for (const reg of regions) {
      if (reg.size < 3) continue;
      for (const lp0 of loopsFor(reg, w, h)) {
        const lp = simplifyLoop(lp0);
        if (lp.length < 4) continue;
        let d = `M ${lp[0][0]} ${lp[0][1]}`;
        for (let i = 1; i < lp.length; i++) d += ` L ${lp[i][0]} ${lp[i][1]}`;
        d += ' Z';
        parts.push(`<path d="${d}"/>`);
      }
    }
    parts.push('</g>');
    parts.push('<g fill="#ef4b4b" font-family="Arial,sans-serif" font-weight="600" text-anchor="middle" dominant-baseline="central">');

    for (const reg of regions) {
      if (reg.size < 8) continue;
      const bw = reg.maxX - reg.minX + 1, bh = reg.maxY - reg.minY + 1;
      if (Math.min(bw, bh) < 2 && reg.size < 18) continue;
      const [lx, ly] = reg.label;
      const fs = Math.max(2.2, Math.min(4.3, Math.sqrt(reg.size) * .34));
      parts.push(`<text x="${lx + .5}" y="${ly + .5}" font-size="${fs.toFixed(2)}">${esc(reg.color + 1)}</text>`);
    }
    parts.push('</g></svg>');
    return parts.join('');
  }

  function drawSvgPreview(svg, canvas) {
    const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const maxW = 1240;
      const ratio = img.naturalWidth / img.naturalHeight || 1;
      canvas.width = maxW;
      canvas.height = Math.max(500, Math.round(maxW / ratio));
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }

  function renderLegend(palette, legend) {
    if (!legend) return;
    legend.innerHTML = palette.map((c, i) =>
      `<div class="swatch"><div class="swatch-color" style="background:${hex(c)}"></div><small>${i + 1}<br>${hex(c)}</small></div>`
    ).join('');
  }

  setTimeout(wait, 5600);
})();
