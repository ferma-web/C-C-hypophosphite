// Слой данных: Supabase (живые данные, правят все по ссылке).
// Если Supabase недоступен — показываем архивную копию data/molecules.json (только чтение).
window.Store = (function () {
  'use strict';

  const TABLE = 'molecules';
  const CACHE = 'odanlab_reactions';
  let client = null;
  let readOnly = false;
  let reactionsByCode = null; // Map code -> row (справочник OdanLab)

  if (window.supabase && window.SUPABASE_URL && window.SUPABASE_ANON_KEY) {
    client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY, {
      auth: { persistSession: false },
    });
  }

  async function loadMolecules() {
    if (client) {
      const { data, error } = await client.from(TABLE).select('*').order('created_at', { ascending: true });
      if (!error) { readOnly = false; return { rows: data || [], source: 'live' }; }
      console.error('Supabase select failed', error);
    }
    // запасной вариант — архив из репозитория
    readOnly = true;
    const res = await fetch('data/molecules.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('data/molecules.json: HTTP ' + res.status);
    const payload = await res.json();
    return { rows: payload.molecules || [], source: 'archive', meta: payload.meta };
  }

  async function loadReactions() {
    if (reactionsByCode) return reactionsByCode;
    reactionsByCode = new Map();
    if (client) {
      const { data, error } = await client.from(CACHE).select('*');
      if (!error) {
        (data || []).forEach((r) => reactionsByCode.set(r.code.toUpperCase(), r));
        return reactionsByCode;
      }
      console.error('odanlab_reactions select failed', error);
    }
    try {
      const res = await fetch('data/odanlab_reactions.json', { cache: 'no-store' });
      if (res.ok) ((await res.json()).reactions || []).forEach((r) => reactionsByCode.set(r.code.toUpperCase(), r));
    } catch (e) { /* нет архива — ничего страшного */ }
    return reactionsByCode;
  }

  function normCode(code) {
    const c = (code || '').trim().toUpperCase().replace(/[–—_\s]+/g, '-').replace(/-+/g, '-');
    const m = c.match(/^([A-ZА-Я]+)-?0*(\d+)([A-Z]*)$/);
    return m ? `${m[1]}-${m[2]}${m[3]}` : c;
  }

  async function lookupCode(code) {
    const map = await loadReactions();
    return map.get(normCode(code)) || null;
  }

  async function insert(row) {
    const { data, error } = await client.from(TABLE).insert(row).select().single();
    if (error) throw error;
    return data;
  }

  // Обновление с защитой от одновременной правки: если карточку успел изменить кто-то другой
  // (updated_at не совпадает), вернётся { conflict: <актуальная строка> }.
  async function update(id, patch, expectedUpdatedAt) {
    let q = client.from(TABLE).update(patch).eq('id', id);
    if (expectedUpdatedAt) q = q.eq('updated_at', expectedUpdatedAt);
    const { data, error } = await q.select();
    if (error) throw error;
    if (!data || !data.length) {
      const { data: cur } = await client.from(TABLE).select('*').eq('id', id).maybeSingle();
      return { conflict: cur };
    }
    return { row: data[0] };
  }

  function subscribe(onChange) {
    if (!client) return;
    try {
      client.channel('molecules-live')
        .on('postgres_changes', { event: '*', schema: 'public', table: TABLE }, (p) => onChange(p))
        .subscribe();
    } catch (e) { console.warn('realtime unavailable', e); }
  }

  return {
    loadMolecules, loadReactions, lookupCode, normCode, insert, update, subscribe,
    isReadOnly: () => readOnly || !client,
  };
})();
