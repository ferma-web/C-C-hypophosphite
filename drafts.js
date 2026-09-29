// Shared local-draft storage for hand-drawn structures.
//
// There's no backend, so a structure drawn by hand (not pulled from
// OdanLab) can't be written into data/molecules.json by the browser --
// GitHub Pages serves static files and has nowhere to accept a write, and
// giving the page a GitHub token to commit with would expose that token to
// anyone who opens the site. So instead: drafts live in this browser's
// localStorage (visible only here, gone if you clear site data), and
// "Export" turns a draft into the PNG + JSON snippet you'd commit to make
// it permanent and visible to everyone. See add.html and README.md.
const Drafts = (function () {
  const KEY = 'catalysisScreenDrafts.v1';

  function all() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Drafts: failed to read localStorage', e);
      return [];
    }
  }

  function save(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
      return true;
    } catch (e) {
      console.error('Drafts: failed to write localStorage', e);
      return false;
    }
  }

  function add(entry) {
    const list = all();
    list.push(entry);
    return save(list);
  }

  function remove(id) {
    const list = all().filter(d => d.id !== id);
    return save(list);
  }

  return { all, add, remove };
})();
