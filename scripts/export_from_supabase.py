#!/usr/bin/env python3
"""
Архивирует данные сайта из Supabase в репозиторий (запускается GitHub Action'ом
.github/workflows/archive.yml каждые ~10 минут).

  data/molecules.json          — все активные карточки (то, что видно на сайте)
  data/molecules_deleted.json  — «мягко» удалённые карточки (их можно восстановить на сайте)
  data/odanlab_reactions.json  — справочник реакций OdanLab (для «создать по шифру»)

Ключ берётся из config.js (это публичный anon-ключ — тот же, что видит любой посетитель сайта).
Время в meta.generated_at = время последней правки, поэтому если в базе ничего не менялось,
файлы не меняются и коммита не будет.
"""
import json
import os
import re
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def read_config():
    src = open(os.path.join(ROOT, 'config.js'), encoding='utf-8').read()
    url = re.search(r"SUPABASE_URL\s*=\s*'([^']+)'", src).group(1)
    key = re.search(r"SUPABASE_ANON_KEY\s*=\s*'([^']+)'", src).group(1)
    return url, key


def fetch(url, key, path):
    req = urllib.request.Request(f'{url}/rest/v1/{path}', headers={
        'apikey': key, 'Authorization': f'Bearer {key}', 'Accept': 'application/json',
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode('utf-8'))


def write(name, payload):
    path = os.path.join(ROOT, 'data', name)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write('\n')


def main():
    url, key = read_config()
    mols = fetch(url, key, 'molecules?select=*&order=created_at.asc,id.asc')
    reacts = fetch(url, key, 'odanlab_reactions?select=*&order=code.asc')

    active = [m for m in mols if not m.get('deleted')]
    deleted = [m for m in mols if m.get('deleted')]
    last_edit = max((m.get('updated_at') or '' for m in mols), default='')
    last_sync = max((r.get('synced_at') or '' for r in reacts), default='')

    write('molecules.json', {
        'meta': {'generated_at': last_edit, 'source': 'Supabase (архив, обновляется автоматически)', 'count': len(active)},
        'molecules': active,
    })
    write('molecules_deleted.json', {'meta': {'count': len(deleted)}, 'molecules': deleted})
    write('odanlab_reactions.json', {
        'meta': {'synced_at': last_sync, 'count': len(reacts)},
        'reactions': reacts,
    })
    print(f'molecules: {len(active)} active, {len(deleted)} deleted; odanlab reactions: {len(reacts)}')


if __name__ == '__main__':
    main()
