"""Validate this prompt package's structure, not the application.

Usage: python3 evidence/validate-package.py
No network, model, repository mutation, or external dependencies.
"""
from __future__ import annotations

import collections
import datetime as dt
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
failures: list[str] = []


def require(condition: bool, message: str) -> None:
    if not condition:
        failures.append(message)


def read_json(path: str):
    return json.loads((ROOT / path).read_text(encoding="utf-8"))


def check_schema(value, schema, path="$") -> None:
    """Check all assertion keywords used by this corpus schema.

    This is intentionally scoped to this file, not a general JSON Schema engine.
    """
    if "const" in schema:
        require(type(value) is type(schema["const"]) and value == schema["const"], f"{path}: const")
    if "enum" in schema:
        require(value in schema["enum"], f"{path}: enum")
    kind = schema.get("type")
    kinds = {"object": dict, "array": list, "string": str}
    if kind in kinds:
        require(isinstance(value, kinds[kind]), f"{path}: type {kind}")
        if not isinstance(value, kinds[kind]):
            return
    if isinstance(value, str):
        require(len(value) >= schema.get("minLength", 0), f"{path}: minLength")
        if "pattern" in schema:
            require(re.search(schema["pattern"], value) is not None, f"{path}: pattern")
    if isinstance(value, list):
        require(len(value) >= schema.get("minItems", 0), f"{path}: minItems")
        require(len(value) <= schema.get("maxItems", len(value)), f"{path}: maxItems")
        for index, item in enumerate(value):
            check_schema(item, schema.get("items", {}), f"{path}[{index}]")
    if isinstance(value, dict):
        for key in schema.get("required", []):
            require(key in value, f"{path}: required {key}")
        properties = schema.get("properties", {})
        if schema.get("additionalProperties") is False:
            require(not (set(value) - set(properties)), f"{path}: additionalProperties")
        for key, item in value.items():
            if key in properties:
                check_schema(item, properties[key], f"{path}.{key}")


for p in sorted(ROOT.rglob("*.json")):
    try:
        json.loads(p.read_text(encoding="utf-8"))
    except (ValueError, UnicodeError) as exc:
        failures.append(f"JSON {p.relative_to(ROOT)}: {exc}")

corpus = read_json("scenarios/scenarios.json")
check_schema(corpus, read_json("scenarios/scenario-schema.json"))
scenarios = corpus["scenarios"]
expected_ids = [f"S{i:03}" for i in range(1, 129)]
require([row["id"] for row in scenarios] == expected_ids, "scenario IDs/order")
require(len({tuple(row["situation"]) for row in scenarios}) == 128, "duplicate scenario situations")
domain_counts = collections.Counter(row["domain"] for row in scenarios)
mode_counts = collections.Counter(row["expected_action"]["mode"] for row in scenarios)
require(len(domain_counts) == 16 and set(domain_counts.values()) == {8}, "16 domains x 8")
require(dict(mode_counts) == corpus["statistics"]["per_mode"], "mode statistics")
md_ids = re.findall(r"^#{2,3} (S\d{3})", (ROOT / "08-SCENARIOS-128.md").read_text(), re.M)
require(md_ids == expected_ids, "readable scenario sequence")

timeline_data = read_json("scenarios/timelines.json")
timelines = timeline_data["timelines"]
require(timeline_data.get("synthetic") is True, "timelines synthetic label")
require(timeline_data.get("is_user_profile") is False, "timelines not profile")
require([x["id"] for x in timelines] == [f"TL{i:02}" for i in range(1, 13)], "12 timeline IDs")
timeline_step_count = 0
for timeline in timelines:
    times = []
    require(set(timeline.get("scenario_references", [])) <= set(expected_ids), f"{timeline['id']}: scenario references")
    for step in timeline["steps"]:
        timeline_step_count += 1
        require("available_input" in step and "evaluator_only" in step, f"{timeline['id']}: input/oracle separation")
        at = dt.datetime.fromisoformat(step["at"])
        require(at.tzinfo is not None, f"{timeline['id']}: timezone")
        times.append(at)
        input_value = step["available_input"]
        require("evaluator_only" not in input_value, f"{timeline['id']}: nested oracle")
        clock_now = input_value.get("clock", {}).get("now")
        if clock_now:
            require(dt.datetime.fromisoformat(clock_now) == at, f"{timeline['id']}: clock mismatch")
        for event in input_value.get("events", []):
            if event.get("kind") == "user_message":
                require(set(event.get("data", {})) == {"text"}, f"{timeline['id']}: pre-interpreted user input")
            observed = event.get("observed_at")
            if observed:
                require(dt.datetime.fromisoformat(observed) <= at, f"{timeline['id']}: future observation")
    require(times == sorted(times), f"{timeline['id']}: chronology")
    require(4 <= len(times) <= 7, f"{timeline['id']}: 4-7 steps")

missing_links = []
for p in ROOT.rglob("*.md"):
    for target in re.findall(r"\]\(([^)]+)\)", p.read_text(encoding="utf-8")):
        if "://" in target or target.startswith(("#", "mailto:", "sandbox:")):
            continue
        relative = target.split("#", 1)[0]
        if relative and not (p.parent / relative).exists():
            missing_links.append([str(p.relative_to(ROOT)), target])
require(not missing_links, f"missing local links: {missing_links}")

research = (ROOT / "07-RESEARCH-DECISIONS.md").read_text()
references = re.findall(r"^### (R\d{2})", research, re.M)
require(references == [f"R{i:02}" for i in range(1, 21)], "research reference sequence")
manifest = read_json("evidence/repo-retrieval-manifest.json")
require(len(manifest["files"]) == 110, "source manifest count")
require(all(f["blob_sha"] == f["verified_blob_sha"] and f["sha_matches"] for f in manifest["files"]), "stored blob comparisons")

result = {
    "validation_kind": "prompt_package_structure_not_product_behavior",
    "date": "2026-10-18",
    "passed": not failures,
    "scenario_count": len(scenarios),
    "domain_count": len(domain_counts),
    "action_modes": dict(mode_counts),
    "timeline_count": len(timelines),
    "timeline_step_count": timeline_step_count,
    "research_reference_count": len(references),
    "source_manifest_count": len(manifest["files"]),
    "local_link_targets_checked": True,
    "json_schema_assertions": "scoped to all assertion keywords in provided scenario schema",
    "future_data_check": "observed_at <= step clock plus separated evaluator fields; semantic review remains necessary",
    "failures": failures,
    "not_run": ["Electron application", "npm test/build", "production model", "campus APIs", "Android device"],
}
print(json.dumps(result, ensure_ascii=False, indent=2))
raise SystemExit(0 if not failures else 1)
