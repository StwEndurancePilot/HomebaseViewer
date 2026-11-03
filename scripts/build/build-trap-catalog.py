import json
import re
import sys
from pathlib import Path

# Regenerate from the locally extracted item-slot snapshot, never from player saves.
rules = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8-sig"))["items"]
catalog = json.loads(Path("src/cloud/catalog.json").read_text())
options = json.loads(Path("src/data/trap-perk-options.json").read_text())
paths = {
    "alteration:" + p.split(".")[-1].lower(): p
    for group in options["groups"] for p in group["paths"]
}
classes = {
    v["classPath"].split(".")[-1].lower().removesuffix("_c"): v
    for v in catalog["classes"].values() if "trap_" in v["classPath"].lower()
}
aliases = {
    "ceiling_electric_aoe": "ceiling_electric",
    "ceiling_electric_single": "ceiling_electricweak",
    "floor_ward": "floor_ward_antiair",
    "wall_wood_spikes": "wall_spikes",
    "floor_player_jump_pad_free_direction": "floor_player_jump_free_direction_pad",
}
rarities = ["Common", "Uncommon", "Rare", "Epic", "Legendary"]
families = {}
for key, item in rules.items():
    if not key.startswith("trap:tid_") or item["coverage"] != "resolved":
        continue
    stem = key[9:]
    match = re.fullmatch(r"(.+)_(c|uc|r|vr|sr)_t(\d\d)", stem)
    if match:
        item = {**item, "rarity": {"c": "Common", "uc": "Uncommon", "r": "Rare", "vr": "Epic", "sr": "Legendary"}[match[2]]}
    if item["rarity"] not in rarities:
        continue
    family = match[1] if match else stem
    if family == "floor_health":
        suffix = {"Common": "bandage", "Uncommon": "balm", "Rare": "first_aid_kit", "Epic": "first_aid_megabacon", "Legendary": "first_aid_megabacon"}[item["rarity"]]
        cls = classes.get("trap_floor_health_" + suffix)
    else:
        cls = classes.get("trap_" + aliases.get(family, family))
    if not cls:
        continue
    samples = [v for k, v in catalog["items"].items() if re.sub(r"_(c|uc|r|vr|sr)_t\d\d$", "", k) == "tid_" + family]
    if not samples:
        continue
    tier = int(match[3]) if match else 1
    if tier == 0:
        continue
    existing = families.setdefault(family, {}).get(item["rarity"])
    if existing and existing["tier"] >= tier:
        continue
    sample = samples[0]
    prefix = sample.rsplit("/", 1)[0]
    sample_stem = sample.split(".")[-1]
    name = re.sub(r"_(C|UC|R|VR|SR)_T\d\d$", f"_{match[2].upper()}_T{tier:02}", sample_stem, flags=re.I) if match else sample_stem
    perks = []
    for slot in item["slots"]:
        if rarities.index(slot["unlockRarity"] or "Uncommon") > rarities.index(item["rarity"]):
            continue
        if (slot["unlockLevel"] or 0) > tier * 10:
            continue
        allowed = [p for p in slot["allowed"] if p in paths]
        if not allowed:
            continue
        priorities = (["damage_physical", "healing", "knockbackimpact", "effectduration", "damage", "reloadspeed", "maxdurability", "critchance", "critdamage", "buildingheal"] if len(perks) % 2 == 0 else ["reloadspeed", "damage", "healing", "knockbackimpact", "effectduration", "maxdurability", "critchance", "critdamage", "buildingheal"])
        chosen = min(allowed, key=lambda p: next((i for i, s in enumerate(priorities) if "aid_att_" + s in p), 99))
        perks.append(paths[chosen])
    families[family][item["rarity"]] = {
        "rarity": item["rarity"], "tier": tier, "itemPath": prefix + "/" + name + "." + name,
        "classPath": cls["classPath"], "meshPath": cls["meshPath"],
        "meshRelative": cls["meshRelative"], "attachmentType": cls["attachmentType"], "perks": perks,
    }
result = {
    "source": "Item availability and perk slots: locally extracted 42.10 slot-rules; paths and meshes: bundled cloud catalog; perk paths: bundled trap-perk-options. Perks are deterministic editor starter rolls, not captured player rolls. Intrinsic elemental effects remain on the trap definition.",
    "traps": [
        {"id": family, "name": rules["trap:" + next(iter(variants.values()))["itemPath"].split(".")[-1].lower()]["name"],
         "variants": sorted(variants.values(), key=lambda v: rarities.index(v["rarity"]), reverse=True)}
        for family, variants in sorted(families.items())
    ],
}
Path("src/data/trap-catalog.json").write_text(json.dumps(result, indent=2) + "\n")
print(f"Wrote {len(result['traps'])} trap families.")
