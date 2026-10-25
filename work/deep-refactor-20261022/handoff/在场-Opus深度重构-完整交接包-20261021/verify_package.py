#!/usr/bin/env python3
"""Read-only fidelity verification for this handoff, not the product itself.

Usage: python3 verify_package.py
Only Python's standard library is used. No supplied scripts, app, models,
external accounts, or network resources are executed or contacted.
"""
from __future__ import annotations
import argparse
import collections
import datetime
import hashlib
import json
import re
import sys
import zipfile
from pathlib import Path, PurePosixPath


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def verify(root):
    checks = collections.Counter()
    evidence = root / 'evidence'

    def need(value, reason):
        if not value:
            raise AssertionError(reason)

    def member_path(value):
        p = PurePosixPath(value)
        need(bool(value) and not p.is_absolute() and '..' not in p.parts and '\\' not in value
             and '\0' not in value and ':' not in p.parts[0], 'Unsafe relative path: '+repr(value))
        target = root / p
        need(target.resolve().is_relative_to(root.resolve()), 'Path leaves package: '+value)
        return target

    def read_json(name):
        return json.loads((evidence/name).read_text(encoding='utf-8'))

    manifest = read_json('source-manifest.json')
    sources = {row['id']:row for row in manifest['sources']}
    need(len(sources)==len(manifest['sources'])==manifest['source_count'], 'Source IDs/count differ')
    need({f'S{i:02d}' for i in range(1,19)}.issubset(sources), 'Original source ID missing')
    need('U00' in sources, 'Current user transcript missing')
    source_bytes = {}
    for sid,row in sources.items():
        p = member_path(row['package_path'])
        need(p.is_file(), 'Missing source: '+sid)
        data = p.read_bytes()
        need(len(data)==row['byte_length'], 'Source size differs: '+sid)
        need(sha256(data)==row['sha256'], 'Source SHA-256 differs: '+sid)
        if row['encoding']=='UTF-8':
            data.decode('utf-8')
        source_bytes[sid]=data
        checks['source_files_byte_verified']+=1
    for group in manifest['identical_byte_groups']:
        for sid in group['source_ids']:
            need(sources[sid]['sha256']==group['sha256'], 'Duplicate alias differs: '+sid)
    need(sum(s['kind']=='expanded_archive_member' for s in sources.values())==manifest['expanded_file_count'],
         'Expanded member count differs')

    archives = read_json('archive-members.json')
    rows_by_archive = collections.defaultdict(list)
    for row in archives['members']:
        rows_by_archive[row['archive_id']].append(row)
    for sid,rows in rows_by_archive.items():
        with zipfile.ZipFile(member_path(sources[sid]['package_path'])) as z:
            expected_names=[r['member_name'] for r in rows]
            need(len(z.namelist())==len(set(z.namelist())), 'Duplicate archive member: '+sid)
            need(set(z.namelist())==set(expected_names), 'Archive member list differs: '+sid)
            need(z.testzip() is None, 'Archive CRC differs: '+sid)
            for row in rows:
                name=row['member_name']
                safe=PurePosixPath(name)
                need(not safe.is_absolute() and '..' not in safe.parts and '\\' not in name
                     and ':' not in safe.parts[0], 'Unsafe archive name: '+name)
                item=z.getinfo(name)
                need(item.is_dir()==row['is_directory'], 'Member kind differs: '+name)
                need(item.file_size==row['uncompressed_bytes'], 'Member size differs: '+name)
                need(f'{item.CRC:08x}'==row['crc32_hex'], 'Member CRC differs: '+name)
                if item.is_dir():
                    checks['archive_directory_entries_verified']+=1
                    continue
                data=z.read(name)
                need(sha256(data)==row['sha256'], 'Member SHA-256 differs: '+name)
                if row.get('expanded_source_id'):
                    need(data==source_bytes[row['expanded_source_id']], 'Expanded bytes differ: '+name)
                    need(row['expanded_package_path']==sources[row['expanded_source_id']]['package_path'],
                         'Expanded source path differs: '+name)
                    checks['expanded_archive_files_byte_verified']+=1
                if row.get('payload_alias_source_id'):
                    need(data==source_bytes[row['payload_alias_source_id']], 'Supplemental payload alias differs: '+name)
                    checks['supplemental_archive_file_aliases_verified']+=1
                checks['archive_file_members_verified']+=1
            checks['original_zip_archives_crc_verified']+=1

    utf8_ids={sid for sid,s in sources.items() if s['encoding']=='UTF-8'}
    ledger_rows={}
    for filename,ordinal in [('source-lines.jsonl','line'),('source-paragraphs.jsonl','paragraph')]:
        buckets=collections.defaultdict(list)
        with (evidence/filename).open(encoding='utf-8') as f:
            for raw in f:
                row=json.loads(raw)
                need(row['source_id'] in utf8_ids, 'Unknown text source in '+filename)
                buckets[row['source_id']].append(row)
        need(set(buckets)==utf8_ids, 'Missing UTF-8 source in '+filename)
        for sid,rows in buckets.items():
            cursor=0
            rebuilt=[]
            for i,row in enumerate(rows,1):
                data=row['text'].encode('utf-8')
                need(row[ordinal]==i, 'Nonconsecutive '+ordinal+': '+sid)
                need(row['start_byte']==cursor and row['end_byte']==cursor+len(data), 'Noncontiguous bytes: '+sid)
                rebuilt.append(data)
                cursor=row['end_byte']
            need(b''.join(rebuilt)==source_bytes[sid], 'Ledger cannot reconstruct: '+sid+' '+filename)
            checks[ordinal+'_source_reconstructions_verified']+=1
            checks[ordinal+'_records_verified']+=len(rows)
        ledger_rows[ordinal]=buckets
    for sid,rows in ledger_rows['paragraph'].items():
        lines=ledger_rows['line'][sid]
        for row in rows:
            a,b=row['start_line'],row['end_line']
            need(1<=a<=b<=len(lines), 'Paragraph line range invalid: '+sid)
            need(''.join(v['text'] for v in lines[a-1:b])==row['text'], 'Paragraph/line mismatch: '+sid)

    sections=read_json('source-sections.json')['sections']
    need(len({r['id'] for r in sections})==len(sections), 'Duplicate section ID')
    for row in sections:
        sid=row['source_id']
        need(sid in utf8_ids, 'Unknown section source')
        lines=ledger_rows['line'][sid]
        a,b=row['start_line'],row['end_line']
        need(1<=a<=b<=len(lines), 'Invalid section lines: '+row['id'])
        need(lines[a-1]['start_byte']==row['start_byte'] and lines[b-1]['end_byte']==row['end_byte'],
             'Section byte/line mismatch: '+row['id'])
        if row['level']:
            need(lines[a-1]['text'].strip()==row['heading'], 'Section heading differs: '+row['id'])
        for route in row['routes']:
            need(any(root.glob(route['module']+'-*.txt')), 'Missing routed module')
        checks['section_pointers_verified']+=1

    req=read_json('requirements.json')
    rows=req['latest_user_requirements']+req['historical_requirements']
    need(len({r['id'] for r in rows})==len(rows), 'Duplicate requirement ID')
    need({r['id'] for r in req['latest_user_requirements']}=={f'U{i:02d}' for i in range(1,56)},
         'Latest request index must contain U01–U55')
    for row in rows:
        need(all(sid in sources for sid in row['source_ids']), 'Unknown requirement source: '+row['id'])
        for filename in row.get('target_files',[]):
            need(member_path(filename).is_file(), 'Missing requirement target: '+filename)
        for anchor in row.get('source_locator_candidates',[]):
            origin=ledger_rows['line'][anchor['source_id']][anchor['line']-1]
            need(origin['start_byte']==anchor['start_byte'] and origin['end_byte']==anchor['end_byte'],
                 'Requirement source pointer differs: '+row['id'])
        checks['manual_requirement_index_records_verified']+=1

    old=read_json('old-scenarios-index.json')
    old_ids={r['original_id'] for r in old['scenarios']}
    for kind,key in [('scenarios','scenarios'),('timelines','timelines')]:
        for row in old[kind]:
            data=json.loads(source_bytes[row['source_id']].decode('utf-8'))
            pointer=row['json_pointer'].split('/')
            need(pointer[1]==key, 'Scenario JSON pointer kind differs')
            actual=data[key][int(pointer[2])]
            need(actual['id']==row['original_id'], 'Scenario ID pointer differs')
            if kind=='timelines':
                need(len(actual['steps'])==row['step_count'], 'Timeline step count differs')
                need(set(actual.get('scenario_references',[]))<=old_ids, 'Unknown timeline scenario reference')
            checks['historical_'+kind+'_pointers_verified']+=1
    need(sum(r['step_count'] for r in old['timelines'])==old['timeline_steps'], 'Timeline total differs')

    observed=read_json('image-observations.json')
    need(len(observed['images'])==observed['observed_upload_image_count'], 'Observed image count differs')
    for row in observed['images']:
        need(sources[row['source_id']]['package_path']==row['path'], 'Image source pointer differs')
    tree=read_json('repository-tree.json')
    need(tree['truncated'] is False, 'Repository tree was truncated')
    tree_map={r['path']:r for r in tree['tree']}
    repo=read_json('repository-read-manifest.json')
    for row in repo['files']:
        expected=tree_map[row['path']]
        need(expected['sha']==row['git_blob_sha1'] and expected['size']==row['byte_length'],
             'Repository metadata differs: '+row['path'])
        checks['repository_file_metadata_records_verified']+=1
    image_inventory=read_json('repository-image-inventory.json')
    for row in image_inventory['images']:
        expected=tree_map[row['path']]
        need(expected['sha']==row['git_blob_sha1'] and expected['size']==row['bytes'], 'Repository image metadata differs')
        checks['repository_image_metadata_records_verified']+=1
    for row in read_json('code-anchors.json')['anchors']:
        need(row['path'] in tree_map, 'Code anchor file absent from tree')
        need(1<=row['start_line']<=row['end_line'], 'Code anchor range invalid')
        checks['code_anchor_metadata_records_verified']+=1

    stats=read_json('package-statistics.json')
    expected_stats={
      'original_files':manifest['original_file_count'],
      'archive_file_members_expanded':checks['expanded_archive_files_byte_verified'],
      'all_source_records':len(sources), 'utf8_sources':len(utf8_ids),
      'source_lines':checks['line_records_verified'], 'source_paragraphs':checks['paragraph_records_verified'],
      'source_sections_including_roots':len(sections), 'latest_user_requirements':len(req['latest_user_requirements']),
      'historical_manual_requirements':len(req['historical_requirements']),
      'historical_scenarios':len(old['scenarios']), 'historical_timelines':len(old['timelines']),
      'historical_timeline_steps':old['timeline_steps'], 'retrieved_repository_files':len(repo['files']),
      'repository_tree_entries':len(tree['tree']), 'repository_image_paths':len(image_inventory['images']),
      'observed_upload_images':len(observed['images']),
      'new_experience_stories':len(re.findall(r'^V\d{2}\s',(root/'11-连续体验故事.txt').read_text(encoding='utf-8'),re.M)),
      'new_main_files':len(list(root.glob('[0-9][0-9]-*.txt'))),
      'new_main_unicode_characters':sum(len(p.read_text(encoding='utf-8')) for p in root.glob('[0-9][0-9]-*.txt')),
      'original_unicode_characters_in_text_ledger_including_duplicates':sum(len(source_bytes[sid].decode('utf-8')) for sid in utf8_ids),
    }
    for name,value in expected_stats.items():
        need(stats[name]==value, 'Statistics differ: '+name)

    catalogue=evidence/'package-files.json'
    if catalogue.exists():
        rows=read_json('package-files.json')['files']
        expected_paths={r['path'] for r in rows}
        actual_paths={p.relative_to(root).as_posix() for p in root.rglob('*') if p.is_file() and p!=catalogue}
        need(expected_paths==actual_paths, 'Final package file inventory differs')
        for row in rows:
            data=member_path(row['path']).read_bytes()
            need(len(data)==row['bytes'] and sha256(data)==row['sha256'], 'Final file differs: '+row['path'])
            checks['final_package_files_byte_verified']+=1
    return {'schema_version':1,'checked_at_utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),
            'package_integrity_ok':True,'checks':dict(sorted(checks.items())),
            'product_verification_performed':False,'source_scripts_executed':False,'network_used':False,
            'limits':['字节一致不证明所有独立语义已被完整理解或实现。',
                      '仓库读取清单校对固定树元信息，仓库图像目录不证明图像已被观察。',
                      '未验证产品、真实模型、真实账号、动态界面交互或长期陪伴表现。'],
            'final_file_inventory_checked':catalogue.exists()}


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parent)
    parser.add_argument('--write-report',type=Path,help='Optional report path; omit for a read-only check.')
    args=parser.parse_args()
    try:
        if args.write_report and (args.root/'evidence/package-files.json').exists():
            raise ValueError('The final inventory already exists. Omit --write-report to verify without changing the package.')
        report=verify(args.root.resolve())
        if args.write_report:
            args.write_report.parent.mkdir(parents=True,exist_ok=True)
            args.write_report.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        print(json.dumps(report,ensure_ascii=False,indent=2))
    except Exception as exc:
        print(json.dumps({'package_integrity_ok':False,'error':str(exc),'product_verification_performed':False},
                         ensure_ascii=False,indent=2),file=sys.stderr)
        return 1
    return 0


if __name__=='__main__':
    raise SystemExit(main())
