(function () {
  'use strict';

  const GROUP_ID = '25214cf7-ea57-4a35-bfd1-167ad307f306';
  const PROJECT_ID = '4e03047f-ba01-4986-8f9b-c077ed367195';
  const ODANLAB_URL = (id) => `https://lab.odanchem.org/app/group/${GROUP_ID}/project/${PROJECT_ID}/reaction/${id}`;

  const CATS = [
    { id: 1, title: 'Есть препаративный выход', desc: 'вещество выделено, масса/чистота подтверждены', color: 'var(--iso)' },
    { id: 2, title: 'Ожидает выделения', desc: 'аналитический выход есть, выделение запланировано', color: 'var(--planned)' },
    { id: 4, title: 'Ожидает ЯМР / только запланировано', desc: 'реакция поставлена, данных по выходу пока нет', color: 'var(--ink-faint)' },
    { id: 3, title: 'Субстраты с низким аналитическим выходом', desc: 'выход по ЯМР низкий — реакция требует пересмотра условий', color: 'var(--danger)' },
  ];

  const $ = (id) => document.getElementById(id);
  const mainEl = $('main');
  const searchInput = $('search');

  let docs = [];          // все строки, включая удалённые
  let source = 'live';
  let showDeleted = false;
  const NO_CLASS = 'Без класса';
  let classView = {};             // { [category]: true } — раздел показан столбцами по классам
  try { classView = JSON.parse(lsGet0('cs.classView') || '{}') || {}; } catch (e) { classView = {}; }
  function lsGet0(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  // ---------- helpers ----------
  function esc(s) {
    return (s ?? '').toString().replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmtYield(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Math.round(Number(v) * 10) / 10;
    return (Number.isInteger(n) ? n : n.toFixed(1)) + '%';
  }
  function fmtDate(s) {
    if (!s) return '';
    const d = new Date(s);
    return d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }
  function toast(msg, kind) {
    const t = $('toast');
    t.textContent = msg;
    t.className = 'show' + (kind ? ' ' + kind : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.className = ''; }, 3500);
  }
  function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } }

  // ---------- cards ----------
  function renderCard(d) {
    const reactions = Array.isArray(d.reactions) ? d.reactions : [];
    const codesShown = reactions.slice(0, 6);
    const extra = reactions.length - codesShown.length;
    const isoY = fmtYield(d.yield_iso);
    const anY = fmtYield(d.yield_analyt);
    let pills = '';
    if (isoY) pills += `<span class="pill iso">выделено ${isoY}</span>`;
    if (anY) pills += `<span class="pill analyt">ЯМР ${anY}</span>`;
    if (!isoY && !anY) pills = `<span class="pill none">нет данных</span>`;

    const primary = reactions.find((r) => r.id);
    const structure = d.molfile || d.smiles;
    let img;
    // структуры рисуем единообразно по SMILES/molfile; готовая картинка — только если структуры нет
    if (structure) img = `<div class="rd" data-structure="${esc(structure)}"><span class="ph">рисую…</span></div>`;
    else if (d.image) img = `<img src="${esc(d.image)}" alt="${esc(d.name)}" loading="lazy">`;
    else img = `<span class="ph">нет структуры</span>`;

    const meta = [];
    if (d.formula) meta.push(esc(d.formula));
    if (d.loading_umol) meta.push('загрузка: ' + esc(d.loading_umol) + ' мкмоль');

    const body = `
      ${d.source === 'manual' ? '<span class="draft-badge">добавлено вручную</span>' : ''}
      <div class="imgbox">${img}</div>
      <div class="name">${esc(d.name)}</div>
      ${d.compound_class ? `<span class="class-chip">${esc(d.compound_class)}</span>` : ''}
      <div class="formula mono">${meta.join(' · ')}</div>
      <div class="yields">${pills}</div>
      <div class="mini-yield mono">${anY ? `<span class="a">${anY}</span>` : ''}${isoY ? `<span class="i">${anY ? ' ' : ''}(${isoY})</span>` : ''}${!anY && !isoY ? '<span class="n">—</span>' : ''}</div>`;

    const wrap = primary
      ? `<a class="card-link" draggable="false" href="${esc(ODANLAB_URL(primary.id))}" target="_blank" rel="noopener" title="Открыть реакцию ${esc(primary.code)} в OdanLab">${body}</a>`
      : `<div class="card-link">${body}</div>`;

    const search = [d.name, d.formula, d.cas, d.note, d.compound_class, reactions.map((r) => r.code).join(' ')].join(' ').toLowerCase();

    return `
      <div class="card${d.note ? ' is-note' : ''}${d.source === 'manual' ? ' is-draft' : ''}" data-id="${esc(d.id)}" data-search="${esc(search)}"${Store.isReadOnly() ? '' : ' data-drag="1"'} title="${esc([d.name, reactions.map((r) => r.code).join(', '), [isoY && 'выделено ' + isoY, anY && 'ЯМР ' + anY].filter(Boolean).join(', ')].filter(Boolean).join('\n'))}">
        ${Store.isReadOnly() ? '' : `<button type="button" class="edit-btn" data-edit="${esc(d.id)}" title="Редактировать карточку" aria-label="Редактировать «${esc(d.name)}»">✎</button>`}
        ${wrap}
        ${Number(d.category) === 1 ? nmrBadges(d) : ''}
        <div class="codes">
          ${codesShown.map((r) => r.id
            ? `<a class="code-chip" draggable="false" href="${esc(ODANLAB_URL(r.id))}" target="_blank" rel="noopener" title="Открыть в OdanLab">${esc(r.code)}</a>`
            : `<span class="code-chip">${esc(r.code)}</span>`).join('')}
          ${extra > 0 ? `<span class="code-chip">+${extra}</span>` : ''}
        </div>
        ${d.note ? `<div class="note-line">${esc(d.note)}</div>` : ''}
      </div>`;
  }

  // Крупные «плакатные» галочка и крестик (залитые фигуры, а не символы шрифта)
  const ICON_OK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.6 12.9 6 9.5l4 4L18 5.5l3.4 3.4L10 20.3z" fill="currentColor"/></svg>';
  const ICON_NO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.3 7.7 7.7 4.3 12 8.6l4.3-4.3 3.4 3.4-4.3 4.3 4.3 4.3-3.4 3.4-4.3-4.3-4.3 4.3-3.4-3.4 4.3-4.3z" fill="currentColor"/></svg>';

  // ¹H / ¹³C: сняты ли спектры (только у веществ с препаративным выходом). Клик — переключить.
  function nmrBadges(d) {
    const ro = Store.isReadOnly();
    const b = (key, label, on) => `<button type="button" class="nmr-badge ${on ? 'ok' : 'no'}" data-nmr="${key}" data-id="${esc(d.id)}"
      ${ro ? 'disabled' : ''} aria-pressed="${on}" title="${label.replace(/<[^>]+>/g, '')}: ${on ? 'спектр снят' : 'спектр не снят'}${ro ? '' : ' — нажмите, чтобы изменить'}"><span class="nuc">${label}</span><span class="mark">${on ? ICON_OK : ICON_NO}</span></button>`;
    return `<div class="nmr-row">${b('nmr_1h', '<sup>1</sup>H', !!d.nmr_1h)}${b('nmr_13c', '<sup>13</sup>C', !!d.nmr_13c)}</div>`;
  }

  function render() {
    const active = docs.filter((d) => !d.deleted);
    const deleted = docs.filter((d) => d.deleted);
    const byCat = {};
    for (const d of active) (byCat[d.category] ||= []).push(d);
    for (const k in byCat) byCat[k].sort((a, b) => (b.yield_iso ?? b.yield_analyt ?? -1) - (a.yield_iso ?? a.yield_analyt ?? -1));

    let html = '';
    if (source === 'archive') {
      html += `<div class="banner warn">База недоступна — показана архивная копия из GitHub, редактирование временно отключено.</div>`;
    }
    for (const cat of CATS) {
      const items = byCat[cat.id] || [];
      const byClass = !!classView[cat.id];
      let body;
      if (!items.length) body = `<div class="empty-cat">Категория пока пуста${Store.isReadOnly() ? '' : ' — перетащите сюда карточку'}.</div>`;
      else if (byClass) body = renderClassColumns(items);
      else body = `<div class="grid">${items.map(renderCard).join('')}</div>`;
      html += `
        <section class="category" data-cat="${cat.id}">
          <div class="cat-head" style="--cat-color:${cat.color}">
            <span class="cat-dot"></span>
            <h2>${cat.title}</h2>
            <span class="count mono">${items.length}</span>
            <span class="cat-desc">${cat.desc}</span>
            <button type="button" class="view-btn${byClass ? ' on' : ''}" data-classview="${cat.id}" aria-pressed="${byClass}"
              title="${byClass ? 'Показать сеткой' : 'Разложить по классам веществ в столбцы'}">${byClass ? '▦ Сеткой' : '▥ По классам'}</button>
          </div>
          ${body}
        </section>`;
    }
    if (deleted.length && !Store.isReadOnly()) {
      html += `
        <section class="deleted">
          <button type="button" class="linkish" id="toggle-deleted">${showDeleted ? '▾' : '▸'} Удалённые карточки (${deleted.length})</button>
          ${showDeleted ? `<div class="deleted-list">${deleted.map((d) => `
            <div class="deleted-row">
              <span class="name">${esc(d.name)}</span>
              <span class="hint">${esc((d.reactions || []).map((r) => r.code).join(', '))} · удалена ${esc(fmtDate(d.updated_at))}</span>
              <button type="button" class="btn small" data-restore="${esc(d.id)}">Восстановить</button>
            </div>`).join('')}</div>` : ''}
        </section>`;
    }
    mainEl.innerHTML = html;
    syncAllBtn();
    applySearch();
    updateStats();
    drawStructures();
  }

  // Класс всегда с заглавной буквы; «нитростиролы» и «Нитростиролы» — один и тот же класс
  function normClass(v) {
    const t = String(v || '').trim().replace(/\s+/g, ' ');
    if (!t) return null;
    const cap = t.charAt(0).toLocaleUpperCase('ru') + t.slice(1);
    const existing = allClasses().find((c) => c.toLocaleLowerCase('ru') === cap.toLocaleLowerCase('ru'));
    return existing || cap;
  }

  function allClasses() {
    const set = new Set();
    docs.forEach((d) => { if (!d.deleted && d.compound_class) set.add(d.compound_class); });
    return [...set].sort((a, b) => a.localeCompare(b, 'ru'));
  }

  function renderClassColumns(items) {
    const groups = new Map();
    for (const d of items) {
      const k = d.compound_class || '';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(d);
    }
    const keys = [...groups.keys()].filter(Boolean).sort((a, b) => a.localeCompare(b, 'ru'));
    if (groups.has('')) keys.push('');
    // классы, которых нет в этом разделе, не показываем; их пустые столбцы появляются
    // только во время перетаскивания — чтобы карточку можно было бросить в любой класс
    const extra = allClasses().filter((c) => !groups.has(c));
    const col = (k, list) => `
      <div class="class-col${k ? '' : ' no-class'}${list.length ? '' : ' ghost-col'}" data-class="${esc(k)}">
        <div class="class-col-head"><span>${esc(k || NO_CLASS)}</span><span class="count mono">${list.length}</span></div>
        <div class="class-col-body">${list.map(renderCard).join('') || '<div class="col-empty">перетащите сюда</div>'}</div>
      </div>`;
    return `<div class="class-cols">${keys.map((k) => col(k, groups.get(k))).join('')}${extra.map((k) => col(k, [])).join('')}</div>`;
  }

  function setClassView(cat, on) {
    if (on) classView[cat] = true; else delete classView[cat];
    lsSet('cs.classView', JSON.stringify(classView));
  }

  function drawStructures() {
    const els = mainEl.querySelectorAll('.rd[data-structure]');
    els.forEach((el) => Chem.renderInto(el, el.dataset.structure));
  }

  function applySearch() {
    const q = searchInput.value.trim().toLowerCase();
    document.querySelectorAll('.card').forEach((c) => c.classList.toggle('hidden-by-search', !!q && !c.dataset.search.includes(q)));
    document.querySelectorAll('section.category').forEach((sec) => {
      const visible = sec.querySelectorAll('.card:not(.hidden-by-search)').length;
      sec.style.display = q && !visible ? 'none' : '';
    });
  }
  searchInput.addEventListener('input', applySearch);

  function updateStats() {
    const active = docs.filter((d) => !d.deleted);
    const codes = new Set();
    active.forEach((d) => (d.reactions || []).forEach((r) => codes.add(r.code)));
    $('stats-row').innerHTML = `
      <div class="stat"><span class="n mono">${active.length}</span><span class="l">веществ</span></div>
      <div class="stat"><span class="n mono">${codes.size}</span><span class="l">реакций</span></div>`;
    const last = active.reduce((m, d) => (d.updated_at && d.updated_at > m ? d.updated_at : m), '');
    $('sync-note').textContent = source === 'live' ? 'онлайн · изменено ' + fmtDate(last) : 'архив';
  }

  mainEl.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('[data-edit]');
    if (editBtn) {
      e.preventDefault();
      const d = docs.find((x) => x.id === editBtn.dataset.edit);
      if (d) Editor.open(d);
      return;
    }
    if (e.target.id === 'toggle-deleted') { showDeleted = !showDeleted; render(); return; }
    const nmrBtn = e.target.closest('[data-nmr]');
    if (nmrBtn) {
      e.preventDefault();
      e.stopPropagation();
      const d = docs.find((x) => x.id === nmrBtn.dataset.id);
      if (!d || Store.isReadOnly()) return;
      const key = nmrBtn.dataset.nmr;
      const val = !d[key];
      d[key] = val;
      nmrBtn.classList.toggle('ok', val); nmrBtn.classList.toggle('no', !val);
      nmrBtn.setAttribute('aria-pressed', String(val));
      nmrBtn.querySelector('.mark').innerHTML = val ? ICON_OK : ICON_NO;
      try {
        const res = await Store.update(d.id, { [key]: val, updated_by: 'сайт' }, null);
        if (res.row) Object.assign(d, res.row);
      } catch (err) {
        d[key] = !val;
        render();
        toast('Не удалось сохранить: ' + err.message, 'err');
      }
      return;
    }
    const viewBtn = e.target.closest('[data-classview]');
    if (viewBtn) { const c = viewBtn.dataset.classview; setClassView(c, !classView[c]); render(); return; }
    const restore = e.target.closest('[data-restore]');
    if (restore) {
      restore.disabled = true;
      try {
        const res = await Store.update(restore.dataset.restore, { deleted: false, updated_by: 'сайт' });
        if (res.row) { upsertLocal(res.row); toast('Карточка восстановлена'); }
      } catch (err) { toast('Не удалось восстановить: ' + err.message, 'err'); restore.disabled = false; }
    }
  });

  // ---------- перетаскивание карточек между разделами и классами ----------
  // Своя реализация на pointer-событиях (а не HTML5 drag&drop): тащить можно за любую часть карточки,
  // текст не выделяется, на телефоне — после долгого нажатия.
  const drag = { id: null, card: null, ghost: null, active: false, startX: 0, startY: 0, timer: null, pointerId: null, target: null, dx: 0, dy: 0 };
  function dropTargetOf(el) {
    if (!el || !el.closest) return null;
    return el.closest('.class-col') || el.closest('section.category');
  }
  function clearDropMarks() { mainEl.querySelectorAll('.drop-target').forEach((x) => x.classList.remove('drop-target')); }

  function startDrag(e) {
    drag.active = true;
    const r = drag.card.getBoundingClientRect();
    drag.dx = drag.startX - r.left; drag.dy = drag.startY - r.top;
    const g = drag.card.cloneNode(true);
    g.classList.add('drag-ghost');
    g.removeAttribute('data-id');
    g.style.width = r.width + 'px';
    g.style.height = r.height + 'px';
    document.body.appendChild(g);
    drag.ghost = g;
    drag.card.classList.add('dragging');
    document.body.classList.add('is-dragging');
    moveGhost(e.clientX, e.clientY);
  }
  function moveGhost(x, y) {
    if (!drag.ghost) return;
    drag.ghost.style.transform = `translate(${x - drag.dx}px, ${y - drag.dy}px) rotate(1.5deg)`;
    const el = document.elementFromPoint(x, y);
    const t = dropTargetOf(el);
    if (t !== drag.target) { clearDropMarks(); if (t) t.classList.add('drop-target'); drag.target = t; }
    // автопрокрутка у краёв окна
    const edge = 70;
    if (y < edge) window.scrollBy(0, -Math.ceil((edge - y) / 4));
    else if (y > window.innerHeight - edge) window.scrollBy(0, Math.ceil((y - (window.innerHeight - edge)) / 4));
  }
  function endDrag(cancel) {
    clearTimeout(drag.timer);
    const wasActive = drag.active;
    const target = drag.target;
    const id = drag.id;
    if (drag.ghost) drag.ghost.remove();
    if (drag.card) drag.card.classList.remove('dragging', 'press');
    document.body.classList.remove('is-dragging');
    clearDropMarks();
    Object.assign(drag, { id: null, card: null, ghost: null, active: false, timer: null, pointerId: null, target: null });
    if (wasActive) {
      // клик после перетаскивания не должен открывать ссылку на OdanLab
      const block = (ev) => { ev.preventDefault(); ev.stopPropagation(); };
      window.addEventListener('click', block, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', block, { capture: true }), 50);
      if (!cancel && target) dropCard(id, target);
    }
  }

  mainEl.addEventListener('pointerdown', (e) => {
    if (Store.isReadOnly() || e.button !== 0) return;
    if (e.target.closest('.edit-btn, button, input')) return;
    const card = e.target.closest('.card[data-id]');
    if (!card) return;
    Object.assign(drag, { id: card.dataset.id, card, startX: e.clientX, startY: e.clientY, pointerId: e.pointerId, active: false });
    if (e.pointerType === 'mouse') {
      e.preventDefault(); // не выделять текст и не тащить ссылку браузером
    } else {
      // на сенсорном экране — долгое нажатие, чтобы обычная прокрутка не превращалась в перетаскивание
      drag.timer = setTimeout(() => { if (drag.card === card) { card.classList.add('press'); startDrag(e); } }, 350);
    }
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag.card || e.pointerId !== drag.pointerId) return;
    if (!drag.active) {
      const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if (e.pointerType !== 'mouse') { if (moved > 10) { clearTimeout(drag.timer); Object.assign(drag, { id: null, card: null }); } return; }
      if (moved < 6) return;
      startDrag(e);
    }
    moveGhost(e.clientX, e.clientY);
  });
  window.addEventListener('touchmove', (e) => { if (drag.active) e.preventDefault(); }, { passive: false });
  window.addEventListener('pointerup', (e) => { if (drag.card && e.pointerId === drag.pointerId) endDrag(false); });
  window.addEventListener('pointercancel', (e) => { if (drag.card && e.pointerId === drag.pointerId) endDrag(true); });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && drag.active) endDrag(true); });
  mainEl.addEventListener('dragstart', (e) => e.preventDefault()); // отключаем встроенное перетаскивание ссылок/картинок

  async function dropCard(id, t) {
    const d = docs.find((x) => x.id === id);
    if (!d) return;
    const sec = t.closest('section.category');
    if (!sec) return;
    const patch = {};
    const cat = Number(sec.dataset.cat);
    if (cat !== d.category) patch.category = cat;
    if (t.classList.contains('class-col')) {
      const cls = t.dataset.class || null;
      if (cls !== (d.compound_class || null)) patch.compound_class = cls;
    }
    if (!Object.keys(patch).length) return;
    const before = Object.assign({}, d);
    Object.assign(d, patch);
    render();
    try {
      const res = await Store.update(id, Object.assign({ updated_by: 'сайт' }, patch), null);
      if (res.row) upsertLocal(res.row);
      const what = [];
      if ('category' in patch) what.push('раздел «' + CATS.find((c) => c.id === patch.category).title + '»');
      if ('compound_class' in patch) what.push('класс «' + (patch.compound_class || NO_CLASS) + '»');
      toast('Перенесено: ' + what.join(', '));
    } catch (err) {
      Object.assign(d, before);
      render();
      toast('Не удалось перенести: ' + err.message, 'err');
    }
  }

  function upsertLocal(row) {
    const i = docs.findIndex((d) => d.id === row.id);
    if (i >= 0) docs[i] = row; else docs.push(row);
    render();
  }

  // ---------- editor ----------
  const Editor = (function () {
    const dlg = $('editor');
    const form = $('ed-form');
    const frame = $('ketcher-frame');
    const f = {
      code: $('f-code'), name: $('f-name'), category: $('f-category'), formula: $('f-formula'), cas: $('f-cas'),
      yieldIso: $('f-yield-iso'), yieldAnalyt: $('f-yield-analyt'), loading: $('f-loading'), mass: $('f-mass'),
      extraCodes: $('f-extra-codes'), note: $('f-note'), smiles: $('f-smiles'), cls: $('f-class'),
      find: $('f-find'),
    };
    const EMPTY_MOL = '\n  Ketcher\n\n  0  0  0  0  0  0  0  0  0  0999 V2000\nM  END\n';

    let current = null;          // редактируемая строка (null = новая)
    let lookedUp = null;         // строка справочника OdanLab, подтянутая по шифру
    let baselineSmiles = '';     // что было в редакторе после загрузки
    let lastAutoFormula = '';
    let lastAutoName = '';
    let lastAutoCas = '';
    let lastEnrichedSmiles = '';
    let pcName = '', pcCas = '';   // что подставлено именно из PubChem
    let enrichToken = 0;
    let ketcherState = 'idle';   // idle | loading | ready | missing
    let ketcherPromise = null;
    let dirty = false;
    let loadToken = 0;
    let smilesTyped = false;     // пользователь вписал SMILES руками и не перенёс в редактор

    function who() { return 'сайт'; }

    function setStatus(id, text, kind) {
      const el = $(id);
      el.textContent = text;
      el.className = 'hint' + (kind ? ' ' + kind : '');
    }

    // --- Ketcher ---
    function ensureKetcher() {
      if (ketcherPromise) return ketcherPromise;
      ketcherState = 'loading';
      ketcherPromise = fetch('ketcher/index.html', { method: 'HEAD', cache: 'no-store' })
        .then((r) => {
          if (!r.ok) throw new Error('ketcher/ not deployed');
          frame.src = 'ketcher/index.html';
          return new Promise((resolve, reject) => {
            const started = Date.now();
            (function poll() {
              let k = null;
              try { k = frame.contentWindow && frame.contentWindow.ketcher; } catch (e) { /* not ready */ }
              if (k && typeof k.getSmiles === 'function') return resolve(k);
              if (Date.now() - started > 60000) return reject(new Error('Ketcher не загрузился за 60 с'));
              setTimeout(poll, 250);
            })();
          });
        })
        .then((k) => {
          ketcherState = 'ready';
          try {
            k.editor.subscribe('change', debounce(onKetcherChange, 400));
          } catch (e) { console.warn('ketcher change subscription failed', e); }
          return k;
        })
        .catch((err) => {
          console.warn(err);
          ketcherState = 'missing';
          $('ketcher-wrap').hidden = true;
          $('smiles-row').hidden = false;
          setStatus('ketcher-status', '');
          return null;
        });
      return ketcherPromise;
    }

    function debounce(fn, ms) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; }

    let suppressChange = false;
    async function onKetcherChange() {
      if (suppressChange || !dlg.open) return;
      const k = await ensureKetcher();
      if (!k) return;
      try {
        const smi = await k.getSmiles();
        if (smi !== baselineSmiles) dirty = true;
        f.smiles.value = smi || '';
        smilesTyped = false;
        renderMiniPreview(smi);
        if (smi) {
          const mf = await k.getMolfile();
          const formula = Chem.formulaFromMolfile(mf);
          if (formula && (!f.formula.value.trim() || f.formula.value.trim() === lastAutoFormula)) {
            f.formula.value = formula;
            lastAutoFormula = formula;
          }
        }
        enrichFromStructure(smi);
      } catch (e) { console.warn('ketcher read failed', e); }
    }

    // Нарисовали/изменили молекулу → ищем её в PubChem и подставляем систематическое название и CAS
    // (только в пустые поля или в те, что мы сами подставили раньше — ручной ввод не трогаем).
    async function enrichFromStructure(smi) {
      if (!smi) { setStatus('pubchem-status', ''); lastEnrichedSmiles = ''; return; }
      if (smi === lastEnrichedSmiles) return;
      lastEnrichedSmiles = smi;
      const token = ++enrichToken;
      setStatus('pubchem-status', 'Ищу вещество в PubChem…');
      let res = null;
      try { res = await Lookup.bySmiles(smi); } catch (e) {
        if (token === enrichToken) setStatus('pubchem-status', 'PubChem не ответил — название и CAS можно вписать вручную.', 'warn');
        return;
      }
      if (token !== enrichToken) return;
      if (!res) {
        // убираем то, что сами подставили из PubChem для прошлой структуры — оно уже не про эту молекулу
        if (lastAutoName && lastAutoName === pcName && f.name.value.trim() === lastAutoName) { f.name.value = ''; lastAutoName = ''; }
        if (lastAutoCas && lastAutoCas === pcCas && f.cas.value.trim() === lastAutoCas) { f.cas.value = ''; lastAutoCas = ''; }
        pcName = ''; pcCas = '';
        setStatus('pubchem-status', 'Такого вещества в PubChem нет — впишите название (и CAS, если есть) вручную.', 'warn');
        return;
      }
      applyAuto(res);
      const parts = [`PubChem CID ${res.cid}`];
      parts.push(res.cas ? `CAS ${res.cas}` : 'CAS в PubChem не указан');
      setStatus('pubchem-status', `Найдено: ${res.iupac || res.title || '—'} (${parts.join(', ')}).`, 'ok');
    }

    function applyAuto(res) {
      const name = res.iupac || res.title;
      if (name && (!f.name.value.trim() || f.name.value.trim() === lastAutoName)) { f.name.value = name; lastAutoName = name; pcName = name; }
      if (res.cas && (!f.cas.value.trim() || f.cas.value.trim() === lastAutoCas)) { f.cas.value = res.cas; lastAutoCas = res.cas; pcCas = res.cas; }
      if (res.formula && (!f.formula.value.trim() || f.formula.value.trim() === lastAutoFormula)) { f.formula.value = res.formula; lastAutoFormula = res.formula; }
    }

    // asBaseline = true: это сохранённая структура карточки (от неё считаем «изменено/не изменено»)
    async function loadStructure(structure, asBaseline) {
      const token = ++loadToken;
      if (structure && !structure.includes('\n')) f.smiles.value = structure;
      smilesTyped = false;
      renderMiniPreview(structure);
      const k = await ensureKetcher();
      if (!k || token !== loadToken) return;
      setStatus('ketcher-status', 'рисуйте или правьте молекулу');
      suppressChange = true;
      try {
        await k.setMolecule(structure || EMPTY_MOL);
        if (asBaseline) baselineSmiles = structure ? await k.getSmiles() : '';
        else if (structure) f.smiles.value = await k.getSmiles();
      } catch (e) {
        console.warn('setMolecule failed', e);
        setStatus('ketcher-status', 'не удалось загрузить структуру в редактор', 'err');
      } finally {
        setTimeout(() => { suppressChange = false; }, 500);
      }
    }

    function renderMiniPreview(structure) {
      const el = $('smiles-preview');
      if (!structure) { el.innerHTML = ''; return; }
      Chem.renderInto(el, structure);
    }

    f.smiles.addEventListener('input', () => { smilesTyped = true; dirty = true; });
    f.smiles.addEventListener('input', debounce(() => {
      const smi = f.smiles.value.trim();
      renderMiniPreview(smi);
      if (ketcherState !== 'ready') enrichFromStructure(smi);
    }, 600));

    // --- fill/read form ---
    function num(el) { const v = el.value.trim(); return v === '' ? null : Number(v.replace(',', '.')); }
    function str(el) { const v = el.value.trim(); return v === '' ? null : v; }
    function setNum(el, v) { el.value = v === null || v === undefined ? '' : String(Math.round(Number(v) * 100) / 100); }

    function fill(d) {
      const r = (d && d.reactions) || [];
      f.code.value = r[0] ? r[0].code : '';
      f.extraCodes.value = r.slice(1).map((x) => x.code).join(', ');
      f.name.value = d ? d.name || '' : '';
      f.category.value = String(d ? d.category || 4 : 4);
      f.formula.value = d ? d.formula || '' : '';
      f.cas.value = d ? d.cas || '' : '';
      setNum(f.yieldIso, d && d.yield_iso);
      setNum(f.yieldAnalyt, d && d.yield_analyt);
      setNum(f.loading, d && d.loading_umol);
      f.note.value = d ? d.note || '' : '';
      f.cls.value = d ? d.compound_class || '' : '';
      $('classes-list').innerHTML = allClasses().map((c) => `<option value="${esc(c)}"></option>`).join('');
      f.smiles.value = d ? d.smiles || '' : '';
      f.find.value = '';
      lastAutoFormula = '';
      lastAutoName = '';
      lastAutoCas = '';
      pcName = ''; pcCas = '';
      lastEnrichedSmiles = d ? d.smiles || '' : '';
      enrichToken++;
      setStatus('pubchem-status', '');
    }

    async function buildReactions() {
      const map = await Store.loadReactions();
      const prev = new Map(((current && current.reactions) || []).map((r) => [Store.normCode(r.code), r.id]));
      const codes = [f.code.value, ...f.extraCodes.value.split(/[,;\s]+/)].map(Store.normCode).filter(Boolean);
      const seen = new Set();
      const out = [];
      for (const c of codes) {
        if (seen.has(c)) continue;
        seen.add(c);
        const hit = map.get(c);
        out.push({ code: c, id: (hit && hit.reaction_id) || prev.get(c) || null });
      }
      return out;
    }

    async function open(d, opts) {
      current = d || null;
      lookedUp = null;
      dirty = false;
      baselineSmiles = '';
      fill(d);
      $('ed-title').textContent = d ? 'Редактирование карточки' : 'Новая карточка';
      $('btn-delete').hidden = !d;
      $('ed-error').hidden = true;
      $('ed-meta').textContent = d && d.updated_at ? `изменено ${fmtDate(d.updated_at)}` : '';
      setStatus('lookup-status', d ? 'Поиск по шифру, CAS или названию перезапишет поля карточки.' : 'Шифр подтянет данные реакции из OdanLab, CAS или название — структуру и названия из PubChem. Или просто нарисуйте молекулу ниже: название и CAS подставятся сами.');
      setStatus('ketcher-status', ketcherState === 'ready' ? 'рисуйте или правьте молекулу' : 'редактор загружается…');
      if (!dlg.open) dlg.showModal();
      history.replaceState(null, '', d ? '#edit=' + encodeURIComponent(d.id) : '#new');
      fillCodeList();
      loadStructure(d ? (d.molfile || d.smiles || '') : '', true);
      if (opts && opts.code) { f.find.value = opts.code; lookup(); }
      else if (!d) f.find.focus();
    }

    async function fillCodeList() {
      const map = await Store.loadReactions();
      const dl = $('codes-list');
      if (dl.options.length) return;
      const codes = [...map.values()].sort((a, b) => a.code.localeCompare(b.code, 'en', { numeric: true }));
      dl.innerHTML = codes.map((r) => `<option value="${esc(r.code)}">${esc(r.name || '')}</option>`).join('');
    }

    async function lookup() {
      const q = f.find.value.trim();
      if (!q) return;
      const btn = $('btn-lookup');
      btn.disabled = true;
      try {
        const row = await Store.lookupCode(q);
        if (row) await fillFromOdanLab(row);
        else await fillFromPubChem(q);
      } finally { btn.disabled = false; }
    }

    async function fillFromOdanLab(row) {
      lookedUp = row;
      dirty = true;
      f.code.value = row.code;
      if (row.name) { f.name.value = row.name; lastAutoName = row.name; }
      if (row.formula) { f.formula.value = row.formula; lastAutoFormula = row.formula; }
      if (row.cas) { f.cas.value = row.cas; lastAutoCas = row.cas; }
      setNum(f.yieldIso, row.yield_iso);
      setNum(f.yieldAnalyt, row.yield_analyt);
      if (row.loading_umol) setNum(f.loading, row.loading_umol);
      if (!current) f.category.value = row.yield_iso != null ? '1' : (row.yield_analyt != null ? '2' : '4');
      if (row.smiles) { loadStructure(row.smiles); lastEnrichedSmiles = ''; enrichFromStructure(row.smiles); }

      const dup = docs.find((d) => !d.deleted && d !== current && (d.reactions || []).some((r) => Store.normCode(r.code) === row.code));
      let msg = `Подставлено из OdanLab (${row.code}): ${row.name || '(без названия)'}.`;
      if (row.reagents) msg += ` Реагенты: ${row.reagents}.`;
      setStatus('lookup-status', msg, 'ok');
      if (dup) showDup(dup, `карточка с шифром ${row.code} уже есть`);
    }

    async function fillFromPubChem(q) {
      const cas = Lookup.isCAS(q);
      setStatus('lookup-status', `Ищу «${q}» в PubChem…`);
      let res = null;
      try { res = await Lookup.byName(q); } catch (e) { console.warn(e); }
      if (!res) {
        setStatus('lookup-status', cas
          ? `CAS ${q} не найден ни в PubChem, ни в NCI. Нарисуйте структуру — остальное подставится.`
          : `«${q}» не найдено: это не шифр из справочника OdanLab и не название/CAS из PubChem.`, 'err');
        return;
      }
      dirty = true;
      // поиск явный — перезаписываем название/CAS/формулу
      lastAutoName = f.name.value.trim(); lastAutoCas = f.cas.value.trim(); lastAutoFormula = f.formula.value.trim();
      applyAuto(res);
      if (res.smiles) {
        await loadStructure(res.smiles);
        lastEnrichedSmiles = f.smiles.value.trim() || res.smiles;
      }
      setStatus('lookup-status', `Найдено в PubChem: ${res.iupac || res.title || q}${res.cas ? ', CAS ' + res.cas : ''}.`, 'ok');
      setStatus('pubchem-status', '');
      const casNow = f.cas.value.trim();
      const dup = casNow && docs.find((d) => !d.deleted && d !== current && d.cas === casNow);
      if (dup) showDup(dup, `карточка с CAS ${casNow} уже есть`);
    }

    function showDup(dup, what) {
      const s = $('lookup-status');
      s.className = 'hint warn';
      s.innerHTML = esc(`Внимание: ${what} — «${dup.name}». `) + `<button type="button" class="linkish" id="open-dup">открыть её</button>`;
      $('open-dup').onclick = () => open(dup);
    }

    $('btn-lookup').addEventListener('click', lookup);
    f.find.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } });
    f.find.addEventListener('change', async () => {
      // выбор шифра из выпадающего списка — подтягиваем сразу
      if (await Store.lookupCode(f.find.value)) lookup();
    });
    form.addEventListener('input', () => { dirty = true; });

    async function readStructure() {
      // Возвращает { smiles, molfile, changed } относительно сохранённой версии карточки.
      const origSmiles = current ? current.smiles || null : null;
      const typed = f.smiles.value.trim() || null;
      if (ketcherState === 'ready' && !smilesTyped) {
        const k = await ensureKetcher();
        let smi = '';
        try { smi = await k.getSmiles(); } catch (e) { smi = ''; }
        if (smi === baselineSmiles) return { smiles: origSmiles, molfile: current ? current.molfile || null : null, changed: false };
        let mf = null;
        if (smi) { try { mf = await k.getMolfile(); } catch (e) { mf = null; } }
        return { smiles: smi || null, molfile: mf, changed: true };
      }
      // Ketcher недоступен или SMILES вписан руками — берём из поля
      if (typed === origSmiles) return { smiles: origSmiles, molfile: current ? current.molfile || null : null, changed: false };
      return { smiles: typed, molfile: null, changed: true };
    }

    function showError(msg) {
      const el = $('ed-error');
      el.textContent = msg;
      el.hidden = false;
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!f.name.value.trim()) { f.name.focus(); showError('Укажите название вещества.'); return; }
      const btn = $('btn-save');
      btn.disabled = true;
      btn.textContent = 'Сохраняю…';
      $('ed-error').hidden = true;
      try {
        const st = await readStructure();
        const row = {
          name: f.name.value.trim(),
          category: Number(f.category.value),
          formula: str(f.formula),
          cas: str(f.cas),
          yield_iso: num(f.yieldIso),
          yield_analyt: num(f.yieldAnalyt),
          loading_umol: num(f.loading),
          note: str(f.note),
          compound_class: normClass(f.cls.value),
          reactions: await buildReactions(),
          updated_by: who(),
        };
        if (st.changed) { row.smiles = st.smiles; row.molfile = st.molfile; row.image = null; }
        let saved;
        if (!current) {
          row.id = (crypto.randomUUID ? crypto.randomUUID() : 'm-' + Date.now() + '-' + Math.random().toString(36).slice(2));
          row.source = lookedUp ? 'odanlab' : 'manual';
          saved = await Store.insert(row);
        } else {
          let res = await Store.update(current.id, row, current.updated_at);
          if (res.conflict) {
            const c = res.conflict;
            const ok = confirm(`Пока вы редактировали, карточку изменил кто-то другой (${c ? fmtDate(c.updated_at) : ''}).\n\nПерезаписать её вашей версией?`);
            if (!ok) { if (c) upsertLocal(c); throw new Error('Не сохранено: карточку изменили параллельно. Откройте её заново, чтобы увидеть свежую версию.'); }
            res = await Store.update(current.id, row, null);
          }
          saved = res.row;
        }
        upsertLocal(saved);
        dirty = false;
        close(true);
        toast('Сохранено — изменения уже видны всем');
      } catch (err) {
        console.error(err);
        showError(err.message || String(err));
      } finally {
        btn.disabled = false;
        btn.textContent = 'Сохранить';
      }
    });

    $('btn-delete').addEventListener('click', async () => {
      if (!current) return;
      if (!confirm(`Удалить карточку «${current.name}»?\n\nЕё можно будет восстановить внизу страницы («Удалённые карточки»).`)) return;
      try {
        const res = await Store.update(current.id, { deleted: true, updated_by: who() }, null);
        if (res.row) upsertLocal(res.row);
        dirty = false;
        close(true);
        toast('Карточка удалена (её можно восстановить внизу страницы)');
      } catch (err) { showError(err.message); }
    });

    function close(force) {
      if (!force && dirty && !confirm('Закрыть без сохранения?')) return false;
      dlg.close();
      history.replaceState(null, '', location.pathname + location.search);
      return true;
    }
    $('ed-close').addEventListener('click', () => close());
    $('btn-cancel').addEventListener('click', () => close());
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(); });

    function onRemoteChange(row) {
      if (dlg.open && current && row.id === current.id && row.updated_at !== current.updated_at) {
        $('ed-meta').innerHTML = `<span class="warn">⚠ эту карточку только что изменил кто-то другой</span>`;
      }
    }

    return { open, who, onRemoteChange, prewarm: ensureKetcher };
  })();

  $('btn-new').addEventListener('click', () => {
    if (Store.isReadOnly()) { toast('Редактирование недоступно: нет связи с базой', 'err'); return; }
    Editor.open(null);
  });

  $('btn-classes-all').addEventListener('click', () => {
    const allOn = CATS.every((c) => classView[c.id]);
    CATS.forEach((c) => setClassView(c.id, !allOn));
    render();
  });
  function syncAllBtn() {
    const allOn = CATS.every((c) => classView[c.id]);
    const b = $('btn-classes-all');
    b.textContent = allOn ? '▦ Сеткой' : '▥ По классам';
    b.classList.toggle('on', allOn);
  }

  // ---------- размер карточек ----------
  const SIZES = ['l', 'm', 's'];
  function applySize(sz) {
    if (!SIZES.includes(sz)) sz = 'l';
    SIZES.forEach((x) => document.body.classList.toggle('size-' + x, x === sz));
    document.querySelectorAll('[data-size]').forEach((b) => {
      const on = b.dataset.size === sz;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    lsSet('cs.size', sz);
  }
  document.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => applySize(b.dataset.size)));
  applySize(lsGet('cs.size') || 'l');

  // ---------- тема ----------
  (function themeToggle() {
    const btn = $('btn-theme');
    const root = document.documentElement;
    const isDark = () => root.getAttribute('data-theme') === 'dark' ||
      (!root.hasAttribute('data-theme') && window.matchMedia('(prefers-color-scheme: dark)').matches);
    const sync = () => { btn.textContent = isDark() ? '☀' : '☾'; btn.title = isDark() ? 'Светлая тема' : 'Тёмная тема'; };
    btn.addEventListener('click', () => {
      const next = isDark() ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      lsSet('cs.theme', next);
      sync();
    });
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sync);
    sync();
  })();

  // ---------- init ----------
  async function init() {
    try {
      const res = await Store.loadMolecules();
      docs = res.rows;
      source = res.source;
    } catch (err) {
      mainEl.innerHTML = `<div class="banner warn">Не удалось загрузить данные: ${esc(err.message)}</div>`;
      return;
    }
    render();
    $('btn-new').hidden = Store.isReadOnly();

    Store.subscribe((p) => {
      const row = p.new && p.new.id ? p.new : null;
      if (!row) return;
      Editor.onRemoteChange(row);
      upsertLocal(row);
    });
    document.addEventListener('visibilitychange', async () => {
      if (document.visibilityState !== 'visible' || $('editor').open) return;
      try { const res = await Store.loadMolecules(); docs = res.rows; source = res.source; render(); } catch (e) { /* ignore */ }
    });

    const h = decodeURIComponent(location.hash || '');
    if (!Store.isReadOnly()) {
      if (h === '#new') Editor.open(null);
      else if (h.startsWith('#edit=')) { const d = docs.find((x) => x.id === h.slice(6)); if (d) Editor.open(d); }
      else if (h.startsWith('#code=')) Editor.open(null, { code: h.slice(6) });
      // прогреваем редактор структур в фоне, чтобы при первом открытии он был готов
      const warm = () => { Editor.prewarm(); document.removeEventListener('pointerover', onOver); };
      const onOver = (e) => { if (e.target.closest && e.target.closest('.card, #btn-new')) warm(); };
      document.addEventListener('pointerover', onOver);
    }
  }

  init();
})();
