import json, struct, hashlib, sys
from pathlib import Path

root = Path(sys.argv[1] if len(sys.argv) > 1 else "artifacts/asset-tools/build-edits")
blob = Path("assets/outpost-game/builds/builds.glb").read_bytes()
gltf = json.loads(blob[20 : 20 + struct.unpack_from("<I", blob, 12)[0]])
meshes = {m["name"].lower() for m in gltf["meshes"]}
labels = {
    "Solid": "Full wall",
    "WindowC": "Window",
    "WindowSide": "Side window",
    "Windows": "Two windows",
    "DoorC": "Door",
    "DoorSide": "Side door",
    "DoorS": "Door + window",
    "Archway": "Arch",
    "ArchwayLarge": "Wide arch",
    "ArchwayLargeSupport": "Arch support",
    "HalfWall": "Half wall",
    "HalfWallDoor": "Half wall + door",
    "HalfWallDoorS": "Half wall + side door",
    "HalfWallHalf": "Half-height side",
    "QuarterWallS": "Low wall",
    "QuarterWallHalf": "Low side wall",
    "Pillar": "Pillar",
    "Brace": "Upper diagonal",
    "RoofWall": "Lower diagonal",
    "Floor": "Full floor",
    "BalconyS": "Half floor",
    "BalconyO": "Quarter floor",
    "BalconyI": "Corner opening",
    "BalconyD": "Diagonal floor",
    "StairW": "Full ramp",
    "StairF": "Half ramp",
    "StairT": "Turning ramp",
    "StairR": "Switchback",
    "RoofC": "Cone",
    "RoofO": "One raised corner",
    "RoofS": "Sloped roof",
    "RoofI": "Three raised corners",
    "RoofD": "Diagonal roof",
}
aliases = {
    "Floor_2": "Floor",
    "HalfWallS": "HalfWall",
    "WindowsC": "WindowC",
    "WindowsSide": "WindowSide",
    "HalfWallDoorSide": "HalfWallDoorS",
    "Pillar2": "Pillar",
}
metadata = {
    "HalfWall": "HalfWallS",
    "BalconyI": "BalconyL",
    "Brace": "Brace_TopLeft",
    "RoofWall": "RoofWall_TopLeft",
}
patterns = []
for shape, label in labels.items():
    kind = (
        "floor"
        if shape in ["Floor", "BalconyS", "BalconyO", "BalconyI", "BalconyD"]
        else (
            "stair"
            if shape.startswith("Stair")
            else "roof" if shape.startswith("Roof") and shape != "RoofWall" else "wall"
        )
    )
    file = root / f"EMP_{kind.title()}_{metadata.get(shape,shape)}.json"
    props = json.loads(file.read_text())[0]["Properties"]
    cells = props.get("TileData", [1] * (9 if kind == "wall" else 4))
    cells = [1 if x == "BTV_Active" else 0 if x == "BTV_Inactive" else x for x in cells]
    patterns.append(
        dict(
            id=shape,
            kind=kind,
            label=label,
            cells=cells,
            source=file.name,
            sha256=hashlib.sha256(file.read_bytes()).hexdigest(),
        )
    )
definitions = []
for file in sorted(root.glob("PBWA_*.json")):
    if "Fewer" in file.name:
        continue
    bits = file.stem.split("_")
    shape = aliases.get("_".join(bits[2:]), "_".join(bits[2:]))
    if shape not in labels:
        continue
    obj = next(
        (o for o in json.loads(file.read_text()) if o["Name"].startswith("Default__")),
        None,
    )
    if not obj:
        continue
    ref = obj["Properties"].get("StaticMesh", {})
    mesh = ref.get("ObjectName", "").split("'")[-2]
    if mesh.lower() not in meshes:
        continue
    definitions.append(
        dict(
            shape=shape,
            material={"W": 0, "S": 1, "M": 2}[bits[1][0]],
            tier=int(bits[1][1]),
            classPath=obj["Package"] + "." + file.stem + "_C",
            meshPath=ref["ObjectPath"].split(".")[0] + "." + mesh,
        )
    )
out = dict(
    source="Fortnite 42.40 installed assets; CUE4Parse read-only export. Mesh availability checked against Penny builds.glb.",
    patterns=patterns,
    definitions=definitions,
)
Path("src/data/build-edits.json").write_text(json.dumps(out, indent=2) + "\n")
print(f"{len(patterns)} edit patterns, {len(definitions)} verified class/mesh pairs")
