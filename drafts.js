// Hand-added structures (see add.html), shared across everyone who opens
// this site via Supabase — a small free-tier database, not a repo commit.
// See README.md ("Adding a structure by hand") and supabase-schema.sql for
// the table + access-control setup, and config.js for where the project
// URL/key go.
//
// If config.js hasn't been filled in yet, this quietly falls back to a
// same-browser-only localStorage list, so add.html still works while
// you're setting Supabase up.

const Drafts = (function () {
  const LOCAL_KEY = 'catalysisScreenDrafts.v1'; // fallback only, pre-Supabase

  let client = null;
  const configured = !!(window.SUPABASE_URL && window.SUPABASE_ANON_KEY &&
    window.SUPABASE_URL.indexOf('YOUR-PROJECT') === -1);
  if (configured && window.supabase) {
    client = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
  } else if (configured && !window.supabase) {
    console.error('Drafts: config.js is filled in but the supabase-js script did not load (offline? ad-blocker?)');
  }

  function localAll() {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Drafts: localStorage read failed', e);
      return [];
    }
  }
  function localSave(list) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      console.error('Drafts: localStorage write failed', e);
      return false;
    }
  }

  function rowToEntry(r) {
    return {
      id: r.id,
      category: r.category,
      name: r.name,
      formula: r.formula,
      cas: r.cas,
      loading_umol: r.loading_umol,
      yield_analyt: r.yield_analyt,
      yield_iso: r.yield_iso,
      note: r.note,
      smiles: r.smiles,
      reactions: r.reactions || [],
      image: r.image,
      isDraft: true,
      created_at: r.created_at,
    };
  }
  function entryToRow(e) {
    return {
      id: e.id,
      category: e.category,
      name: e.name,
      formula: e.formula,
      cas: e.cas,
      loading_umol: e.loading_umol,
      yield_analyt: e.yield_analyt,
      yield_iso: e.yield_iso,
      note: e.note,
      smiles: e.smiles,
      reactions: e.reactions || [],
      image: e.image,
      created_at: e.created_at,
    };
  }

  async function all() {
    if (!client) return localAll();
    const { data, error } = await client
      .from('drafts')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Drafts: supabase select failed', error);
      return [];
    }
    return (data || []).map(rowToEntry);
  }

  async function add(entry) {
    if (!client) {
      const list = localAll();
      list.push(entry);
      return localSave(list);
    }
    const { error } = await client.from('drafts').insert(entryToRow(entry));
    if (error) {
      console.error('Drafts: supabase insert failed', error);
      return false;
    }
    return true;
  }

  async function remove(id) {
    if (!client) return localSave(localAll().filter(d => d.id !== id));
    const { error } = await client.from('drafts').delete().eq('id', id);
    if (error) {
      console.error('Drafts: supabase delete failed', error);
      return false;
    }
    return true;
  }

  // Whether drafts are actually shared (Supabase configured) or only
  // visible in this browser (fallback). The UI uses this to word things
  // correctly instead of always claiming "shared" or always "local".
  function isShared() {
    return !!client;
  }

  // Look up a reaction by its short OdanLab code (e.g. "AAP-36") in the
  // read-only odanlab_cache table (see odanlab-cache.sql). Returns null if
  // Supabase isn't configured, the table doesn't exist yet, or no match is
  // found — callers should treat all of those the same way (tell the user
  // to fill the form in by hand).
  async function lookupCode(code) {
    if (!client || !code) return null;
    const { data, error } = await client
      .from('odanlab_cache')
      .select('*')
      .eq('code', code.trim())
      .maybeSingle();
    if (error) {
      console.error('Drafts: odanlab_cache lookup failed', error);
      return null;
    }
    return data || null;
  }

  return { all, add, remove, isShared, lookupCode };
})();
