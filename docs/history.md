# Homebase Viewer

A standalone Windows desktop viewer and blueprint editor extracted from Penny Launcher's outpost renderer. Open a local menu `.sav`, a schema 3–6 capture `.json`, or optionally sign in to Epic to download a Storm Shield backup. Local editing needs no account or network. Account import uses narrowly scoped Epic requests in the desktop main process; the renderer blocks external network requests.

## Run

Open `artifacts/1.6.2/Homebase Viewer-win32-x64/Start-Homebase-Viewer.cmd`. Save any work before closing an older viewer window; the new window title says **Homebase Viewer 1.6.2**. Keep the portable folder together. Choose **Open homebase** or drop your save on the window. Existing game saves are only read and are never modified.

- **Orbit:** drag to rotate, right-drag to pan, wheel to zoom. Click a piece to see its original saved transforms.
- **Walk:** starts near the orbit target. Click the scene to capture the mouse; WASD moves, Shift sprints, Ctrl walks slowly, Space jumps, Esc releases the mouse.
- **Map spawn:** starts Penny walk mode at the map's reference spawn.
- **Fly:** click the scene; WASD flies, E/Q ascends/descends, Shift speeds up, Esc releases the mouse.
- **Frame base:** returns to the full capture. Scene switches control builds, traps, terrain, optional static scenery, and missing-mesh markers.
- **Save fidelity report:** lists every unmatched mesh and known limitations.

## Requirements and perks (1.5.8)

Open **Requirements** in the bottom toolbar for full-blueprint wood, stone and metal totals, including saved upgrade tiers (10 / 30 / 60 per structure, matching the menu). These are full rebuild totals, not a live inventory shortfall. Scenery and unavailable records are excluded; unknown structure materials or tiers make the totals visibly incomplete.

Each trap row shows its quantity. Toggle its checkbox to hide/show that type, or choose **Only** to isolate it. Expand the row for quantities by item, level and saved perk set; **Locate** selects and frames that variant. Click a trap in the scene to inspect its level and individual perks. Known perks have readable descriptions and rarity labels; duplicate rolls retain their order, unknown perk IDs stay visible, and absent data says **Perks not recorded**.

Filters affect visibility and selection only. They never remove anything from a draft or export, and material/trap totals always describe the whole blueprint. Each open document retains its own filters during the session. Edits and undo refresh the counts.

## Epic account import (1.5.0)

**Recovered trap meshes (1.5.6):** Healing Pad and Flame Grill now use original meshes and textures recovered from the installed Fortnite assets. Anti-Air now includes the original base, body, head and ammo display in its blueprint default pose. Native mesh pivots are preserved; this changes rendering only. Live turret aiming, animated charge/healing effects and Unreal material shaders are not simulated. The source meshes, texture hashes and component transforms are recorded in `assets/outpost-game/recovered-traps/provenance.json`.

**Trap support links (1.5.2):** current Epic property headers are decoded, including the saved `AttachedTo` reference. Every trap links to that exact structure's saved GUID, retaining its full world pose and support-relative transform even when offset far from the support. Missing or duplicate references remain export issues; proximity is never used to choose a different wall. Current archives omit the runtime attachment-side field, so it is honestly marked unknown (255). Your menu's explicit-host replay uses the linked support and exact position/rotation, not that audit field. Previously imported drafts do not contain the lost references: **download the homebase again in 1.5.2**, or reopen the original raw Epic archive. Legacy `/Game` and current `/SaveTheWorld` paths share their verified trap mesh mappings.

**Penny accounts (1.5.1):** the account panel automatically detects accounts in `%APPDATA%/penny-launcher-data/accounts.json`. Choose a name under **From Penny Launcher** to sign in and list that account's homebases, without the browser login step. **Refresh Penny accounts** rereads the source after you add or repair a login in Penny. Older plaintext and `enc:v1:` Windows-encrypted entries are supported using Penny's Local State key and the current Windows user's DPAPI. Only names and temporary selection IDs reach the renderer. The viewer never writes Penny's files or persists imported credentials. Expired/revoked logins show a retry/sign-in message.

**Missing trap levels (1.5.1):** unreadable or invalid cloud trap levels default to level 50 (tier 5), and a known matching tier-5 item definition is used where available. Fixed-level items or items with no verified tier-5 equivalent retain their recorded item definition. Readable levels remain unchanged. The old trap-level error is also repaired when reopening a 1.5.0 cloud draft; the repaired draft is marked unsaved. Other conversion issues still block export. Save a draft in the older window before switching versions, or download the homebase again.

Choose **Import from Epic account** on the welcome screen, or the cloud button beside the theme control. Choose **Sign in with Epic**, finish authentication on Epic's website in your browser, then choose **Download & open** for Stonewood, Plankerton, Canny Valley or Twine Peaks. Only zones with a recorded backup are available. **Refresh** checks the account again. **Sign out** or closing the app clears the app's in-memory session; your browser's Epic login is separate. No password form, credential file, persistent device authorization or cloud-save upload is added.

The downloaded backup opens as an unsaved editor tab. **Export .sav** always uses the same native menu exporter: schema 6 `STW_HOMEBASE_1`, SpriteSaveGame container and 17-field replay rows. A sanitized empty menu container is bundled, so account imports need no prior local menu save. You can also open a raw Epic `.sav` / `.asv` locally; choose its zone when prompted. The original file is never overwritten automatically.

Conversion reads actor records before Penny's rounding/layout stage. Supported full quaternions, fractional coordinates and signed XYZ scales are retained. Legacy upright rotations retain their stored components; unrecoverable tilt, ambiguous records, unknown primary mesh mappings, unreadable trap fields and unresolved support references produce export issues. Trap supports require a recorded GUID/reference; proximity is not used to invent links. Captured perk arrays preserve order and duplicates. An absent perk array produces an empty override and is noted in the fidelity report.

Cloud saves do not provide the menu's authoritative primary mesh snapshots. The preview uses observed menu class defaults, and cloud level coordinate origins have not been compared against a live capture of the same base. Version 1.5.2 was validated with authenticated read-only Stonewood and Twine Peaks downloads: all 13 and 3,625 trap supports resolve, including 2,085 offset placements in Twine. Both complete exports pass the menu's native validators. **Live Fortnite replay is still untested**, and these checks do not certify 1:1 geometry. Unsupported archive layouts fail visibly. **Scene → Placement fidelity → Save fidelity report** includes cloud provenance, warnings and conversion issues.

## Export issues (1.4.0)

**Building fix (1.5.5):** earlier creator exports removed the precision result required by the menu, which emptied its build queue even when the file loaded. Export now recalculates numeric round-trip checks for actor, mesh and attachment poses and includes the required result. Reopen and re-export affected saves, then import the new file into the menu. Coordinates are unchanged; this does not certify live game acceptance or cloud-to-world alignment.

**Replay formatting fix (1.5.4):** earlier exports could contain scientific notation in transform rows, which passes JSON validation but fails the menu's runtime numeric gate. Replay poses now use ordered fields and expanded, round-tripping decimals. Values are not rounded. Each export also checks the runtime row/number format, building material codes and the menu's 64 distinct trap-definition limit. Reopen an affected save and export it again with this version; no recapture is needed.

If **Export .sav** is blocked, a persistent **Export issues** panel lists every affected piece and all its reasons. Those structures and traps turn red in the scene, with red outlines visible through other geometry. Click an issue to automatically select its piece, switch to Orbit, reveal its scene category and frame it in the centre of the view. Missing meshes use their location markers. The focused row shows a blue selection outline; the piece remains red until its issue is resolved.

**Selection tools** opens the usual actions for the selected piece. Delete and Undo work normally. The issue list and highlights refresh after edits, deletion, Undo and Redo. Closing the panel keeps the review active; the **Export issues** badge reopens it. Reviews belong to their own document tab. **Clear highlights** dismisses the review without changing any pieces. **Recheck** refreshes validation; **Retry export** runs the exporter again. Errors without a piece location, such as a missing native save container, appear as persistent messages in the same panel.

## Building and piece edits (1.6.0)

Select a building and press **E** (or **Edit piece**). Click or drag the 3×3 wall grid or 2×2 floor grid; cone cells raise/lower corners. Ramp edits use path presets. **Enter** confirms, **R** resets, **Esc** cancels. Presets, Mirror and Rotate keep edits on native Fortnite shapes. The live preview hides the original piece until you confirm/cancel. All edits are undoable. Pieces with attached traps must have their traps removed before editing. Unknown/custom-scaled pieces are not silently replaced.

The **View** picker adds top, underneath, front, back and side angles. **Face piece** aligns the edit camera to the piece; double-click focuses a selection, and scroll zooms toward the cursor. Camera changes do not modify saved coordinates.

33 edit patterns and 296 material/tier/class/mesh pairs are sourced from installed Fortnite edit metadata and checked against Penny’s shipped meshes. Edits preserve actor identity, material and saved tier; mirrored geometry uses the observed native negative-X scale and mirror flag. Floor/ramp/cone turns preserve their occupied tile centre. Runtime stability, terrain permission and server placement acceptance are not simulated.

Choose **Build** in the bottom dock, then **Wall**, **Floor**, **Ramp**, **Cone**, or **Trap** (keys **1–5**). Move the pointer over a player-built support to see a blue ghost; click to place. Keep clicking other supports to continue building. Drag to orbit and right-drag to pan while building.

- A wall targets the nearest floor edge, including underneath when aiming from below, or the top/base/sides of a wall. Floors can attach to either face at a wall’s top or base. **Attach → Above / Below / Beside** overrides aiming; **Page Up / Page Down / Home** choose above / below / automatic. A small aiming margin around piece edges makes extension easier.
- A trap uses a compatible support and faces the camera's side of a wall. Search by a readable trap name or perk text. Captured levels and perks remain selectable.
- **R** rotates a trap, ramp or cone by 90 degrees, or cycles the supporting edge for a wall/floor. **F** flips a wall trap's face. **Esc** returns to selection. Shortcuts do not intercept typing in fields.
- Blocked placements show red feedback and cannot be committed. Existing support, occupancy, offset and export checks still apply. New placements remain individually undoable.
- **Exact placement** retains the earlier numeric workflow: select a support in Select mode, open Build, expand Exact placement, choose direction/rotation, preview and place.
- **Use trap offsets → Edit** opens the world-coordinate fields for new traps. For existing traps, click the selection count, choose **Keep traps**, then **Trap offsets**.
- The selection count opens the focused selection panel. The sliders button opens scene visibility and fidelity information. Paste opens its own panel. The permanent sidebar has been removed.
- The top-right theme button cycles system, light and dark Material You blue. Fonts/icons are local and all existing offline behavior is retained.

## Build and merge blueprints

1. **Open homebases** accepts multiple `.sav` / `.json` files and keeps each in its own tab. Use the same map for an amp merge. Each tab has its own selection and undo history.
2. In the source tab, use **Box select** to draw around an amp's structures and traps. It selects all depths within the rectangle; hide unwanted scene categories or use **Keep traps / Keep structures** to narrow it. Shift-click toggles individual pieces, Shift-drag adds, and **Frame** zooms to the selection. The amplifier objective itself is fixed world scenery, not a movable player build.
3. **Copy** (Ctrl+C) takes the selected group, includes attached traps when copying structures, and includes required supports when copying traps. Captured item definitions, levels, perks, signed scales, actor/mesh transforms and existing trap offsets travel together.
4. Switch to another file, or choose **New blueprint** for an empty blueprint on the active map. **Paste group** (Ctrl+V) opens a preview. Keep the original anchor to merge at the original world coordinates, enter a new anchor, or use one selected target piece as the anchor. Rotate the entire group in 90-degree steps. Whole-tile mode snaps only displacement (512 UU horizontally, 384 vertically); turn it off for exact numeric anchor placement. Individual copied pieces are never snapped. **Frame preview** helps inspect a moved group.
5. Review the ghost, then click **Paste group** in the paste panel. New identities and support links are assigned together. Identical target pieces are reused; conflicting occupied tiles block the entire paste. Different maps have different terrain and origins: the editor labels that case and does not automatically map one amp site onto another.
6. **Export .sav** creates a native `STW_HOMEBASE_1` SpriteSaveGame blueprint with 17-field replay rows. Save it in a folder you choose, then select it with the menu's existing homebase import workflow. The viewer does not install it or overwrite a source save automatically. **Save draft** writes an editable JSON you can reopen. A JSON-only session needs one menu-generated `.sav` opened to provide a native container before exporting `.sav`.

**New pieces:** select exactly one full floor or solid wall, then use **Place a piece**. Walls and floors offer wood/brick/metal and tiers 1–3. Directions are relative to the support orientation: floors can extend to neighboring tiles, walls attach to floor edges or extend sideways/upwards, and a floor can sit above a wall. New traps use variants from your open files, retaining their captured level, perks and attachment type; the viewer does not fabricate inventory definitions. Floor/ceiling traps need full floors, wall traps need solid walls, and standard mode checks occupied support faces. Floor and ceiling traps may use opposite faces of the same floor. Preview before committing.

**Estimated vertical placement limits (1.3.1):** **Constrain Z** is enabled by default for numeric offsets and the move gizmo. Floor and ceiling traps use **−472 to +472 cm**; wall traps use **−345 to +720 cm**. These are user-reported estimates; the wall upper cutoff was reported between 720 and 730, so 720 is used provisionally. Bounds measure world actor Z minus the captured support actor Z, including for upside-down traps. They apply to the total resulting offset, so repeated edits cannot bypass them. Bulk dragging uses the intersection of every selected trap's remaining range, preserving group spacing. Snapped drags stop at the exact boundary even when it is not a snap increment.

Imported exceptions are not changed: horizontal edits and rotations remain available, and vertical edits can move toward the estimated range without moving farther outside it. Uncheck **Constrain Z** to override this estimate. This switch is independent of the per-edit menu limits below. Neither source code nor live game tests have confirmed the estimated game cutoff.

**Trap offsets (1.3.0):** select one or more traps, then choose **Move** in the bottom dock (or press **G**). Drag a colored arrow to move one world axis, a square to move a plane, or the centre to move in the view plane. Red is Unreal X, green Y, blue Z; labels mark each positive end. The mesh moves live. Release commits one undo step; **Esc** during a drag restores its baseline. Selection changes, leaving Orbit, starting Build, and switching files end Move mode. Supports stay put and retain their links. Snap choices apply to the displacement only, so fractional imported coordinates are preserved.

The Trap offsets panel also offers numeric world XYZ deltas and additive pitch/yaw/roll angles. Choose **Limit per edit**: original placement menu **±1,000 cm / ±180°**, free preview **±2,000 cm / ±3,600°**, or **Unrestricted blueprint** (finite values). These are menu UI ranges, not a proven Fortnite maximum. Nine audited saves included 34 trap/support pairs separated by more than 2,000 cm along an axis; the largest was **16,640 cm**. Existing poses are never clamped. The limit bounds each edit, so repeated edits can exceed it relative to a support. Unrestricted placement and server acceptance require in-game testing. 512 cm is one horizontal tile.

**Upside-down ceiling traps:** while building a ceiling trap, enable **Upside down on floor**. It uses a local 180° pitch, with no automatic vertical shift. The original ceiling attachment side (1) and native trap type remain intact. This reproduces 1,167 zero-offset inverted electric-field records in the audited saves. Existing 380 cm and other offsets are intentional saved translations, not universal corrections. To flip selected existing ceiling traps, open **Trap offsets → Flip ceiling traps**; their world positions, component relationships, signed scales, levels, perks and support links are retained. Apply a Z offset explicitly when desired. Geometry seating and unrecorded trap components remain subject to Penny's asset limitations.

For new numeric offsets, enable **Use trap offsets** in Build. These fields offset the proposed standard placement; reset them before using standard placement again. Offset/inverted placements permit distinct poses on an occupied support face.

Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) undo/redo up to 50 edits per tab. Delete removes selected player builds and traps attached to any deleted supports. Original files are read-only until you explicitly choose a destination in a save dialog. A dot marks unsaved edits; closing the desktop app with unsaved work offers to keep editing.

The editor enforces the local rules above; it does not simulate Fortnite's terrain/build restrictions, structural support network, permissions, inventory or server placement acceptance. Standard creation is limited to full floors and solid walls; edited/tilted pieces can be preserved with copy/paste. Captured trap support links are required for export; unresolved or fixed-world dependencies block export rather than silently inventing a support. Source scenery and unavailable records are omitted from a build-only export. Existing imported offset builds are not forced back onto standard slots.

References: [Epic's Fortnite grid units](https://dev.epicgames.com/documentation/fortnite/grid?lang=en-US), [Epic's grid snapping and tile-centred 90° rotations](https://dev.epicgames.com/documentation/fortnite/using-grid-snapping-in-unreal-editor-for-fortnite?lang=en-US). The menu's `PlaceTrap.cs`, captured actor/item paths, and its native save/attachment validators provide the implementation-specific conventions. Exact imported data does not resolve the mesh limitations below.

## Precision and fidelity

The import path deliberately bypasses Penny's cloud-save parser and packed layout. It preserves the capture's native double values, including schema-6 exact binary64 strings. Each primary mesh uses its recorded **meshTransform**, with full quaternion rotation and XYZ scale. On import it never snaps to build cells, rounds yaw, guesses support positions, or reapplies the actor's mirrored flag. Asset coordinates are converted by `(UE Y, UE Z, -UE X) / 512`; quaternion vectors use the corresponding reflection-aware basis. Negative scales are baked into shared geometry with winding correction before instancing.

**Version 1.0.1 fixes the half-tile horizontal trap displacement.** Penny's `seat_trap` exporter subtracts 256 Unreal units along local Y from its edge-origin floor/ceiling meshes. Penny normally compensates in `trapCentre`; version 1.0.0 of this viewer omitted that compensation. The viewer now reverses the known export shift in local geometry (+0.5 scene X), before applying the saved scale and full rotation. Wall traps, centre-origin anti-air, the smaller jump pads, unknown meshes, and buildings are unchanged. There is no grid-coordinate heuristic, nearest-support guess, or fixed world-space nudge. The audited source-mesh list is in `src/core/trap-pivots.ts`; the report counts affected records. Tests compare the actual bundled floor/trap mesh footprints and exercise rotated, inverted and mirrored cases.

This still does **not certify every visual detail as 1:1**. The current Penny GLBs are blueprint assemblies, not raw mesh exports. Besides the corrected horizontal centering, `extract_blueprint_models.py` bakes component-relative transforms and vertical ceiling seating into the bundled nodes. Those remaining adjustments cannot safely be stripped without the original meshes/component data. The viewer matches individual primary parts by actual GLB source mesh name. A source-name match alone does not prove every original component/pivot detail. Flame Grill Trap and Healing Pad meshes are absent from the bundled Penny GLB.

Penny also supplies quantized recovered meshes, often LOD1, and simplified materials. Rendering on the GPU is float32. Captures record primary mesh transforms, not every animated or secondary component; the viewer does not fabricate their transforms. Unknown meshes appear as pink markers at their saved locations. Penny terrain/scenery is a static reference from its source game version and may differ from your current map. Optional scenery starts off because it cannot know which trees or props were destroyed. Unavailable records are reported. Existing-world references are distinguished from player placements.

The menu's loaded-actor capture explicitly does not certify complete coverage. Actors that were never captured cannot be recovered from this file. Walking uses Penny's approximate raycast controller, not Unreal gameplay physics. Exact asset/secondary-component coverage and comparison with the same live base remain necessary before claiming 1:1 visual fidelity.

## Develop

Requires Node.js (tested with the installed runtime) and npm. Everything needed at runtime is included by packaging.

```powershell
npm ci
npm test
npm run build
npm start
npm run package
```

`npm run dev` runs a loopback-only development browser build. `npm test` also validates local menu saves read-only when they exist under `%LOCALAPPDATA%/FortniteGame/Saved/SaveGames`; source saves are never modified; generated validation fixtures stay under ignored artifacts/. `node tests/smoke/smoke.mjs` tests the native Electron UI using a local save and writes screenshots/results only under ignored `artifacts/`.

The editor's native UI regression is `node tests/smoke/blue-smoke.mjs`. When the sibling RDW-source checkout and .NET 8 are available, run `dotnet run --project tests/native-checks/NativeChecks.csproj -- <exported.sav>` to verify the exported container, capture schema, support graph and replay plan against the actual menu sources. Set the MSBuild `RdwSource` property if that checkout is elsewhere. These development checks are optional; the packaged viewer requires neither checkout nor .NET.

`dotnet run --project tests/menu-runtime/MenuRuntime.csproj -- <exported.sav>` executes the menu's emitted load and verification sections using its test VM. It checks the build queue and exact loaded actor poses, including builder positions, and proves missing or failed precision results clear the queue. Native engine calls are mocked; this is not an in-game placement test.

Asset recovery uses `tools/asset-recovery/TrapExport.csproj` with arguments `<Paks directory> <matching usmap> <output directory>`. Run once normally and once with `--blueprints`, then pass the output folder to `node scripts/build/build-recovered-traps.mjs`. The helper is pinned to CUE4Parse-Conversion 1.2.2.202610 and the UE5.8/42.40 asset layout; it reads the installed archives and fetches the public asset key, writing only into the supplied output folder. The packaged viewer includes the finished assets and needs no extraction tool, game installation or network connection to display them.

See `THIRD-PARTY.md` for source attribution and licensing. This is its own GPL-3.0 project; it does not change RDW-source or publish any menu/launcher build.

Requirements uses bundled Fortnite material/trap artwork. Expand a trap to see its saved perk setups, with rarity colours and upgrade ranks; selecting a trap shows the same perk treatment in Selection.

## Export formats (1.6.2)

Use the arrow beside **Export .sav** for **Menu save (.sav)** or **Formatted JSON (.json)**. JSON exports use two-space indentation and a trailing newline, retain transform precision, and can be reopened in the viewer without a native save template. Save draft is also formatted. `.sav` exports retain the native binary container but write its text as UTF-8 with a positive byte count and one terminator, avoiding UTF-16’s alternating zero bytes. Older UTF-16 saves still open. Required binary header/trailer zeros remain.
