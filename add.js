(function () {
  'use strict';

  const smilesInput = document.getElementById('smiles');
  const preview = document.getElementById('preview');
  const drawStatus = document.getElementById('draw-status');
  const btnAdd = document.getElementById('btn-add');
  const form = document.getElementById('form');
  const draftListEl = document.getElementById('draft-list');

  let lastGoodPng = null; // data URL, only set once a SMILES has rendered successfully
  let smilesDrawerReady = typeof window.SmilesDrawer !== 'undefined';

  if (!smilesDrawerReady) {
    drawStatus.textContent = 'Не удалось загрузить библиотеку отрисовки структур (smiles-drawer) — проверьте подключение к интернету и обновите страницу. SMILES можно всё равно вставить и добавить без превью.';
    drawStatus.className = 'draw-status err';
  }

  function renderSmiles(smiles) {
    if (!smiles.trim()) {
      preview.innerHTML = '<span class="ph">превью появится здесь</span>';
      drawStatus.textContent = '';
      drawStatus.className = 'draw-status';
      lastGoodPng = null;
      btnAdd.disabled = true;
      return;
    }
    if (!smilesDrawerReady) {
      // Library failed to load — allow adding without a rendered preview.
      lastGoodPng = null;
      btnAdd.disabled = false;
      return;
    }
    preview.innerHTML = '<canvas id="preview-canvas" width="170" height="170"></canvas>';
    const canvas = document.getElementById('preview-canvas');
    const drawer = new SmilesDrawer.Drawer({ width: 170, height: 170 });
    SmilesDrawer.parse(
      smiles.trim(),
      function (tree) {
        try {
          drawer.draw(tree, canvas, 'light');
          lastGoodPng = canvas.toDataURL('image/png');
          drawStatus.textContent = 'Структура распознана.';
          drawStatus.className = 'draw-status ok';
          btnAdd.disabled = false;
        } catch (err) {
          console.error(err);
          drawStatus.textContent = 'Не удалось отрисовать: ' + err.message;
          drawStatus.className = 'draw-status err';
          lastGoodPng = null;
          btnAdd.disabled = true;
        }
      },
      function (err) {
        console.error(err);
        preview.innerHTML = '<span class="ph">не удалось разобрать SMILES</span>';
        drawStatus.textContent = 'Некорректный SMILES.';
        drawStatus.className = 'draw-status err';
        lastGoodPng = null;
        btnAdd.disabled = true;
      }
    );
  }

  let debounceTimer = null;
  smilesInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => renderSmiles(smilesInput.value), 300);
  });

  function num(id) {
    const v = document.getElementById(id).value;
    return v === '' ? null : Number(v);
  }
  function str(id) {
    const v = document.getElementById(id).value.trim();
    return v === '' ? null : v;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = str('f-name');
    if (!name) return;
    const smiles = smilesInput.value.trim();
    const code = str('f-code');

    const entry = {
      id: 'draft-' + (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2)),
      category: Number(document.getElementById('f-category').value),
      name: name,
      formula: str('f-formula'),
      cas: str('f-cas'),
      loading_umol: num('f-loading'),
      yield_analyt: num('f-yield-analyt'),
      yield_iso: num('f-yield-iso'),
      note: str('f-note'),
      smiles: smiles || null,
      reactions: code ? [{ code: code, id: null }] : [],
      image: lastGoodPng, // data URL for now; becomes a real file once exported+committed
      isDraft: true,
      created_at: new Date().toISOString(),
    };

    Drafts.add(entry);
    form.reset();
    document.getElementById('f-category').value = '4';
    smilesInput.value = '';
    renderSmiles('');
    renderDraftList();
  });

  function downloadBlob(filename, blob) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function exportDraft(d) {
    // 1) the image, as a standalone PNG file to drop into assets/structures/
    if (d.image) {
      const [, b64] = d.image.split(',');
      const bytes = atob(b64);
      const arr = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      downloadBlob(d.id + '.png', new Blob([arr], { type: 'image/png' }));
    }
    // 2) a JSON snippet shaped like one entry of data/molecules.json's
    //    "molecules" array, pointing at that PNG's eventual repo path.
    const snippet = {
      id: d.id,
      category: d.category,
      name: d.name,
      formula: d.formula,
      cas: d.cas,
      loading_umol: d.loading_umol,
      yield_analyt: d.yield_analyt,
      yield_iso: d.yield_iso,
      note: d.note,
      smiles: d.smiles,
      reactions: d.reactions,
      image: d.image ? ('assets/structures/' + d.id + '.png') : null,
    };
    downloadBlob(d.id + '.json', new Blob([JSON.stringify(snippet, null, 2)], { type: 'application/json' }));
  }

  function renderDraftList() {
    const drafts = Drafts.all();
    if (!drafts.length) {
      draftListEl.innerHTML = '<div class="draft-empty">Пока ничего не добавлено.</div>';
      return;
    }
    draftListEl.innerHTML = drafts.map(d => `
      <div class="draft-row" data-id="${d.id}">
        ${d.image ? `<img src="${d.image}" alt="">` : `<img alt="">`}
        <div class="meta">
          <div><b>${d.name}</b></div>
          <div style="color:var(--ink-muted)">${d.formula || ''}</div>
        </div>
        <div class="actions">
          <button class="btn small btn-export" type="button" data-id="${d.id}">Экспорт</button>
          <button class="btn small danger btn-remove" type="button" data-id="${d.id}">Удалить</button>
        </div>
      </div>
    `).join('');
    draftListEl.querySelectorAll('.btn-export').forEach(b => b.addEventListener('click', () => {
      const d = Drafts.all().find(x => x.id === b.dataset.id);
      if (d) exportDraft(d);
    }));
    draftListEl.querySelectorAll('.btn-remove').forEach(b => b.addEventListener('click', () => {
      Drafts.remove(b.dataset.id);
      renderDraftList();
    }));
  }

  renderDraftList();
})();
