"""Minimal molfile (V2000/V3000) -> SMILES converter + formula, no external deps.

Writes Kekule SMILES (explicit = bonds, upper-case atoms), no stereo.
Good enough to re-load a structure into Ketcher / render with RDKit.js.
"""
import re
from collections import Counter

ORGANIC = {'B': [3], 'C': [4], 'N': [3, 5], 'O': [2], 'P': [3, 5], 'S': [2, 4, 6],
           'F': [1], 'Cl': [1], 'Br': [1], 'I': [1]}
# valence used for implicit-H of charged organic atoms
CHG_VAL = {('C', 1): 3, ('C', -1): 3, ('N', 1): 4, ('N', -1): 2, ('O', 1): 3, ('O', -1): 1,
           ('S', 1): 3, ('S', -1): 1, ('P', 1): 4, ('B', -1): 4}


def parse_molfile(mf):
    lines = mf.replace('\r', '').split('\n')
    atoms, bonds = [], []
    if any('V3000' in l for l in lines[:5]):
        sect = None
        buf = ''
        for l in lines:
            if not l.startswith('M  V30 '):
                continue
            body = l[7:]
            if body.endswith('-'):
                buf += body[:-1]
                continue
            body = buf + body
            buf = ''
            if body.startswith('BEGIN ATOM'): sect = 'a'; continue
            if body.startswith('END ATOM'): sect = None; continue
            if body.startswith('BEGIN BOND'): sect = 'b'; continue
            if body.startswith('END BOND'): sect = None; continue
            t = body.split()
            if sect == 'a':
                el = t[1]
                props = dict(x.split('=', 1) for x in t[6:] if '=' in x)
                atoms.append({'el': el, 'chg': int(props.get('CHG', 0)), 'iso': int(props.get('MASS', 0)) or None,
                              'idx': int(t[0])})
            elif sect == 'b':
                bonds.append((int(t[2]) - 1, int(t[3]) - 1, int(t[1])))
        # V3000 atom indices are 1-based sequential in practice
    else:
        counts = lines[3]
        na, nb = int(counts[0:3]), int(counts[3:6])
        for i in range(na):
            l = lines[4 + i]
            el = l[31:34].strip()
            chg_code = int(l[36:39] or 0) if len(l) >= 39 else 0
            chg = {0: 0, 1: 3, 2: 2, 3: 1, 5: -1, 6: -2, 7: -3}.get(chg_code, 0)
            atoms.append({'el': el, 'chg': chg, 'iso': None})
        for i in range(nb):
            l = lines[4 + na + i]
            bonds.append((int(l[0:3]) - 1, int(l[3:6]) - 1, int(l[6:9])))
        for l in lines[4 + na + nb:]:
            if l.startswith('M  CHG') or l.startswith('M  ISO'):
                t = l.split()
                n = int(t[2])
                for k in range(n):
                    a, v = int(t[3 + 2 * k]) - 1, int(t[4 + 2 * k])
                    if l.startswith('M  CHG'):
                        atoms[a]['chg'] = v
                    else:
                        atoms[a]['iso'] = v
    return atoms, bonds


def implicit_h(atom, bsum):
    el, chg = atom['el'], atom['chg']
    if chg:
        v = CHG_VAL.get((el, chg))
        return max(0, v - bsum) if v is not None else 0
    if el in ORGANIC:
        for v in ORGANIC[el]:
            if v >= bsum:
                return v - bsum
        return 0
    return 0


def to_smiles(mf):
    atoms, bonds = parse_molfile(mf)
    n = len(atoms)
    adj = [[] for _ in range(n)]
    bsum = [0] * n
    for a, b, o in bonds:
        oo = 1.5 if o == 4 else o
        adj[a].append((b, o))
        adj[b].append((a, o))
        bsum[a] += oo
        bsum[b] += oo
    if any(o == 4 for _, _, o in bonds):
        raise ValueError('aromatic bond type 4 not supported')
    hs = [implicit_h(atoms[i], int(bsum[i])) for i in range(n)]

    def atom_str(i):
        a = atoms[i]
        el = a['el']
        if el in ORGANIC and not a['chg'] and not a['iso']:
            return el
        s = '['
        if a['iso']: s += str(a['iso'])
        s += el
        if hs[i]: s += 'H' + (str(hs[i]) if hs[i] > 1 else '')
        if a['chg']:
            c = a['chg']
            s += ('+' if c > 0 else '-') + (str(abs(c)) if abs(c) > 1 else '')
        return s + ']'

    BS = {1: '', 2: '=', 3: '#'}
    import sys
    sys.setrecursionlimit(10000)
    visited = [False] * n
    tree_children = [[] for _ in range(n)]
    tree_edges = set()

    def rdfs(u):
        visited[u] = True
        for v, o in adj[u]:
            if not visited[v]:
                tree_edges.add(frozenset((u, v)))
                tree_children[u].append((v, o))
                rdfs(v)

    frags = []
    for s in range(n):
        if not visited[s]:
            rdfs(s)
            frags.append(s)
    ring_edges = [(a, b, o) for a, b, o in bonds if frozenset((a, b)) not in tree_edges]
    # assign ring numbers in write order
    ring_at = {i: [] for i in range(n)}
    for a, b, o in ring_edges:
        ring_at[a].append((b, o))
        ring_at[b].append((a, o))

    out = []
    open_rings = {}  # frozenset edge -> number
    free = list(range(1, 100))

    def write(u):
        s = atom_str(u)
        for v, o in ring_at[u]:
            e = frozenset((u, v))
            if e in open_rings:
                num = open_rings.pop(e)
                s += BS[o] + (str(num) if num < 10 else '%' + str(num))
                free.append(num); free.sort()
            else:
                num = free.pop(0)
                open_rings[e] = num
                s += BS[o] + (str(num) if num < 10 else '%' + str(num))
        out.append(s)
        ch = tree_children[u]
        for k, (v, o) in enumerate(ch):
            if k < len(ch) - 1:
                out.append('(' + BS[o]); write(v); out.append(')')
            else:
                out.append(BS[o]); write(v)

    parts = []
    for s in frags:
        out = []
        write(s)
        parts.append(''.join(out))
    return '.'.join(parts)


def formula(mf):
    atoms, bonds = parse_molfile(mf)
    n = len(atoms)
    bsum = [0] * n
    for a, b, o in bonds:
        bsum[a] += o; bsum[b] += o
    c = Counter()
    for i, a in enumerate(atoms):
        c[a['el']] += 1
        c['H'] += implicit_h(a, bsum[i])
    return hill(c)


def hill(c):
    s = ''
    for el in (['C', 'H'] if 'C' in c else []):
        if c.get(el): s += el + (str(c[el]) if c[el] > 1 else '')
    for el in sorted(k for k in c if k not in (['C', 'H'] if 'C' in c else [])):
        if c[el]: s += el + (str(c[el]) if c[el] > 1 else '')
    return s


def smiles_formula(smi):
    """Tiny SMILES reader (subset we emit) -> Hill formula, for self-checking."""
    c = Counter()
    toks = re.findall(r'\[[^\]]+\]|Cl|Br|[BCNOPSFI]|[=#]|\(|\)|%\d\d|\d|\.', smi)
    atoms = []  # [el, explicitH or None, chg, bondsum]
    prev = None; stack = []; bond = 1; rings = {}
    for t in toks:
        if t in '=#':
            bond = 2 if t == '=' else 3; continue
        if t == '(':
            stack.append(prev); continue
        if t == ')':
            prev = stack.pop(); continue
        if t == '.':
            prev = None; continue
        if t[0].isdigit() or t[0] == '%':
            k = t
            if k in rings:
                j, bo = rings.pop(k)
                o = max(bo, bond)
                atoms[j][3] += o; atoms[prev][3] += o
            else:
                rings[k] = (prev, bond)
            bond = 1; continue
        if t.startswith('['):
            m = re.match(r'\[(\d*)([A-Z][a-z]?)(H\d*)?([+-]\d*)?\]', t)
            h = m.group(3); h = 0 if not h else (int(h[1:]) if len(h) > 1 else 1)
            ch = m.group(4); ch = 0 if not ch else (int(ch[1:] or 1) * (1 if ch[0] == '+' else -1))
            atoms.append([m.group(2), h, ch, 0])
        else:
            atoms.append([t, None, 0, 0])
        cur = len(atoms) - 1
        if prev is not None:
            atoms[prev][3] += bond; atoms[cur][3] += bond
        prev = cur; bond = 1
    for el, h, ch, bs in atoms:
        c[el] += 1
        c['H'] += h if h is not None else implicit_h({'el': el, 'chg': 0}, bs)
    return hill(c)
