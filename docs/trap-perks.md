# Trap perk editing

Select a player-placed trap and choose **Edit perks** in the selection panel. Each dropdown groups perks by effect and shows the rarity and exact description. Add up to six slots, remove slots, or move them up and down. Imported lists longer than six are retained and editable. Apply commits one undoable change; Cancel and Escape discard the draft.

The editor preserves imported paths, duplicate rolls, and order. An unchanged list leaves its capture provenance intact. Changed lists use `trapPerksSource: editor` and clear stale effect evidence. Empty lists use `trapPerksStatus: empty`. Both JSON and menu `.sav` exports include edits.

`src/data/trap-perk-options.json` contains a curated subset of full alteration paths from the sibling RDW-source `assets/perks/effect-sources.json`, game build 42.40-59247843. Descriptions and rarities come from the existing perk catalog. The checked-in subset has no runtime dependency on that checkout. Choices cover damage, critical rating/damage, reload, durability, impact/knockback, effect duration, range, healing, building healing/health, and physical element. Other imported perks remain selectable with their original paths.

Choices are not constrained by schematic slot or trap type. The catalog identifies assets; it does not assert game-server acceptance of every combination. Game replay acceptance remains unverified.
