#!/usr/bin/env python3
"""
Готовит SQL для обновления справочника реакций OdanLab в Supabase (таблица odanlab_reactions).

Используется ежедневной задачей Claude (коннектор OdanLab + коннектор Supabase):

  1. Claude выгружает текущее состояние справочника:
       select code, updated_at from odanlab_reactions
     и сохраняет результат в existing.json  ([{"code": ..., "updated_at": ...}, ...]).
  2. Claude вызывает OdanLab search_reactions(compact=False, per_page=25, page=1..N)
     для проекта; каждый ответ сохраняется в файл (JSON {"total_count", "items"}).
  3. python3 scripts/odanlab_sync.py existing.json page1.txt page2.txt ... > upsert.sql
     — в SQL попадают только новые реакции и реакции, изменённые в OdanLab
       (по полю updated_at), плюс структура продукта в виде SMILES.
  4. Claude выполняет upsert.sql через Supabase execute_sql. Триггер в базе сам
     переносит новые выходы в уже созданные карточки (если их не правили руками).

Без внешних зависимостей (molfile -> SMILES делает scripts/molsmi.py).
"""
import json
import re
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from molsmi import to_smiles, formula as mol_formula  # noqa: E402

COLS = ['code', 'reaction_id', 'display_id', 'name', 'reagents', 'yield_analyt', 'yield_iso',
        'mass_measured_mg', 'loading_umol', 'formula', 'cas', 'smiles', 'created_at', 'updated_at']


def short_code(display_id):
    m = re.match(r'^([A-Za-z]+)-.*-(\d+)([a-z]*)$', display_id or '')
    return f"{m.group(1).upper()}-{int(m.group(2))}{m.group(3)}" if m else display_id


def r2(v):
    return round(v, 2) if isinstance(v, float) else v


def reaction_row(it):
    prods = sorted(it.get('products') or [], key=lambda p: p.get('display_order') or 0)
    p = prods[0] if prods else {}
    s = p.get('substance') or {}
    mf = p.get('custom_molfile') or s.get('custom_molfile') or s.get('molfile')
    smi = None
    if mf:
        try:
            smi = to_smiles(mf)
        except Exception as e:  # структура нестандартная — просто без SMILES
            print(f'-- {it.get("display_id")}: SMILES not generated ({e})', file=sys.stderr)
    reagents = []
    for r in it.get('reagents') or []:
        nm = r.get('custom_name') or (r.get('substance') or {}).get('name')
        if nm:
            reagents.append(nm)
    return {
        'code': short_code(it['display_id']),
        'reaction_id': it['id'],
        'display_id': it['display_id'],
        'name': p.get('custom_name') or s.get('name'),
        'reagents': '; '.join(reagents) or None,
        'yield_analyt': r2(p.get('yield_analyt')),
        'yield_iso': r2(p.get('yield_iso')),
        'mass_measured_mg': r2(p.get('mass_measured')),
        'loading_umol': round(p['amount_mmol'] * 1000, 1) if p.get('amount_mmol') else None,
        'formula': s.get('chemical_formula') or (mol_formula(mf) if mf else None),
        'cas': s.get('cas_number') or None,
        'smiles': smi,
        'created_at': (it.get('created_at') or '')[:19] or None,
        'updated_at': (it.get('updated_at') or '')[:19] or None,
    }


def main():
    if len(sys.argv) < 3:
        print(__doc__, file=sys.stderr)
        sys.exit(1)
    existing_raw = json.load(open(sys.argv[1], encoding='utf-8'))
    existing = {}
    for e in existing_raw:
        existing[e['code']] = (e.get('updated_at') or '')[:19].replace(' ', 'T')

    items = {}
    for path in sys.argv[2:]:
        data = json.load(open(path, encoding='utf-8'))
        for it in data.get('items', []):
            items[it['id']] = it

    rows = []
    for it in items.values():
        row = reaction_row(it)
        prev = existing.get(row['code'])
        if prev is not None and prev == (row['updated_at'] or ''):
            continue
        rows.append(row)

    print(f'-- reactions read: {len(items)}, new or changed: {len(rows)}', file=sys.stderr)
    if not rows:
        print('select 0 as changed;')
        return
    payload = json.dumps([[r[c] for c in COLS] for r in rows], ensure_ascii=False, separators=(',', ':'))
    payload = payload.replace('$J$', '')
    casts = ['a->>0', 'a->>1', 'a->>2', 'a->>3', 'a->>4', '(a->>5)::float8', '(a->>6)::float8',
             '(a->>7)::float8', '(a->>8)::float8', 'a->>9', 'a->>10', 'a->>11',
             '(a->>12)::timestamptz', '(a->>13)::timestamptz']
    updates = ', '.join(f'{c} = excluded.{c}' for c in COLS if c != 'code')
    print(
        f"insert into public.odanlab_reactions ({', '.join(COLS)}, synced_at)\n"
        f"select {', '.join(casts)}, now() from jsonb_array_elements($J${payload}$J$::jsonb) a\n"
        f"on conflict (code) do update set {updates}, synced_at = now()\n"
        f"returning code;"
    )


if __name__ == '__main__':
    main()
