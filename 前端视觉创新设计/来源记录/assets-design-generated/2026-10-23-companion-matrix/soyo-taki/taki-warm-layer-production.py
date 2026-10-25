"""Produce original-coordinate Taki source-layer assets, never product state/tests.

The six mothers are already primary approved. This script owns only listening,
rest and attention; the other three activities are independently delegated.
Built-in Imagegen calls are separate and their exact prompts/results recorded.
"""
import argparse
import hashlib
import json
import runpy
import shutil
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent
REVIEW = ROOT.parents[3] / "仅本机/2026-10-24-taki-warm-layer-review"
ACTIVITIES = {"listening": 1, "rest": 1, "attention": 2}


def digest(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def read(path): return json.loads(path.read_text(encoding="utf-8"))
def write(path, value): path.write_text(json.dumps(value, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")


def prepare():
    navigation = read(ROOT / "mother-candidates-index.json")
    mothers = next(e for e in navigation["characters"] if e["id"] == "taki")["mothers"]
    for activity in ACTIVITIES:
        entry = next(e for e in mothers if e["activity"] == activity)
        mother = ROOT / entry["file"]
        if digest(mother) != entry["sha256"]: raise ValueError("Approved original mother changed")
        prefix = f"taki-{activity}-apricot"
        room_note = {
            "listening": "There is EXACTLY ONE empty brown loafer on the floor at the RIGHT below the bench around x1260..1320,y720..770. Preserve that ONE empty shoe and its original location. Remove the socked raised foot on the cushion and the worn floor loafer at LEFT with her body; do not leave a second empty shoe or add a pair.",
            "rest": "Remove the entire turned-back person including both worn brown loafers. Restore the linen bench cushion, wooden bench front and floor behind her original body/feet.",
            "attention": "Preserve the stationary ivory folded card on the BENCH cushion near x1200,y550, and the flat paper on the desk. Remove only the person and the PENCIL held by her hand; the paper/card/chair/desk/cup/book/lamp remain room objects. Preserve this exact chair orientation and position; only reconstruct formerly covered chair surfaces."
        }[activity]
        bg = f"""Use case: precise-object-edit.
Asset type: exact same-scene clean empty-background layer, 1536 x 1024.
Image 1 is the sole edit target: the correct complete Taki {activity} apricot mother. Remove only the ONE anime person, all her hair/head/face/uniform/hands/limbs/worn footwear and held actor props, and her contact/cast shadows. {room_note}
Preserve the exact original full 1536 x 1024 canvas, distant camera, perspective and crop. Preserve ALL room pixels/objects outside the formerly occupied area: all four window corners and mullions, lake/city/trees/sky, apricot morning light, room/window shadows, shelves/plants/art/small rear desk/chair, working desk/lamp/cup/closed book, actual desk chair, window bench/linen cushion/blue pillows/ivory throw, clear floor/rug. Reconstruct only the formerly occluded room. No person, body/hair/foot ghost, changed furniture geometry, shifted lighting, altered skyline, extra object, crop, zoom, border, text, UI or watermark. Opaque RGB empty room, no transparency.
"""
        actor_note = {
            "listening": "The person includes ONE complete raised DARK-SOCKED foot on the cushion and ONE complete worn brown loafer on the lowered floor foot. The ONE empty brown loafer at right below the bench is BLACK room background, never part of the person.",
            "rest": "The person includes both complete worn brown loafers, the two supported legs, and both hands. There are no held props.",
            "attention": "The held PENCIL belongs to the person and must be white. The stationary flat desk paper, desk/chair and folded bench card are BLACK room background. Keep the exact genuine chair/table occlusion of her body; never complete any hidden anatomy."
        }[activity]
        mask = f"""Use case: background-extraction.
Create only a precise FULL-CANVAS monochrome alpha matte for image 1, the correct original Taki {activity} room mother. Retain EXACTLY the original 1536 x 1024 canvas and EVERY subject contour at the SAME original pixel coordinates, identical scale, pose, furniture occlusion and perspective. Never recenter, enlarge, shift, smooth into a different body, or redraw the subject.
Pure white inside every visible person pixel including all original long dark-purple hair/fine strands, face, tan sailor uniform/white collar/red bow/gold buttons, hands, legs, dark socks and worn footwear. {actor_note}
Pure BLACK for every room/window/sky/mullion/wood/cushion/pillow/floor/cast shadow pixel and genuine air holes between hair, arms, clothing and legs. Bright skin, white collar and gold buttons must remain solid WHITE, not internal holes. This is coordinate-locked segmentation of the exact existing image, not a new portrait/sticker/person. No subject gray shading, invented hair, furniture, words, border, crop or watermark. The original same full-frame placement is the main requirement.
"""
        for kind, prompt in [("background", bg), ("mask", mask)]:
            prompt_path = ROOT / f"{prefix}-{kind}-prompt-v1.txt"
            if prompt_path.exists() and prompt_path.read_text(encoding="utf-8") != prompt:
                raise ValueError("Preserve actual existing prompt; create a new version for a changed call")
            if not prompt_path.exists(): prompt_path.write_text(prompt, encoding="utf-8")
            record_path = ROOT / f"{prefix}-{kind}-generation-v1.json"
            if record_path.exists(): continue
            write(record_path, {"recordType":"built-in-image-generation-source", "tool":"image_gen.imagegen",
                "operation":"precise-object-edit" if kind=="background" else "monochrome original-coordinate alpha matte",
                "input":mother.name, "inputSha256":digest(mother), "inputRole":"sole correct primary-approved complete mother",
                "prompt":prompt_path.name,"promptFileSha256":digest(prompt_path),"output":None,
                "producerReview":"pending","primaryReview":"pending","runtimeAccepted":False})


def register(activity, kind, source):
    prefix=f"taki-{activity}-apricot"
    target=ROOT/f"{prefix}-{kind}-candidate-v1.png"
    if target.exists(): raise FileExistsError(target)
    shutil.copyfile(source,target)
    record_path=ROOT/f"{prefix}-{kind}-generation-v1.json"
    record=read(record_path)
    parts=Path(source).parts
    idx=next((i for i,p in enumerate(parts) if p=="generated_images"),None)
    record.update({"output":target.name,"outputSha256":digest(target),"bytes":target.stat().st_size,
        "canvas":list(Image.open(target).size),"toolDefaultOutput":"/".join(parts[idx:]) if idx is not None else Path(source).name,
        "executionId":Path(source).stem})
    write(record_path,record)
    print(json.dumps({"file":target.name,"sha256":digest(target)}))


def refine(config_path):
    config_path=Path(config_path).resolve()
    config=read(config_path)
    mother_path=ROOT/config["mother"]; source_path=ROOT/config["sourceAlpha"]
    if digest(mother_path)!=config["motherSha256"] or digest(source_path)!=config["sourceAlphaSha256"]:
        raise ValueError("Original source input bytes changed")
    mother=Image.open(mother_path).convert("RGB"); source=Image.open(source_path).convert("RGBA")
    if mother.size!=source.size or mother.size!=(1536,1024): raise ValueError("Full original canvas required")
    alpha=np.asarray(source.convert("L") if config.get("sourceAlphaMode")=="luminance" else source.getchannel("A")).copy()
    if config.get("inputAlphaLow") is not None: alpha[alpha<=config["inputAlphaLow"]]=0
    if config.get("inputAlphaHigh") is not None: alpha[alpha>=config["inputAlphaHigh"]]=255
    rgb=np.asarray(mother).astype("int16")
    if config.get("edgeDifference"):
        from scipy.ndimage import distance_transform_edt
        item=config["edgeDifference"]; background_path=ROOT/item["background"]
        if digest(background_path)!=item["backgroundSha256"]: raise ValueError("Matching background bytes changed")
        difference=np.max(np.abs(rgb-np.asarray(Image.open(background_path).convert("RGB")).astype("int16")),axis=2)
        edge=distance_transform_edt(alpha>=100)<=item["edgePixels"]
        confidence=np.clip((difference-item["differenceLow"])/(item["differenceHigh"]-item["differenceLow"]),0,1)
        alpha[edge]=np.rint(alpha[edge]*confidence[edge]).astype("uint8")
    for key,value in [("originalPixelInclusions",255),("explicitRoomExclusions",0)]:
        for polygon in config.get(key,[]):
            region=Image.new("L",mother.size); ImageDraw.Draw(region).polygon([tuple(p) for p in polygon],fill=255)
            alpha[np.asarray(region)>0]=value
    for polygon in config.get("softOriginalPixelInclusions",[]):
        left=max(0,min(p[0] for p in polygon)-2); top=max(0,min(p[1] for p in polygon)-2)
        right=min(1536,max(p[0] for p in polygon)+3); bottom=min(1024,max(p[1] for p in polygon)+3)
        shape=Image.new("L",((right-left)*4,(bottom-top)*4))
        ImageDraw.Draw(shape).polygon([((x-left)*4,(y-top)*4) for x,y in polygon],fill=255)
        shape=shape.resize((right-left,bottom-top),Image.Resampling.LANCZOS).filter(ImageFilter.GaussianBlur(.2))
        alpha[top:bottom,left:right]=np.maximum(alpha[top:bottom,left:right],np.asarray(shape))
    if config.get("fillInteriorHolesWithin"):
        from scipy.ndimage import binary_fill_holes
        filled=binary_fill_holes(alpha>0)
        for l,t,r,b in config["fillInteriorHolesWithin"]:
            patch=alpha[t:b,l:r]; patch[filled[t:b,l:r]]=255
    if config.get("minimumVisibleAlpha"): alpha[alpha<config["minimumVisibleAlpha"]]=0
    if config.get("removeIslandsSmallerThan"):
        from scipy.ndimage import label
        components,_=label(alpha>0); sizes=np.bincount(components.ravel())
        alpha[sizes[components]<config["removeIslandsSmallerThan"]]=0
    output=ROOT/config["output"]; Image.fromarray(alpha,"L").save(output)
    write(ROOT/config["record"],{"recordType":"deterministic-original-alpha-calibration","processor":Path(__file__).name,
        "processorSha256":digest(Path(__file__)),"parameters":config_path.name,"parametersSha256":digest(config_path),
        "mother":mother_path.name,"motherSha256":digest(mother_path),"sourceAlpha":source_path.name,"sourceAlphaSha256":digest(source_path),
        "output":output.name,"outputSha256":digest(output),"geometryTransform":"identity","originalRgbModified":False,
        "review":{"primary":"pending","runtimeAccepted":False}})
    print(json.dumps({"output":output.name,"alphaBounds":Image.fromarray(alpha).getbbox()}))


def layers(activity, version):
    prefix=f"taki-{activity}-apricot"; version=int(version)
    config_path=ROOT/f"{prefix}-layer-parameters-v{version}.json"
    config=read(config_path)
    runpy.run_path(str(ROOT.parent/"extract-scene-layers.py"))["prepare"](config_path)
    figure=Image.open(ROOT/config["figure"]).convert("RGBA")
    background=Image.open(ROOT/config["background"]).convert("RGBA")
    shadow=Image.open(ROOT/config["shadow"]).convert("RGBA")
    REVIEW.mkdir(parents=True,exist_ok=True)
    bounds=figure.getchannel("A").getbbox()
    source_rect=(max(0,bounds[0]-15),max(0,bounds[1]-15),min(1536,bounds[2]+15),min(1024,bounds[3]+15))
    Image.open(ROOT/config["mother"]).convert("RGB").crop(source_rect).save(REVIEW/f"taki-{activity}-v{version}-original-detail.png")
    for name,color in [("light",(248,246,240,255)),("dark",(24,31,40,255))]:
        canvas=Image.new("RGBA",figure.size,color); canvas.alpha_composite(figure)
        canvas.convert("RGB").save(REVIEW/f"taki-{activity}-v{version}-{name}.png")
        canvas.crop(source_rect).convert("RGB").save(REVIEW/f"taki-{activity}-v{version}-{name}-detail.png")
    room=background.copy(); room.alpha_composite(shadow); room.alpha_composite(figure)
    room.convert("RGB").save(REVIEW/f"taki-{activity}-v{version}-room.png")
    background.convert("RGB").save(REVIEW/f"taki-{activity}-v{version}-empty.png")
    calibration=read(ROOT/f"{prefix}-calibration.json")
    write(ROOT/f"{prefix}.scene.json",{"schemaVersion":1,"id":f"{prefix}-room4","character":"taki","activity":activity,
        "light":"morning","palette":"apricot","width":1536,"height":1024,"mother":config["mother"],
        **{key:config[key] for key in ["background","figure","mask","shadow"]},
        "seat":[calibration["seat"][0]/1536,calibration["seat"][1]/1024],"ground":[calibration["ground"][0]/1536,calibration["ground"][1]/1024],
        "bodyBounds":[bounds[0]/1536,bounds[1]/1024,bounds[2]/1536,bounds[3]/1024],
        "safeTextBoundary":calibration["safeTextBoundary"],"support":calibration["support"],"contactShadow":{"mode":"separate"},
        "contourComplete":calibration["contourComplete"],"hitPolygon":calibration["hitPolygon"],"travel":0,"slope":0,"perspective":0,
        "production":config["record"],"review":{"approvedByPrimary":False,"runtimeAccepted":False,
            "motherApprovalRecord":"../primary-other-mother-reviews.json","layerReview":"pending",
            "producerNote":calibration["producerNote"],"runtimeReviewRecord":"前端视觉创新设计/来源记录/assets-design-generated/2026-10-23-companion-matrix/primary-runtime-reviews.json"}})


if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation",choices=["prepare","register","refine","layers"])
    parser.add_argument("activity",nargs="?"); parser.add_argument("kind",nargs="?"); parser.add_argument("file",nargs="?")
    args=parser.parse_args()
    if args.operation=="prepare": prepare()
    elif args.operation=="register": register(args.activity,args.kind,args.file)
    elif args.operation=="refine": refine(args.activity)
    else: layers(args.activity,args.kind)
