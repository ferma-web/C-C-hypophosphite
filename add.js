(function () {
  'use strict';

  const smilesInput = document.getElementById('smiles');
  const preview = document.getElementById('preview');
  const drawStatus = document.getElementById('draw-status');
  const btnAdd = document.getElementById('btn-add');
  const form = document.getElementById('form');
  const draftListEl = document.getElementById('draft-list');
  const lookupInput = document.getElementById('f-lookup-code');
  const btnLookup = document.getElementById('btn-lookup');
  const lookupStatus = document.getElementById('lookup-status');

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
          // SmilesDrawer throws low-level, confusing errors (e.g. "Cannot
          // read properties of null (reading 'determineDimensions')") on
          // some SMILES it can't lay out, even when the SMILES itself is
          // valid. Log the real error for debugging but show a plain
          // message — the raw message isn't useful to someone drawing a
          // structure.
          console.error('SmilesDrawer render failed', err);
          preview.innerHTML = '<span class="ph">не удалось нарисовать структуру</span>';
          drawStatus.textContent = 'Библиотека отрисовки не справилась с этим SMILES (внутренняя ошибка отрисовки, не обязательно ошибка в самой структуре). Можно всё равно добавить структуру без превью, или попробовать переписать SMILES иначе — например явно указав ароматические кольца строчными буквами (c1ccccc1) вместо чередующихся двойных связей.';
          drawStatus.className = 'draw-status err';
          lastGoodPng = null;
          btnAdd.disabled = false;
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

  // Embedded Ketcher (see README.md, "Встроенный Ketcher"): only works if
  // the static Ketcher build has been dropped into ketcher/ in this repo —
  // it needs to be same-origin with the page for contentWindow.ketcher to
  // be reachable at all (cross-origin iframes can't be read from JS).
  // Detect that up front with a plain fetch, rather than letting the
  // iframe silently show a 404 page with no way to draw anything.
  (function setupKetcher() {
    const embedNote = document.getElementById('ketcher-embedded-note');
    const embedBox = document.getElementById('ketcher-embed');
    const fallbackBox = document.getElementById('ketcher-fallback');
    const frame = document.getElementById('ketcher-frame');
    const btnTransfer = document.getElementById('btn-ketcher-transfer');
    const ketcherStatus = document.getElementById('ketcher-status');

    function showFallback() {
      embedNote.style.display = 'none';
      embedBox.style.display = 'none';
      fallbackBox.style.display = '';
    }

    fetch('ketcher/index.html', { method: 'GET' })
      .then((res) => {
        if (!res.ok) { showFallback(); return; }
        embedBox.style.display = '';
      })
      .catch(() => showFallback());

    btnTransfer.addEventListener('click', () => {
      let k = null;
      try {
        k = frame.contentWindow && frame.contentWindow.ketcher;
      } catch (err) {
        console.error('Ketcher: contentWindow access failed (not same-origin?)', err);
      }
      if (!k || typeof k.getSmiles !== 'function') {
        ketcherStatus.textContent = 'Редактор ещё не загрузился (или не смог загрузиться) — подождите пару секунд и попробуйте снова.';
        ketcherStatus.className = 'draw-status err';
        return;
      }
      ketcherStatus.textContent = 'Переносим…';
      ketcherStatus.className = 'draw-status';
      k.getSmiles()
        .then((smiles) => {
          if (!smiles) {
            ketcherStatus.textContent = 'В редакторе пока ничего не нарисовано.';
            ketcherStatus.className = 'draw-status err';
            return;
          }
          smilesInput.value = smiles;
          renderSmiles(smiles);
          ketcherStatus.textContent = 'Структура перенесена в поле SMILES ниже.';
          ketcherStatus.className = 'draw-status ok';
        })
        .catch((err) => {
          console.error('Ketcher getSmiles() failed', err);
          ketcherStatus.textContent = 'Не удалось прочитать структуру из редактора.';
          ketcherStatus.className = 'draw-status err';
        });
    });
  })();

  btnLookup.addEventListener('click', async () => {
    const code = lookupInput.value.trim();
    if (!code) return;

    if (!Drafts.isShared()) {
      lookupStatus.textContent = 'Поиск по шифру работает только с настроенным Supabase (см. config.js) — база с шифрами реакций, как и черновики, хранится там.';
      lookupStatus.className = 'draw-status err';
      return;
    }
    if (typeof Drafts.lookupCode !== 'function') {
      lookupStatus.textContent = 'Эта функция ещё не подключена — обновите drafts.js.';
      lookupStatus.className = 'draw-status err';
      return;
    }

    const prevLabel = btnLookup.textContent;
    btnLookup.disabled = true;
    btnLookup.textContent = 'Ищем…';
    lookupStatus.textContent = '';
    lookupStatus.className = 'draw-status';

    let row;
    try {
      row = await Drafts.lookupCode(code);
    } catch (err) {
      console.error('lookupCode threw', err);
      row = null;
    }
    btnLookup.disabled = false;
    btnLookup.textContent = prevLabel;

    if (!row) {
      lookupStatus.textContent = `Шифр «${code}» не найден в кэше OdanLab (odanlab_cache). Либо опечатка, либо реакция появилась в OdanLab уже после последней загрузки кэша — попросите Claude обновить кэш (odanlab-cache-sql/). Можно заполнить форму вручную.`;
      lookupStatus.className = 'draw-status err';
      return;
    }

    document.getElementById('f-name').value = row.name || '';
    document.getElementById('f-code').value = row.code || code;
    if (row.yield_analyt != null) {
      document.getElementById('f-yield-analyt').value = row.yield_analyt;
    }
    const noteField = document.getElementById('f-note');
    const reagentsNote = row.reagents ? `Реагенты (из OdanLab): ${row.reagents}` : '';
    noteField.value = noteField.value
      ? noteField.value + (reagentsNote ? '\n' + reagentsNote : '')
      : reagentsNote;

    // The cache carries each reaction's structure as a ready-made SVG
    // picture (data: URI), pulled from OdanLab when odanlab-cache-sql/ was
    // generated — no SMILES/redrawing needed. Show it immediately and let
    // it be submitted as-is; the SMILES field stays empty/editable in case
    // someone wants to redraw or refine it instead.
    let structureNote = '';
    if (row.structure_image) {
      preview.innerHTML = `<img src="${row.structure_image}" alt="${row.name || ''}" style="max-width:100%; max-height:100%;">`;
      lastGoodPng = row.structure_image;
      btnAdd.disabled = false;
      drawStatus.textContent = 'Структура подставлена из кэша OdanLab (без перерисовки).';
      drawStatus.className = 'draw-status ok';
    } else {
      structureNote = ' В кэше нет картинки структуры для этого шифра — нарисуйте её выше или вставьте SMILES вручную.';
    }

    const already = row.already_tracked
      ? ' Эта реакция уже есть в основной таблице сайта (data/molecules.json) — вероятно, добавлять её заново не нужно.'
      : '';
    lookupStatus.textContent = `Найдено: «${row.name || '(без названия)'}». Название, выход, реагенты и структура подставлены ниже.${structureNote}${already}`;
    lookupStatus.className = 'draw-status ok';
  });

  function num(id) {
    const v = document.getElementById(id).value;
    return v === '' ? null : Number(v);
  }
  function str(id) {
    const v = document.getElementById(id).value.trim();
    return v === '' ? null : v;
  }

  form.addEventListener('submit', async (e) => {
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

    const prevLabel = btnAdd.textContent;
    btnAdd.disabled = true;
    btnAdd.textContent = 'Добавляем…';
    const ok = await Drafts.add(entry);
    btnAdd.textContent = prevLabel;

    if (!ok) {
      btnAdd.disabled = false;
      alert('Не удалось сохранить структуру. Если это происходит у всех — проверьте config.js и supabase-schema.sql (см. README). Подробности в консоли браузера.');
      return;
    }

    form.reset();
    document.getElementById('f-category').value = '4';
    smilesInput.value = '';
    renderSmiles('');
    await renderDraftList();
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

  async function renderDraftList() {
    const shared = Drafts.isShared();
    const banner = shared
      ? ''
      : `<div class="draw-status err" style="margin-bottom:12px;">Supabase не настроен (см. config.js) — добавленное видно только в этом браузере, а не всем по ссылке.</div>`;

    const drafts = await Drafts.all();
    if (!drafts.length) {
      draftListEl.innerHTML = banner + '<div class="draft-empty">Пока ничего не добавлено.</div>';
      return;
    }
    draftListEl.innerHTML = banner + drafts.map(d => `
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
    draftListEl.querySelectorAll('.btn-export').forEach(b => b.addEventListener('click', async () => {
      const all = await Drafts.all();
      const d = all.find(x => x.id === b.dataset.id);
      if (d) exportDraft(d);
    }));
    draftListEl.querySelectorAll('.btn-remove').forEach(b => b.addEventListener('click', async () => {
      await Drafts.remove(b.dataset.id);
      renderDraftList();
    }));
  }

  renderDraftList();
})();
