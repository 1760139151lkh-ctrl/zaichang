"""Build the source asset navigation from current bytes and existing review facts.

Artwork existence, exact-mother extraction permission, layer approval and runtime
acceptance remain separate. This does not grant or modify review authority.
"""
import hashlib
import json
from pathlib import Path


root = Path(__file__).resolve().parent
sha = lambda p: hashlib.sha256(p.read_bytes()).hexdigest()
mother_index_path = root / "mother-candidates-all-themes-index.json"
mother_index = json.loads(mother_index_path.read_text(encoding="utf-8"))
primary_path = root.parent / "primary-other-mother-reviews.json"
primary = json.loads(primary_path.read_text(encoding="utf-8"))
primary_by_mother = {entry["file"]: entry for entry in primary["entries"]}
entries = []
for source_entry in mother_index["entries"]:
    mother = root / source_entry["mother"]
    mother_sha = sha(mother)
    source_path = root / source_entry["source"]
    source = json.loads(source_path.read_text(encoding="utf-8"))
    prompt = root / source["prompt"]
    prompt_sha = sha(prompt)
    review = primary_by_mother.get("soyo-taki/" + mother.name, {})
    exact_permission = bool(review.get("approvedForExtraction") and review.get("promptReviewed")
                            and review.get("sha256") == mother_sha
                            and review.get("promptSha256") == prompt_sha)
    stem = "-".join(source_entry[key] for key in ("character", "activity", "palette"))
    scene_path = root / (stem + ".scene.json")
    layer = None
    if scene_path.exists():
        scene = json.loads(scene_path.read_text(encoding="utf-8"))
        files = []
        for role in ("background", "figure", "mask", "shadow"):
            path = root / scene[role]
            files.append({"role": role, "file": path.name, "sha256": sha(path), "bytes": path.stat().st_size})
        layer = {"scene": scene_path.name, "sceneSha256": sha(scene_path),
                 "motherMatchesCurrentCell": scene["mother"] == mother.name,
                 "files": files, "production": scene["production"],
                 "primaryApproved": scene["review"].get("approvedByPrimary", False),
                 "runtimeAccepted": scene["review"].get("runtimeAccepted", False),
                 "producerVisualReview": scene["review"].get("producerVisualReview", "not recorded in scene")}
    entries.append({"character": source_entry["character"], "activity": source_entry["activity"],
                    "palette": source_entry["palette"], "light": source_entry.get("light", source.get("light")),
                    "mother": mother.name, "motherSha256": mother_sha,
                    "source": source_path.name, "sourceSha256": sha(source_path),
                    "actualPrompt": prompt.name, "actualPromptSha256": prompt_sha,
                    "primaryMotherPermission": exact_permission,
                    "primaryMotherRecord": "../primary-other-mother-reviews.json",
                    "layerCandidate": layer})
summary = {"expectedCells": 64, "currentFullMotherFiles": len(entries),
           "primaryMotherPermission": sum(entry["primaryMotherPermission"] for entry in entries),
           "sourceLayerCandidates": sum(entry["layerCandidate"] is not None for entry in entries),
           "primaryApprovedLayers": sum(bool(entry["layerCandidate"] and entry["layerCandidate"]["primaryApproved"]) for entry in entries),
           "runtimeAccepted": sum(bool(entry["layerCandidate"] and entry["layerCandidate"]["runtimeAccepted"]) for entry in entries)}
index = {"recordType": "character-matrix-source-layer-navigation", "summary": summary,
         "meaning": "Current source bytes and review facts only; artwork existence is not runtime scenario coverage.",
         "primaryMotherRecordSha256": sha(primary_path), "entries": entries}
(root / "layer-candidates-index.json").write_text(json.dumps(index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
mother_index["layerCandidates"] = [entry["layerCandidate"]["scene"] for entry in entries if entry["layerCandidate"]]
mother_index["sourceLayerNavigation"] = "layer-candidates-index.json"
mother_index_path.write_text(json.dumps(mother_index, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(json.dumps(summary))
