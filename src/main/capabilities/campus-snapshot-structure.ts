/** Fixed host-only projection of a bound connector snapshot. It never returns
 * record values or invokes the connector's resource resolution/normalization. */
export const campusSnapshotStructureProgram = String.raw`
import importlib.util
import json
import sys
from pathlib import Path

def fail(code):
    print(json.dumps({'status': 'error', 'error': {'code': code}}))

def kind(value):
    if isinstance(value, dict): return 'object'
    if isinstance(value, list): return 'array'
    if value is None: return 'null'
    return 'other'

def main():
    scripts = Path(sys.argv[1]).resolve()
    bundle_id, resource, root_key, endpoint = sys.argv[2:6]
    sys.path.insert(0, str(scripts))
    for name in ('complete_data', 'vault', 'client'):
        spec = importlib.util.find_spec(name)
        if not spec or not spec.origin or Path(spec.origin).resolve().parent != scripts:
            fail('SNAPSHOT_MODULE_SOURCE')
            return
    from complete_data import load_bundle
    for name in ('complete_data', 'vault', 'client'):
        module = sys.modules.get(name)
        if not module or Path(module.__file__).resolve().parent != scripts:
            fail('SNAPSHOT_MODULE_SOURCE')
            return
    bundle = load_bundle(bundle_id)
    if not isinstance(bundle, dict) or bundle.get('bundle_id') != bundle_id:
        fail('SNAPSHOT_STRUCTURE_UNKNOWN')
        return
    normalized, related, dataset = (bundle.get(key) for key in ('normalized', 'related', 'dataset'))
    present = isinstance(normalized, dict) and root_key in normalized
    print(json.dumps({'status': 'ok', 'version': 1, 'bundleId': bundle_id, 'resource': resource, 'rootKey': root_key,
        'normalizedKind': kind(normalized), 'rootPresent': present,
        'rootKind': kind(normalized[root_key]) if present else 'missing',
        'relatedPresent': 'related' in bundle, 'relatedKind': kind(related),
        'relatedOverride': isinstance(related, dict) and resource in related,
        'datasetKind': kind(dataset),
        'datasetRecordsKind': kind(dataset.get('records')) if isinstance(dataset, dict) else 'missing',
        'endpointMatches': isinstance(dataset, dict) and dataset.get('endpoint') == endpoint if endpoint else None}))

try:
    main()
except Exception:
    fail('SNAPSHOT_STRUCTURE_UNAVAILABLE')
`;
