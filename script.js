(function () {
  'use strict';

  // Reaction links point at OdanLab. Update these two IDs if the group/project
  // ever changes (see scripts/refresh_data.py, which reads them from the API).
  const GROUP_ID = '25214cf7-ea57-4a35-bfd1-167ad307f306';
  const PROJECT_ID = '4e03047f-ba01-4986-8f9b-c077ed367195';
  const ODANLAB_URL = (id) => `https://lab.odanchem.org/app/group/${GROUP_ID}/project/${PROJECT_ID}/reaction/${id}`;

  const CATS = [
    { id: 1, title: 'Есть препаративный выход', desc: 'вещество выделено, масса/чистота подтверждены', color: 'var(--iso)' },
    { id: 2, title: 'Ожидает выделения', desc: 'аналитический выход есть, выделение запланировано', color: 'var(--planned)' },
    { id: 4, title: 'Ожидает ЯМР / только запланировано', desc: 'реакция поставлена, данных по выходу пока нет', color: 'var(--ink-faint)' },
    { id: 3, title: 'Субстраты с низким аналитическим выходом', desc: 'выход по ЯМР низкий — реакция требует пересмотра условий', color: 'var(--danger)' },
  ];

  const mainEl = document.getElementById('main');
  const statsRow = document.getElementById('stats-row');
  const syncNote = document.getElementById('sync-note');
  const footerUpdated = document.getElementById('footer-updated');
  const searchInput = document.getElementById('search');

  let allDocs = [];

  function esc(s) {
    return (s ?? '').toString().replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function fmtYield(v) {
    if (v === null || v === undefined) return null;
    const n = Math.round(v * 10) / 10;
    return (Number.isInteger(n) ? n : n.toFixed(1)) + '%';
  }

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

    const primaryLink = reactions.find(r => r.id);
    const url = d.image || null;

    const tailHtml = `
      <div class="codes">
        ${codesShown.map(r => r.id
          ? `<a class="code-chip" href="${esc(ODANLAB_URL(r.id))}" target="_blank" rel="noopener" title="Открыть в OdanLab">${esc(r.code)}</a>`
          : `<span class="code-chip">${esc(r.code)}</span>`).join('')}
        ${extra > 0 ? `<span class="code-chip">+${extra}</span>` : ''}
      </div>
      ${d.note ? `<div class="note-line">${esc(d.note)}</div>` : ''}`;

    const linkBodyHtml = `
      ${d.isDraft ? `<span class="draft-badge">черновик · только у вас</span>` : ''}
      <div class="imgbox">${url ? `<img src="${esc(url)}" alt="${esc(d.name)}" loading="lazy">` : `<span class="ph">нет структуры</span>`}</div>
      <div class="name">${esc(d.name)}</div>
      <div class="formula mono">${esc(d.formula || '')}${d.formula && d.loading_umol ? ' · ' : ''}${d.loading_umol ? 'загрузка: ' + d.loading_umol + ' мкмоль' : ''}</div>
      <div class="yields">${pills}</div>`;

    const wrapTag = (primaryLink && primaryLink.id) ? 'a' : 'div';
    const wrapAttrs = (primaryLink && primaryLink.id) ? ` href="${esc(ODANLAB_URL(primaryLink.id))}" target="_blank" rel="noopener" title="Открыть реакцию ${esc(primaryLink.code)} в OdanLab"` : '';

    return `
      <div class="card${d.note ? ' is-note' : ''}${d.isDraft ? ' is-draft' : ''}" data-id="${esc(d.id)}" data-search="${esc((d.name + ' ' + (d.formula || '') + ' ' + (d.cas || '') + ' ' + reactions.map(r => r.code).join(' ')).toLowerCase())}">
        <${wrapTag} class="card-link"${wrapAttrs}>${linkBodyHtml}</${wrapTag}>
        ${tailHtml}
      </div>`;
  }

  function render() {
    const byCategory = {};
    for (const d of allDocs) {
      (byCategory[d.category] ||= []).push(d);
    }
    for (const key in byCategory) {
      byCategory[key].sort((a, b) => (b.yield_iso ?? b.yield_analyt ?? -1) - (a.yield_iso ?? a.yield_analyt ?? -1));
    }

    if (!allDocs.length) {
      mainEl.innerHTML = `<div class="banner info">Нет данных. Проверьте data/molecules.json.</div>`;
      return;
    }

    let html = '';
    for (const cat of CATS) {
      const items = byCategory[cat.id] || [];
      html += `
        <section class="category" data-cat="${cat.id}">
          <div class="cat-head" style="--cat-color:${cat.color}">
            <span class="cat-dot"></span>
            <h2>${cat.title}</h2>
            <span class="count mono">${items.length}</span>
            <span class="cat-desc">${cat.desc}</span>
          </div>
          ${items.length
            ? `<div class="grid">${items.map(renderCard).join('')}</div>`
            : `<div class="empty-cat">Категория пока пуста.</div>`}
        </section>`;
    }
    mainEl.innerHTML = html;
    applySearch();
  }

  function applySearch() {
    const q = searchInput.value.trim().toLowerCase();
    document.querySelectorAll('.card').forEach(c => {
      c.classList.toggle('hidden-by-search', !!q && !c.dataset.search.includes(q));
    });
    document.querySelectorAll('section.category').forEach(sec => {
      const visible = sec.querySelectorAll('.card:not(.hidden-by-search)').length;
      const grid = sec.querySelector('.grid');
      if (q && grid) sec.style.display = visible ? '' : 'none';
      else sec.style.display = '';
    });
  }
  searchInput.addEventListener('input', applySearch);

  function updateStats() {
    const total = allDocs.length;
    const codeSet = new Set();
    allDocs.forEach(d => (d.reactions || []).forEach(r => codeSet.add(r.code)));
    statsRow.innerHTML = `
      <div class="stat"><span class="n mono">${total}</span><span class="l">веществ</span></div>
      <div class="stat"><span class="n mono">${codeSet.size}</span><span class="l">реакций</span></div>`;
  }

  async function init() {
    try {
      const res = await fetch('data/molecules.json', { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const payload = await res.json();
      allDocs = payload.molecules || [];
      const meta = payload.meta || {};
      syncNote.textContent = meta.generated_at ? 'обновлено: ' + meta.generated_at.slice(0, 10) : '—';
      footerUpdated.textContent = meta.generated_at ? 'Экспорт: ' + meta.generated_at : '';
    } catch (err) {
      console.error('failed to load data/molecules.json', err);
      mainEl.innerHTML = `<div class="banner info">Не удалось загрузить data/molecules.json: ${esc(err.message)}</div>`;
      return;
    }

    // Hand-drawn structures added via add.html live only in this browser's
    // localStorage (see drafts.js) — merge them in so they show up here too.
    if (typeof Drafts !== 'undefined') {
      const drafts = Drafts.all();
      if (drafts.length) {
        allDocs = allDocs.concat(drafts);
      }
    }

    updateStats();
    render();
  }

  init();
})();
