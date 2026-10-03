// Поиск веществ во внешних базах прямо из браузера (без ключей):
//  - PubChem PUG REST — систематическое (IUPAC) название, CAS, формула, SMILES;
//  - NCI CACTUS — запасной вариант «CAS → структура», если в PubChem CAS не записан.
window.Lookup = (function () {
  'use strict';

  const PUG = 'https://pubchem.ncbi.nlm.nih.gov/rest/pug';
  const CACTUS = 'https://cactus.nci.nih.gov/chemical/structure/';

  function isCAS(s) {
    const m = String(s || '').trim().match(/^(\d{2,7})-(\d{2})-(\d)$/);
    if (!m) return false;
    const digits = (m[1] + m[2]).split('').reverse();
    const sum = digits.reduce((acc, d, i) => acc + Number(d) * (i + 1), 0);
    return sum % 10 === Number(m[3]);
  }

  async function getJSON(url, opts) {
    const r = await fetch(url, opts);
    if (r.status === 404) return null;
    if (!r.ok) throw new Error('PubChem: HTTP ' + r.status);
    return r.json();
  }

  // CAS среди синонимов PubChem (берём первый с правильной контрольной цифрой)
  async function casForCid(cid) {
    const j = await getJSON(`${PUG}/compound/cid/${cid}/synonyms/JSON`);
    const syn = (j && j.InformationList && j.InformationList.Information[0].Synonym) || [];
    return syn.find(isCAS) || null;
  }

  function pickProps(p) {
    return {
      cid: p.CID,
      iupac: p.IUPACName || null,
      title: p.Title || null,
      formula: p.MolecularFormula || null,
      smiles: p.SMILES || p.IsomericSMILES || p.CanonicalSMILES || null,
    };
  }

  // Структура → { cid, iupac, title, formula, cas } или null, если в PubChem такого вещества нет.
  async function bySmiles(smiles) {
    const body = new URLSearchParams({ smiles });
    const j = await getJSON(`${PUG}/compound/smiles/property/IUPACName,Title,MolecularFormula/JSON`, { method: 'POST', body });
    const p = j && j.PropertyTable && j.PropertyTable.Properties[0];
    if (!p || !p.CID) return null;
    const res = pickProps(p);
    try { res.cas = await casForCid(p.CID); } catch (e) { res.cas = null; }
    return res;
  }

  // CAS или название → { cid, iupac, title, formula, smiles, cas } или null.
  async function byName(query) {
    const q = String(query || '').trim();
    if (!q) return null;
    const body = new URLSearchParams({ name: q });
    let j = null;
    try {
      j = await getJSON(`${PUG}/compound/name/property/IUPACName,Title,MolecularFormula,SMILES/JSON`, { method: 'POST', body });
    } catch (e) { console.warn(e); }
    const p = j && j.PropertyTable && j.PropertyTable.Properties[0];
    if (p && p.CID) {
      const res = pickProps(p);
      res.cas = isCAS(q) ? q : await casForCid(p.CID).catch(() => null);
      return res;
    }
    // запасной путь для CAS: NCI CACTUS → SMILES → снова PubChem по структуре
    if (isCAS(q)) {
      try {
        const r = await fetch(CACTUS + encodeURIComponent(q) + '/smiles');
        if (r.ok) {
          const smi = (await r.text()).trim().split('\n')[0];
          if (smi) {
            const viaStruct = await bySmiles(smi).catch(() => null);
            return Object.assign({ smiles: smi, cas: q, iupac: null, formula: null, cid: null }, viaStruct || {}, { smiles: smi, cas: q });
          }
        }
      } catch (e) { console.warn('cactus failed', e); }
    }
    return null;
  }

  return { isCAS, bySmiles, byName };
})();
