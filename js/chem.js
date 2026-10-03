// Отрисовка структур и мелкая химия на стороне браузера.
//  - Chem.renderInto(el, smiles): рисует SMILES/molfile в SVG через RDKit.js (грузится с CDN один раз).
//  - Chem.formulaFromMolfile(molfile): брутто-формула (Hill) из molfile — чтобы не вбивать руками.
window.Chem = (function () {
  'use strict';

  const RDKIT_BASE = 'https://unpkg.com/@rdkit/rdkit/dist/';
  let rdkitPromise = null;
  const svgCache = new Map();

  function loadRDKit() {
    if (rdkitPromise) return rdkitPromise;
    rdkitPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = RDKIT_BASE + 'RDKit_minimal.js';
      s.async = true;
      s.onload = () => {
        if (typeof window.initRDKitModule !== 'function') return reject(new Error('RDKit: initRDKitModule missing'));
        window.initRDKitModule({ locateFile: () => RDKIT_BASE + 'RDKit_minimal.wasm' })
          .then(resolve, reject);
      };
      s.onerror = () => reject(new Error('RDKit.js не загрузился (нет интернета или CDN заблокирован)'));
      document.head.appendChild(s);
    }).catch((e) => { console.warn(e); return null; });
    return rdkitPromise;
  }

  function svgFor(RDKit, input) {
    if (svgCache.has(input)) return svgCache.get(input);
    let svg = null;
    let mol = null;
    try {
      mol = RDKit.get_mol(input);
      if (mol && mol.is_valid()) {
        svg = mol.get_svg_with_highlights(JSON.stringify({
          width: 260, height: 170, bondLineWidth: 1.4, fixedBondLength: 22,
          clearBackground: false, addStereoAnnotation: false, padding: 0.06,
        }));
      }
    } catch (e) {
      console.warn('RDKit render failed for', input, e);
    } finally {
      if (mol) mol.delete();
    }
    svgCache.set(input, svg);
    return svg;
  }

  async function renderInto(el, structure) {
    if (!structure) return false;
    const RDKit = await loadRDKit();
    if (!RDKit) {
      el.innerHTML = `<span class="ph mono" title="${escapeAttr(structure)}">не удалось нарисовать структуру</span>`;
      return false;
    }
    const svg = svgFor(RDKit, structure);
    if (!svg) {
      el.innerHTML = '<span class="ph">структура не распознана</span>';
      return false;
    }
    el.innerHTML = svg;
    return true;
  }

  function escapeAttr(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ---- molfile -> formula ----
  const VALENCES = { B: [3], C: [4], N: [3, 5], O: [2], P: [3, 5], S: [2, 4, 6], F: [1], Cl: [1], Br: [1], I: [1], Si: [4], Se: [2] };
  const CHG_VAL = { 'C:1': 3, 'C:-1': 3, 'N:1': 4, 'N:-1': 2, 'O:1': 3, 'O:-1': 1, 'S:1': 3, 'S:-1': 1, 'P:1': 4, 'B:-1': 4 };

  function parseMolfile(mf) {
    const lines = mf.replace(/\r/g, '').split('\n');
    const atoms = [];
    const bonds = [];
    if (lines.slice(0, 5).some((l) => l.includes('V3000'))) {
      let sect = null;
      let buf = '';
      for (const raw of lines) {
        if (!raw.startsWith('M  V30 ')) continue;
        let body = raw.slice(7);
        if (body.endsWith('-')) { buf += body.slice(0, -1); continue; }
        body = buf + body; buf = '';
        if (body.startsWith('BEGIN ATOM')) { sect = 'a'; continue; }
        if (body.startsWith('BEGIN BOND')) { sect = 'b'; continue; }
        if (body.startsWith('END')) { sect = null; continue; }
        const t = body.trim().split(/\s+/);
        if (sect === 'a') {
          const props = {};
          t.slice(6).forEach((kv) => { const i = kv.indexOf('='); if (i > 0) props[kv.slice(0, i)] = kv.slice(i + 1); });
          atoms.push({ el: t[1], chg: parseInt(props.CHG || '0', 10), hcount: props.HCOUNT ? parseInt(props.HCOUNT, 10) : null });
        } else if (sect === 'b') {
          bonds.push([parseInt(t[2], 10) - 1, parseInt(t[3], 10) - 1, parseInt(t[1], 10)]);
        }
      }
    } else {
      const na = parseInt(lines[3].slice(0, 3), 10);
      const nb = parseInt(lines[3].slice(3, 6), 10);
      const chgMap = { 1: 3, 2: 2, 3: 1, 5: -1, 6: -2, 7: -3 };
      for (let i = 0; i < na; i++) {
        const l = lines[4 + i];
        atoms.push({ el: l.slice(31, 34).trim(), chg: chgMap[parseInt(l.slice(36, 39) || '0', 10)] || 0, hcount: null });
      }
      for (let i = 0; i < nb; i++) {
        const l = lines[4 + na + i];
        bonds.push([parseInt(l.slice(0, 3), 10) - 1, parseInt(l.slice(3, 6), 10) - 1, parseInt(l.slice(6, 9), 10)]);
      }
      for (const l of lines.slice(4 + na + nb)) {
        if (l.startsWith('M  CHG')) {
          const t = l.trim().split(/\s+/);
          const n = parseInt(t[2], 10);
          for (let k = 0; k < n; k++) atoms[parseInt(t[3 + 2 * k], 10) - 1].chg = parseInt(t[4 + 2 * k], 10);
        }
      }
    }
    return { atoms, bonds };
  }

  function formulaFromMolfile(mf) {
    try {
      const { atoms, bonds } = parseMolfile(mf);
      if (!atoms.length) return null;
      const bsum = atoms.map(() => 0);
      for (const [a, b, o] of bonds) {
        const v = o === 4 ? 1.5 : (o > 3 ? 1 : o);
        bsum[a] += v; bsum[b] += v;
      }
      const count = {};
      atoms.forEach((a, i) => {
        if (a.el === 'R#' || a.el === '*' || a.el === 'A' || a.el === 'Q') return;
        count[a.el] = (count[a.el] || 0) + 1;
        let h = 0;
        const s = Math.round(bsum[i]);
        if (a.hcount != null && a.hcount > 0) h = a.hcount - 1;
        else if (a.chg) { const v = CHG_VAL[a.el + ':' + a.chg]; h = v != null ? Math.max(0, v - s) : 0; }
        else if (VALENCES[a.el]) { const v = VALENCES[a.el].find((x) => x >= s); h = v != null ? v - s : 0; }
        if (h) count.H = (count.H || 0) + h;
      });
      const hasC = !!count.C;
      const order = hasC ? ['C', 'H'] : [];
      const rest = Object.keys(count).filter((k) => !order.includes(k)).sort();
      return order.concat(rest).filter((k) => count[k]).map((k) => k + (count[k] > 1 ? count[k] : '')).join('');
    } catch (e) {
      console.warn('formulaFromMolfile failed', e);
      return null;
    }
  }

  return { loadRDKit, renderInto, formulaFromMolfile };
})();
