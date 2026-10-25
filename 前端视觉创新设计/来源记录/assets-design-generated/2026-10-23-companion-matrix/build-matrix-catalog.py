"""Author the requested 360-cell visual asset catalog from actual source records.

This is asset metadata production, not a test runner. It never signs a review,
changes a scene, paints an image or infers runtime success from registration.
Usage: python build-matrix-catalog.py
"""
import hashlib
import json
import math
import re
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image


HERE = Path(__file__).resolve().parent
REPO = next(parent for parent in HERE.parents if (parent / "package.json").is_file())
RUNTIME = REPO / "前端视觉创新设计/运行素材/companion/scenes"
CURRENT_SOURCES = REPO / "前端视觉创新设计/来源记录/2026-10-24-matrix"
SOURCE_ROOTS = [HERE, CURRENT_SOURCES]
CHARACTERS = ["sakiko", "mutsumi", "uika", "umiri", "nyamu", "tomori", "anon", "rana", "soyo", "taki"]
ACTIVITIES = ["chat", "study", "reading", "planning", "listening", "rest", "play", "attention", "resume"]
THEMES = ["apricot", "mist", "violet", "rain"]
EXPECTED_CELLS = len(CHARACTERS) * len(ACTIVITIES) * len(THEMES)
LIGHTS = {"apricot": "morning", "mist": "morning", "violet": "dusk", "rain": "night"}
SCENE_CONTRACT_KEYS = ["schemaVersion", "id", "character", "activity", "light", "palette", "width", "height",
    "mother", "background", "figure", "mask", "shadow", "foreground", "seat", "ground", "bodyBounds",
    "safeTextBoundary", "support", "floorContact", "contactShadow", "contourComplete", "hitPolygon", "travel", "slope", "perspective"]
STAGE_ENGINE_FILES = ["src/renderer/companion-scenes.tsx", "src/renderer/companion.css", "src/renderer/motion/use-spring.ts"]
NOTES = []


def read(path):
    try:
        return json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, ValueError) as error:
        NOTES.append({"file": path.relative_to(REPO).as_posix(), "pendingReason": str(error).split(":")[0]})
        return None


def relative(path):
    try:
        return path.resolve().relative_to(REPO).as_posix()
    except ValueError:
        return None


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def record_path(source_path, name):
    """Source-local basenames and explicit repository paths share one boundary."""
    if not isinstance(name, str) or not name or len(name) > 2000:
        return None
    normalized = name.replace("\\", "/")
    path = Path(normalized)
    if not path.is_absolute():
        local, rooted = source_path.parent / path, REPO / path
        path = rooted if normalized.startswith("前端视觉创新设计/") else local if local.is_file() else rooted if rooted.is_file() else local
    return path.resolve() if relative(path) else None


def matrix_identity(source):
    parts = source.get("key", "").split("/") if isinstance(source.get("key"), str) else []
    explicit = parts if len(parts) == 3 else [None, None, None]
    character = source.get("character") or source.get("role") or explicit[0]
    activity = source.get("activity") or explicit[1] or ("resume" if source.get("sceneCategory") == "S9_RESUME" else None)
    theme = source.get("palette") or source.get("theme") or (source.get("light") if source.get("light") in THEMES else None) or explicit[2]
    return (character, activity, theme) if character in CHARACTERS and activity in ACTIVITIES and theme in THEMES else None


stage_engine_files = {name: digest(REPO / name) for name in STAGE_ENGINE_FILES}
stage_engine_sha = hashlib.sha256(json.dumps(stage_engine_files, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def registration_reasons(scene):
    """Describe current file registration requirements, without running product code."""
    reasons = []
    finite = lambda value: type(value) in (int, float) and math.isfinite(value)
    unit = lambda value: finite(value) and 0 <= value <= 1
    if not finite(scene.get("schemaVersion")) or scene["schemaVersion"] != 1 or scene.get("review", {}).get("approvedByPrimary") is not True:
        reasons.append("Schema1 and primary layer approval required.")
    if not isinstance(scene.get("id"), str) or not re.fullmatch(r"[a-z0-9-]+", scene["id"]):
        reasons.append("Invalid registration id.")
    for layer in ["mother", "background", "figure", "mask", "shadow", "foreground"]:
        name = scene.get(layer)
        if name and (not isinstance(name, str) or not re.fullmatch(r"[-a-z0-9]+\.png", name)):
            reasons.append(f"Invalid {layer} basename.")
    if not all(finite(scene.get(key)) and scene[key] > 0 for key in ["width", "height"]):
        reasons.append("Positive finite canvas required.")
    for key, length in [("seat", 2), ("ground", 2), ("bodyBounds", 4)]:
        value = scene.get(key)
        if not isinstance(value, list) or len(value) != length or not all(unit(item) for item in value):
            reasons.append(f"Invalid normalized {key}.")
    bounds = scene.get("bodyBounds")
    if isinstance(bounds, list) and len(bounds) == 4 and all(unit(value) for value in bounds):
        if bounds[0] >= bounds[2] or bounds[1] >= bounds[3]:
            reasons.append("Body bounds must have positive area.")
    if not unit(scene.get("safeTextBoundary")):
        reasons.append("Invalid safe text boundary.")
    if not all(finite(scene.get(key)) for key in ["travel", "slope", "perspective"]) or scene.get("travel", -1) < 0:
        reasons.append("Invalid support travel calibration.")
    elif scene["travel"] == 0 and scene["perspective"] != 0:
        reasons.append("Fixed pose requires zero perspective.")
    if not isinstance(scene.get("hitPolygon"), str) or not re.fullmatch(r"[\d.%,\s]+", scene["hitPolygon"]):
        reasons.append("Invalid hit polygon.")
    if scene.get("support") not in ["window-seat", "desk-chair", "sofa", "floor"] or type(scene.get("contourComplete")) is not bool:
        reasons.append("Explicit support and contour completeness required.")
    if scene.get("support") == "floor":
        if scene.get("floorContact") not in ["feet", "kneeling"]:
            reasons.append("Floor support requires an explicit feet or kneeling contact.")
        if any(scene.get(key) != 0 for key in ["travel", "slope", "perspective"]):
            reasons.append("Floor pose remains fixed at its original contact pivot.")
        if scene.get("seat") != scene.get("ground"):
            reasons.append("Floor pivot must coincide with the calibrated ground contact.")
    elif "floorContact" in scene:
        reasons.append("Floor contact is only valid for a floor-supported pose.")
    mode = scene.get("contactShadow", {}).get("mode")
    if mode not in ["included", "separate", "none"] or (mode == "separate" and not scene.get("shadow")):
        reasons.append("Invalid contact shadow registration.")
    if scene.get("light") != LIGHTS.get(scene.get("palette")):
        reasons.append("Scene light differs from its matrix theme.")
    return reasons


reviews = {}
for review_name in ["primary-prototype-reviews.json", "primary-other-mother-reviews.json"]:
    review_path = HERE / review_name
    document = read(review_path)
    if not isinstance(document, dict) or document.get("reviewer") != "primary-agent":
        continue
    for index, entry in enumerate(document.get("entries", [])):
        if not isinstance(entry, dict) or not entry.get("file"):
            continue
        reviews[(HERE / entry["file"]).resolve()] = {
            "status": "approved" if entry.get("approvedForExtraction") is True else "rejected",
            "record": relative(review_path), "entry": index,
            "reviewSha256": entry.get("sha256"), "observed": entry.get("observed"),
            "promptReviewed": entry.get("promptReviewed") is True,
            "reviewPromptSha256": entry.get("promptSha256"),
        }


direct_reviews = {}
direct_review_path = CURRENT_SOURCES / "primary-direct-review.json"
direct_review_summary = {"record": relative(direct_review_path), "entries": 0, "currentFilesVerified": 0,
    "acceptedMotherEntries": 0, "otherScopeEntries": 0, "runtimeAcceptanceAuthority": False}
if direct_review_path.is_file():
    document = read(direct_review_path)
    if isinstance(document, dict) and document.get("reviewer") == "primary-agent":
        direct_review_summary["sha256"] = digest(direct_review_path)
        for index, item in enumerate(document.get("entries", [])):
            if not isinstance(item, dict):
                continue
            direct_review_summary["entries"] += 1
            path = record_path(direct_review_path, item.get("file"))
            review_sha = item.get("sha256")
            if not path or not path.is_file() or not isinstance(review_sha, str) or digest(path) != review_sha.lower():
                NOTES.append({"file": relative(direct_review_path), "entry": index,
                    "pendingReason": "Direct primary review file or SHA does not match a current repository file."})
                continue
            direct_review_summary["currentFilesVerified"] += 1
            # Backgrounds and interface relationships are not character mothers.
            # This record never signs a prompt, a layer or a runtime interaction.
            if item.get("kind") != "mother":
                direct_review_summary["otherScopeEntries"] += 1
                continue
            decision = item.get("decision", "")
            accepted = decision == "accepted-mother-only"
            rejected = isinstance(decision, str) and decision.startswith(("rejected", "returned"))
            if not accepted and not rejected:
                continue
            direct_review_summary["acceptedMotherEntries"] += int(accepted)
            direct_reviews[path] = {"status": "approved" if accepted else "rejected",
                "record": relative(direct_review_path), "entry": index, "reviewSha256": review_sha,
                "observed": item.get("scope"), "decision": decision, "scope": "mother-only"}


def mother_records(document):
    if matrix_identity(document):
        yield document, None
    for index, item in enumerate(document.get("entries", [])):
        if isinstance(item, dict) and matrix_identity(item):
            yield {"inputs": [document["soleInputForEveryCall"]] if document.get("soleInputForEveryCall") else [], **item}, index


sources = {}
source_paths = sorted({path for root in SOURCE_ROOTS for pattern in ("*.json", "*.source") for path in root.rglob(pattern)})
for source_path in source_paths:
    if source_path.name.endswith(".scene.json") or source_path.name == "matrix-coverage.json":
        continue
    source = read(source_path)
    if not isinstance(source, dict):
        continue
    for source, source_index in mother_records(source):
        character, activity, theme = matrix_identity(source)
        output = source.get("output") or {"file": source.get("asset") or source.get("file") or source.get("outputPath"), "sha256": source.get("outputSha256") or source.get("sha256")}
        if not isinstance(output, dict):
            continue
        filename = output.get("file") or output.get("path") or source.get("asset")
        prompt_declaration = source.get("prompt")
        declared_prompt_sha = source.get("promptSha256") or source.get("promptFileSha256") or output.get("promptSha256") or (prompt_declaration.get("sha256") if isinstance(prompt_declaration, dict) else None)
        prompt_name = source.get("promptFile") or prompt_declaration
        if isinstance(prompt_name, dict):
            prompt_name = prompt_name.get("file")
        if not isinstance(filename, str) or not isinstance(prompt_name, str) or len(prompt_name) > 500:
            continue
        image_path, prompt_path = record_path(source_path, filename), record_path(source_path, prompt_name)
        if not image_path or not prompt_path or not image_path.is_file() or not prompt_path.is_file():
            NOTES.append({"file": relative(source_path), "pendingReason": "Declared mother image or prompt is missing from the repository."})
            continue
        if "mother" not in image_path.stem and not (character == "sakiko" and activity == "planning" and image_path.name == "sakiko-planning-apricot.png"):
            continue
        actual_sha = digest(image_path)
        if output.get("sha256") and output["sha256"].lower() != actual_sha:
            NOTES.append({"file": relative(source_path), "pendingReason": "Source output hash differs from current image bytes."})
            continue
        with Image.open(image_path) as artwork:
            dimensions = list(artwork.size)
        parent_inputs = source.get("inputs", [])
        if not parent_inputs and isinstance(source.get("input"), dict):
            parent_inputs = [source["input"]]
        inputs = []
        for item in parent_inputs:
            name = item.get("file") or item.get("path") or item.get("asset") if isinstance(item, dict) else None
            if name:
                input_path = record_path(source_path, name)
                actual_input_sha = digest(input_path) if input_path and input_path.is_file() else None
                declared_input_sha = item.get("sha256")
                inputs.append({"file": relative(input_path) if input_path else None, "sha256": declared_input_sha,
                    "actualSha256": actual_input_sha, "role": item.get("role"),
                    "status": "verified" if actual_input_sha and declared_input_sha and actual_input_sha == declared_input_sha.lower() else "pending"})
        prompt_primary = reviews.get(image_path, {"status": "pending", "record": None, "entry": None, "reviewSha256": None})
        direct_primary = direct_reviews.get(image_path)
        primary = {**direct_primary, **({"priorReview": prompt_primary} if prompt_primary.get("record") else {})} if direct_primary else prompt_primary
        actual_prompt_sha = digest(prompt_path)
        prompt_source_status = "verified" if declared_prompt_sha and declared_prompt_sha.lower() == actual_prompt_sha else "pending" if declared_prompt_sha else "not-hash-recorded"
        if prompt_source_status == "pending":
            NOTES.append({"file": relative(source_path), "pendingReason": "Source prompt hash differs from current prompt bytes."})
        prompt_reviewed = prompt_primary.get("promptReviewed") is True
        reviewed_prompt_sha = prompt_primary.get("reviewPromptSha256")
        prompt_review = {"status": "approved" if prompt_reviewed else "pending", "record": prompt_primary.get("record"),
            "entry": prompt_primary.get("entry"), "currentPromptSha256": actual_prompt_sha, "reviewPromptSha256": reviewed_prompt_sha}
        if reviewed_prompt_sha and reviewed_prompt_sha.lower() != actual_prompt_sha:
            prompt_review["status"] = "pending"
            prompt_review["pendingReason"] = "Primary prompt review hash does not match current prompt bytes."
        if prompt_source_status == "pending":
            prompt_review["status"] = "pending"
            prompt_review["pendingReason"] = "Actual submitted prompt provenance needs repair."
        designer_review = source.get("designerReview", {})
        statuses = [source.get("status"), source.get("designerStatus"), source.get("review", {}).get("designerStatus"),
                    designer_review.get("status"), designer_review.get("independentLightAxisReview", {}).get("status")]
        decision_text = " ".join(str(value).lower() for value in statuses if value)
        source_rejected = any(marker in decision_text for marker in ["rejected", "returned", "not_eligible", "not eligible", "needs-redraw", "needs_redraw"])
        replaced_by = source.get("replacedBy") or source.get("supersededBy") or designer_review.get("independentLightAxisReview", {}).get("replacementOutput")
        rejected = primary["status"] == "rejected" or source.get("designerRejected") is True or "rejected" in image_path.name or source_rejected or bool(replaced_by)
        if primary.get("reviewSha256") and primary["reviewSha256"].lower() != actual_sha:
            primary = {"status": "pending", "record": primary["record"], "entry": primary["entry"], "reviewSha256": primary["reviewSha256"], "pendingReason": "Primary review hash does not match current bytes."}
            rejected = True
        entry = {
            "file": relative(image_path), "sha256": actual_sha, "canvas": dimensions,
            "originalOutputBasename": output.get("originalOutputBasename") or source.get("originalOutputBasename"),
            "source": relative(source_path), "sourceEntry": source_index, "prompt": relative(prompt_path), "promptSha256": actual_prompt_sha,
            "sourcePromptSha256": declared_prompt_sha, "promptSourceStatus": prompt_source_status,
            "parentInputs": inputs, "executionId": source.get("executionId") or source.get("generationId") or output.get("executionId"),
            "primaryReview": primary, "primaryPromptReview": prompt_review, "rejected": rejected,
            "sourceDisposition": "superseded" if replaced_by else "rejected" if source_rejected or source.get("designerRejected") is True else "candidate",
            "replacedBy": relative(record_path(source_path, replaced_by)) if isinstance(replaced_by, str) and record_path(source_path, replaced_by) else None,
            "candidateVersion": max([int(value) for value in re.findall(r"(?:^|[-_])v(\d+)(?=[-_.]|$)", output.get("originalOutputBasename") or image_path.name)] or [1]),
            "recordedAt": str(output.get("recordedAt") or source.get("generatedAtUtc") or source.get("createdAtUtc") or source.get("recordedAt") or ""),
        }
        key = f"{character}/{activity}/{theme}"
        by_image = sources.setdefault(key, {})
        current = by_image.get(image_path.resolve())
        if current is None or len(entry["parentInputs"]) > len(current["parentInputs"]):
            by_image[image_path.resolve()] = entry

scenes = {}
for folder in [*SOURCE_ROOTS, RUNTIME]:
    for path in sorted(folder.rglob("*.scene.json")):
        scene = read(path)
        if not isinstance(scene, dict):
            continue
        key = f"{scene.get('character')}/{scene.get('activity')}/{scene.get('palette')}"
        mother_path = path.parent / scene.get("mother", "")
        if not mother_path.is_file():
            continue
        in_runtime = path.parent == RUNTIME
        artwork_files = []
        for layer in ["mother", "background", "figure", "mask", "shadow", "foreground"]:
            name = scene.get(layer)
            if not name:
                continue
            layer_path = path.parent / name
            exists = layer_path.is_file() and relative(layer_path) is not None
            dimensions = None
            if exists:
                with Image.open(layer_path) as image:
                    dimensions = list(image.size)
            artwork_files.append({"layer": layer, "file": relative(layer_path),
                "sha256": digest(layer_path) if exists else None, "canvas": dimensions,
                "status": "present" if exists and dimensions == [scene.get("width"), scene.get("height")] else "pending"})
        complete_files = bool(scene.get("background") and (scene.get("figure") or scene.get("mask"))) and all(item["status"] == "present" for item in artwork_files)
        if scene.get("contactShadow", {}).get("mode") == "separate" and not scene.get("shadow"):
            complete_files = False
        scene_sha = digest(path)
        canonical_contract = {name: scene[name] for name in SCENE_CONTRACT_KEYS if name in scene}
        used_layers = {"mother", "background", "figure" if scene.get("figure") else "mask", "foreground"}
        if scene.get("figure"):
            canonical_contract.pop("mask", None)
        if scene.get("contactShadow", {}).get("mode") == "separate":
            used_layers.add("shadow")
        else:
            canonical_contract.pop("shadow", None)
        bundle = {"sceneContract": canonical_contract, "artwork": {item["layer"]: item["sha256"] for item in artwork_files if item["layer"] in used_layers}}
        bundle_sha = hashlib.sha256(json.dumps(bundle, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
        reasons = registration_reasons(scene)
        candidate_identity = " ".join(str(value) for value in [path.name, scene.get("production", ""), scene.get("parameters", "")])
        candidate_version = max([int(value) for value in re.findall(r"(?:^|[-_])v(\d+)(?=[-_.]|$)", candidate_identity)] or [1])
        candidate_state = " ".join(str(value).lower() for value in [scene.get("status"), scene.get("review", {}).get("layerReview"), scene.get("review", {}).get("producerStatus")] if value)
        scenes.setdefault(key, []).append({"file": relative(path), "sha256": scene_sha, "id": scene.get("id"),
            "motherSha256": digest(mother_path), "approvedByPrimary": scene.get("review", {}).get("approvedByPrimary") is True,
            "inRuntimeDirectory": in_runtime, "artworkFilesComplete": complete_files,
            "registrationEligible": not reasons and complete_files, "pendingRegistrationReasons": reasons,
            "candidateVersion": candidate_version,
            "candidateRejected": any(marker in candidate_state for marker in ["rejected", "superseded", "not-eligible"]),
            "bundleSha256": bundle_sha, "bundleContract": "Canonical consumed scene fields (review/production metadata excluded) plus used PNG byte hashes; sorted JSON keys and compact UTF-8, no formatting dependence.",
            "artwork": artwork_files, "review": scene.get("review", {})})

runtime_reviews = {}
runtime_document = HERE / "primary-runtime-reviews.json"
if runtime_document.is_file():
    data = read(runtime_document)
    if isinstance(data, dict) and data.get("reviewer") == "primary-agent":
        for index, item in enumerate(data.get("entries", [])):
            if item.get("key") and item.get("runtimeAccepted") is True and item.get("evidence"):
                runtime_reviews[item["key"]] = {"record": relative(runtime_document), "entry": index, **item}

cells = []
for character in CHARACTERS:
    for activity in ACTIVITIES:
        for theme in THEMES:
            key = f"{character}/{activity}/{theme}"
            candidates = list(sources.get(key, {}).values())
            active = [item for item in candidates if not item["rejected"]]
            approved = [item for item in active if item["primaryReview"]["status"] == "approved"]
            pool = approved or active
            selected = max(pool, key=lambda item: (item["candidateVersion"], item["recordedAt"], item["file"])) if pool else None
            current_sha = selected["sha256"] if selected else None
            matching_scenes = [item for item in scenes.get(key, []) if item["motherSha256"] == current_sha]
            admitted = [item for item in matching_scenes if item["inRuntimeDirectory"] and item["registrationEligible"]]
            slot_registrations = [item for item in scenes.get(key, []) if item["inRuntimeDirectory"] and item["registrationEligible"]]
            duplicate_slot = len(slot_registrations) > 1
            if duplicate_slot:
                admitted = []
                NOTES.append({"file": key, "pendingReason": "Multiple approved registrations share this slot; resolve the actual first-match registration before counting admission."})
            candidate_scenes = [item for item in matching_scenes if not item["candidateRejected"]]
            scene = admitted[0] if admitted else max(candidate_scenes, key=lambda item: (item["artworkFilesComplete"], item["candidateVersion"], item["file"])) if candidate_scenes else None
            runtime = runtime_reviews.get(key)
            recorded_runtime = runtime
            if runtime and (runtime.get("motherSha256") != current_sha or not admitted or runtime.get("bundleSha256") != admitted[0]["bundleSha256"] or runtime.get("stageEngineSha256") != stage_engine_sha):
                runtime = None
            cells.append({
                "key": key, "character": character, "activity": activity, "theme": theme, "light": LIGHTS[theme],
                "generatedMother": {"status": "generated" if selected else "pending-replacement" if candidates else "pending", "asset": selected},
                "primaryMotherReview": selected["primaryReview"] if selected else {"status": "pending", "record": None},
                "primaryPromptReview": selected["primaryPromptReview"] if selected else {"status": "pending", "record": None},
                "layers": {"status": "pending" if duplicate_slot else "admitted" if admitted else "candidate" if scene else "pending", "scene": scene,
                           "pendingReason": "Duplicate approved runtime slot." if duplicate_slot else None,
                           "calibration": scene["file"] if scene else None,
                           "codeUse": ["src/renderer/companion-scenes.tsx: registrationFiles + companionSceneArtwork + CompanionSceneStage", "src/renderer/companion.tsx: selected character/activity/theme"] if admitted else []},
                "actualRuntime": {"status": "accepted" if runtime else "pending", "review": runtime, "currentStageEngineSha256": stage_engine_sha,
                    "priorReview": recorded_runtime if recorded_runtime and not runtime else None,
                    "pendingReason": "Recorded runtime evidence does not bind the current admitted mother/scene/artwork bundle and Stage engine." if recorded_runtime and not runtime else None},
                "otherCandidates": [{"file": item["file"], "sha256": item["sha256"], "source": item["source"], "primaryReview": item["primaryReview"], "rejected": item["rejected"], "sourceDisposition": item["sourceDisposition"], "replacedBy": item["replacedBy"]} for item in candidates if item is not selected],
            })

catalog = {
    "schemaVersion": 1, "recordType": "companion-matrix-production-catalog", "generatedAtUtc": datetime.now(timezone.utc).isoformat(),
    "expectedCells": EXPECTED_CELLS, "dimensions": {"characters": CHARACTERS, "activities": ACTIVITIES, "themes": THEMES},
    "sourceRoots": [relative(root) for root in SOURCE_ROOTS], "primaryDirectReview": direct_review_summary,
    "authority": "Generated images/actual prompts are indexed by source bytes across the original eight activities plus resume. Existing source and primary prompt reviews remain independent. The current direct primary record can approve only its exact SHA-matched mother entries; background/UI relationship entries and source-author approval text never sign a mother, prompt, layer or runtime. Only valid primary-approved runtime-directory scenes admit layers. Runtime stays pending until a primary-runtime-reviews entry binds current mother SHA, exact scene/artwork bundleSha256, current stageEngineSha256 and real evidence. Rejected or explicitly replaced candidates and fallback never count. Current candidate selection prefers primary-approved, then declared numeric version/recorded time/path, never filesystem mtime.",
    "stageEngine": {"sha256": stage_engine_sha, "files": stage_engine_files, "hashContract": "SHA-256 of the compact sorted UTF-8 JSON file-path to file-byte-SHA-256 map.", "scope": "Companion Scene registration/Stage, its CSS and spring motion implementation. Any change requires renewed runtime review; asset layer admission is independent."},
    "registrationContract": {"file": "src/renderer/companion-scenes.tsx", "sha256": digest(REPO / "src/renderer/companion-scenes.tsx"), "scope": "Registration shape, registered PNG presence/full-canvas dimensions and matrix palette/light consistency; this is asset metadata, not a substitute runtime implementation."},
    "counts": {"generatedCurrentMothers": sum(cell["generatedMother"]["status"] == "generated" for cell in cells),
               "primaryApprovedMothers": sum(cell["primaryMotherReview"]["status"] == "approved" for cell in cells),
               "primaryReviewedPrompts": sum(cell["primaryPromptReview"]["status"] == "approved" for cell in cells),
               "layersAdmitted": sum(cell["layers"]["status"] == "admitted" for cell in cells),
               "actualRuntimeAccepted": sum(cell["actualRuntime"]["status"] == "accepted" for cell in cells)},
    "pendingSourceRecords": NOTES, "cells": cells,
}
(HERE / "matrix-coverage.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
print(json.dumps({"expectedCells": EXPECTED_CELLS, "actualCells": len(cells), "counts": catalog["counts"], "pendingSourceRecords": len(NOTES),
    "primaryDirectReview": direct_review_summary}, ensure_ascii=True))
