# Local validation — 2026-10-27

## Version 1.7.0 — installer and GitHub updates

111 tests pass, with two optional cloud fixtures skipped. TypeScript, formatting and the ten-class file structure checks pass. The dependency audit reports zero known vulnerabilities. GitHub repository metadata confirms StwEndurancePilot/HomebaseViewer is public with main as its default branch.

A Windows x64 NSIS setup was built locally with the real GitHub update configuration. The Setup EXE, blockmap and latest.yml agree on version, size and SHA-512. Compiled renderer and Electron files match app.asar. The embedded app.asar was extracted read-only from Setup and compared with the verified unpacked app; their SHA-256 digests match.

Packaged export, building, requirements and updater smoke checks pass. The updater smoke uses the real electron-updater HTTP/download path against a local fixture server, accepts the correct SHA-512 and rejects corrupted bytes. It also verifies the update panel and confirms that cancelling the unsaved-edit prompt leaves the window open. No downloaded fixture or setup installer was executed.

The GitHub workflow is configured and tested locally for version selection, default-branch gating, serialization, test-before-publish order and stable installer identity. The repository is still empty: hosted Actions execution and GitHub publication will first be exercised after the source is uploaded. The setup is unsigned because no signing certificate was supplied. In-place installation and restart have not been exercised on an installed user copy; download, integrity, payload and close-guard paths have been verified separately.

## Version 1.6.3 — release source cleanup

Application, scene, UI, style, account and tool files are grouped by responsibility. All nine explicit classes have their own matching file. Explanatory source comments were removed; licenses, attribution and asset provenance remain. Prettier, EditorConfig, a class-structure check, and TypeScript unused-code checks define the source conventions.

`npm run check` passes: formatting, source structure, TypeScript and 101 tests. Two optional private-cloud cases are skipped. The Electron 44.9.3 portable build passes export, building, requirements and mocked account-import smoke checks. Tests cover SAV/JSON exports, Unicode, exact transforms, grid edits, below-floor placement, trap artwork, filters, saved perks and keyboard controls. Live Epic authentication and live Fortnite placement were not exercised.

The native file validator accepts all three smoke exports (one Unicode fixture, one edited wall and two below-floor pieces). The emitted menu loader retains 1/1, 1/1 and 2/2 entries respectively, with exact actor poses. Engine calls are mocked in that loader check.

The locked dependency audit reports zero known vulnerabilities after updating Electron and the build/test tools. Packaging includes only compiled application files, documentation, licenses and notices; archive inspection confirms source, test tools, local saves and caches are excluded. Every compiled renderer and Electron file is SHA-256 compared against app.asar. This is a local portable build, not a publication or game installation.

## Version 1.6.2 — compact export control

The export actions share one continuous 40px-high pill with a 40px arrow segment, inset divider and rotating chevron. The Material menu has shorter labels, separate file extensions and an 8px gap below the button. Keyboard Arrow Down opens it; Escape closes it. The export encoders are unchanged.

TypeScript and the production build pass. Electron smoke validation covers both export formats, JSON reimport, Unicode SAV integrity, keyboard opening/dismissal, joined button geometry, light/dark appearance and the minimum window layout. The packaged build repeats the smoke and SHA-256 verifies compiled files against app.asar.

## Version 1.6.1 — UTF-8 save payload and export menu

The native FString payload now uses positive byte-counted UTF-8 plus a single zero terminator, preserving the binary header and trailer. Tests verify no embedded payload zero bytes, Unicode round trips, UTF-16 input compatibility, repeated UTF-8 export, exact numeric values, and indented JSON with a trailing newline. 101 tests passed; two optional cloud fixtures skipped.

The Material Web split export control offers native SAV and formatted JSON. JSON-only input can export JSON without a native container. Save draft is formatted too. Electron smoke checks cover the two menu choices, JSON reimport, Unicode SAV export, Escape, and minimum window layout. The packaged EXE repeats those checks and its compiled files are SHA-256 compared to app.asar. Native menu validators and the emitted loader are run on UTF-8 exports; live game loading is not tested.

## Version 1.6.0 — piece editing and placement controls

33 native edit patterns and 296 available material/tier/class/mesh pairs were extracted read-only from the installed Fortnite 42.40 data. The generated catalog uses actual primary mesh references, including class naming exceptions. Six representative wall/floor patterns are ray-probed against the real bundled meshes to verify grid orientation; this caught and corrected the diagonal RoofWall alias. Native negative-X mirroring was cross-checked against existing captured mirrored builds.

98 tests passed; two optional private-cloud fixtures skipped. Added coverage includes catalog mesh availability, valid/invalid patterns, mirror flags/scales, tile-centred rotation, exact fractional actor origins, occupancy, trapped-support rejection, undo/redo and native export. Existing nine local saves remain read-only.

Electron UI checks exercise wall window/door edits, invalid masks, reset/cancel, mirror, native .sav export, pointer placement underneath a floor, explicit below placement viewed from above, floor/ramp/cone presets and rotation, and the minimum window. Screenshots were reviewed. Requirements/filter checks are also repeated because camera focus changed. The final packaged 1.6.0 EXE repeats the building flow and its renderer/Electron files are SHA-256 verified against app.asar.

The actual RDW native file validator, attachment graph and replay plan accept the edited wall and below-floor exports. The menu's emitted loader retains 1/1 and 2/2 build entries respectively with exact actor poses. Engine natives are mocked in that loader test: this is not a live Fortnite server build test. No game install or RDW source edits were made.

## Version 1.5.8 — inventory artwork and perk styling

Requirements now uses the original wood, stone, metal and 25 trap inventory icons copied byte-for-byte from the pinned Penny repository. Provenance records and source hashes are bundled in notices. Trap art reflects saved item rarity; groups with mixed rarities use a neutral frame. Unmapped trap types retain an explicit generic icon, rather than showing a different trap.

Perks use STW-inspired coloured rows, rarity labels and five-step upgrade markers in both Requirements and Selection. Their source order, duplicate rolls, values and unknown-data states are unchanged. Styling supports light/dark themes, long perk descriptions and the minimum 960×640 window. No save, placement, cost or export logic changed.

89 tests passed; two optional private-cloud fixtures skipped. The Electron smoke flow checks loaded local images, all five perk ranks, themes, totals, selection, Locate, filters, undo, draft equality, document switching and compact layout. Screenshots were visually inspected. The same flow is run against the packaged 1.5.8 EXE, and package verification compares the renderer/Electron files against app.asar by SHA-256. The flow makes no HTTP(S) requests.

## Version 1.5.7 — requirements, trap filters and perks

Added full-blueprint material totals using the menu's saved-tier costs (10/30/60), per-type trap counts, level/item/perk variant quantities, hide/show/Only filters, Locate, and a per-trap perk inspector. Scenery/unavailable records do not count. Invalid structure material/tier data is reported as incomplete totals. A pinned Penny perk catalog supplies display text; absent, empty, unreadable and unmapped perks remain distinct.

89 tests passed, with two optional private-cloud fixtures skipped. New checks cover material costs, ignored scenery, unknown materials, duplicate and ordered perks, variant grouping, immutable saved data, and hiding/restoring individual instances within a shared mesh. Nine installed captures were read-only counted; those older captures contain no recorded perk slots, so readable perk display is validated with explicit fixtures rather than claimed for those files.

Electron UI regression covers totals, variant counts, Locate, selecting a trap in the scene, duplicate perks, missing-perk feedback, search, per-document filters, Select all respecting filters, delete/undo counts, an unchanged saved draft despite hidden traps, and the 960×640 window. Screenshots are visually reviewed. The final versioned EXE repeats this flow; compiled renderer/Electron files are hash-verified against app.asar. Save/export serialization is unchanged.

## Version 1.5.6 — original missing trap assets

Recovered six original meshes and eleven textures from the installed Fortnite 42.40 archives with CUE4Parse-Conversion 1.2.2.202610: Healing Pad, Flame Grill, and Anti-Air base/body/head/ammo display. The packer preserves native pivots, converts the documented CUE GLTF basis/units once, and verifies Anti-Air's component parenting from the extracted blueprint. Unreal vertex-colour masks are retained as custom attributes rather than applied as black albedo. No save data, placement rules or export serialization changed.

83 tests passed; two optional private-cloud fixture tests were skipped. Added real-GLB checks cover tile-edge floor pivots, anti-air centre pivot and component bounds, high-detail vertex counts, material bindings and embedded textures. Native Electron smoke tests render all three traps, produce screenshots for visual inspection, and reopen the existing Stonewood save: all 937 pieces render, replacing the previous 56 missing Healing Pad/Flame Grill markers. Source saves are read-only. The same smoke flow is repeated against the final packaged EXE and all renderer/Electron files are verified against app.asar.

The Anti-Air model uses blueprint default pose, not live turret aim. Textures use a static PBR approximation; dynamic charge indicators, healing pickups/effects and Unreal shader behavior are not reproduced. This recovery does not resolve the remaining unrelated Penny mesh seating limitations or establish complete live-game visual equivalence.

## Version 1.5.5 — restore build eligibility

The creator removed `numericRoundTripFailures` as stale capture metadata. The menu's final Homebase.Verification section requires the exact token `"numericRoundTripFailures":0,` and otherwise clears BuildOrder. Version 1.5.4 fixed numeric formatting but missed this separate build gate; its previous validators therefore did not establish build eligibility.

Export now recalculates decimal round-trip checks across actor, mesh, support and relative transforms, blocks any changed value, and writes the result first in the document to satisfy the current runtime token check. Coverage remains unverified and completeHomebase stays false. No imported coordinates are shifted.

80 tests passed; two optional real-cloud tests were skipped because their private fixtures are unavailable. The new runner links the menu's actual emitted loader and existing test VM without changing menu source. It reproduced the 1.5.4 export's empty queue (0/19) and checked the corrected save (19/19) and an edited support/trap pair (2/2). Every actor pose and builder position matched the exported document. Missing and failed precision results are negative regressions. Engine native calls, including quaternion-to-rotator conversion, are mocked; live Fortnite placement and cloud-to-live-world alignment remain unverified.

The versioned package is checked byte-for-byte against the compiled renderer and Electron files. The packaged Export .sav flow and resulting native/runtime validation are rerun before handoff. Original user saves are unchanged.

## Version 1.5.4 — runtime-compatible replay numbers

The reported `sota test 3.sav` passes structural/native JSON checks but contains `6.123233995736766e-17` in actor and mesh poses on replay row 7. Homebase.DecodeNumber uses Unreal IsNumeric before conversion; the previous validator did not model this stricter gate. Earlier claims of runtime validity based only on the structural validator were incomplete.

Replay serialization now expands exponent notation without rounding, explicitly orders translation/rotation/scale, and validates serialized rows before creating a download. The runtime checks also cover material codes and the current menu's 64 trap-definition slots. The native check runner now checks replay numeric tokens as well as container, document and support graph.

81 tests passed, including the exact user file, preservation of all 19 actor/mesh poses, extreme finite binary64 values, canonical pose ordering and detection of the original failing token. A separate fixed copy was produced without changing the source. Packaged UI validation reopens the reported file, exports through the actual Export .sav button and checks the result with the strengthened native runner. Live in-game replay is not asserted.

## Version 1.5.3 — shorter interface copy

Removed the login explanations, export reassurance and welcome slogan. Penny accounts show their names directly; status text appears only during activity or when signed in. Shortened selection, offset, paste, export and success messages while retaining units, limits and actionable errors. Save and authentication behavior is unchanged. Production build and existing packaged account/import/export UI checks verify the update.

## Version 1.5.2 — actual Epic trap support references

- Root cause: current Epic records use recursive complete property type names followed by payload size and tag flags. The earlier reader expected legacy size/array-index headers and missed `AttachedTo`, levels, perks and mirrored flags. Both header generations are now supported with bounded parsing.
- Authenticated, read-only downloads using saved Penny logins: Stonewood has 129 pieces and 13 traps; Twine Peaks has 6,559 pieces and 3,625 traps. Every trap resolves by its saved support GUID. Twine includes 2,085 nonzero support-relative placements. Full transforms remain equal to the raw decoded poses; no positional association heuristic or rounding is added.
- Both complete real exports pass RDW's native save, attachment-graph and replay-plan checks. The remaining seven Twine mesh errors were existing `/Game` versus `/SaveTheWorld` catalog aliases; canonical lookup fixes those without fabricating a new mapping. Both imports now have zero export diagnostics.
- Current cloud saves omit runtime AttachedToSide. A check against nine menu captures showed that rotation-based side inference disagrees with 1,806 aligned wall-trap records and cannot classify 378 others. No such inference ships. Missing sides are marked unknown (255). The actual menu builder passes explicit support, position and rotation to ServerSpawnDeco; it does not consume this audit byte.
- 78 tests passed, including modern object/struct GUID references, nested property type names, tag flags, ordered perks, tilted offset traps, a closer unrelated support, inverted ceilings, namespace aliases and both local real archives. Private archives stay under ignored artifacts and are excluded from packages.
- Packaged UI regression imports a modern-header offset trap via the mocked account download, exports the linked blueprint, and covers the existing login/Penny/local-file flows. Output: artifacts/1.5.2/Homebase Viewer-win32-x64; every compiled renderer/Electron file is verified against app.asar. No live game replay was performed.

## Version 1.5.1 — Penny logins and tier-5 fallback

- 73 tests passed, including missing/invalid trap-level fallback, preservation of readable levels, native export round-trip, repair of older drafts, Penny discovery, opaque renderer IDs, plaintext and AES-GCM credentials, real Windows DPAPI with synthetic credentials, sanitized errors, device-auth login and cancellation during unlock.
- Read-only local validation detected three actual Penny accounts and successfully decrypted all three. No account names, IDs, device credentials or keys were logged; source files were not written. Live Epic authentication using those accounts was not performed.
- Desktop smoke passed Penny account refresh/selection and mocked device-authentication UI, the existing cloud download/conversion/export flow and minimum-window layout. The tier-5 fixture passes the menu's native .sav, support-graph and replay-plan validator.
- Output: artifacts/1.5.1/Homebase Viewer-win32-x64. All renderer and Electron files, including penny-accounts.cjs, are verified against app.asar during packaging. Existing cloud layout/fidelity limitations still apply.

## Version 1.5.0 — Epic account and cloud import

- 65 unit/regression tests passed, including device login, pending/slow-down polling, token exchange/refresh, cancellation, denial, recoverable metadata errors, endpoint/filename validation, session-only state, cloud decompression, raw actor transforms, ordered perks, support GUIDs and blocked ambiguous conversion. Nine menu captures / 27,322 primary mesh transforms remain read-only and unchanged.
- Epic's live client-credentials and device-authorization endpoints returned a valid verification flow. The pending flow was immediately cancelled without opening a browser or logging in to an account. No authenticated account download or live Fortnite replay has been performed.
- Native desktop UI smoke passed real sandboxed state/decoder IPC, local cloud zone selection, mocked account login/cancel, four-zone availability, download/conversion, export without an existing menu template, sign-out and 960×640 bounds. No renderer errors or renderer HTTP(S) requests occurred. Fixtures are synthetic, not evidence of real cloud archive coverage.
- Both conversion and desktop-export fixtures pass the actual menu's native container, schema, attachment-graph and replay-plan validators (one support and one inverted ceiling trap). The full export-issues UI regression also passes.
- Cloud primary mesh mappings come from observed menu class defaults; cloud level coordinate origins and attachment serialization still need verification against an authenticated backup and matching live menu capture. Unknown/ambiguous fields block export with actionable diagnostics; no nearest-support heuristic is used.
- Package target: artifacts/1.5.0/Homebase Viewer-win32-x64. Packaging compares all compiled renderer assets and all Electron main/preload/account-service files against app.asar by SHA-256. Account tokens remain in memory only and are never included in artifacts or renderer messages.

## Version 1.4.0 — navigable export issues

- 54 tests passed. Structured diagnostics preserve exact actor identities, all validation reasons and document-wide errors. Related zero-scale supports and their attached traps are both identified before export; no capture data is changed by validation.
- Native Electron UI checks cover six affected pieces and nine simultaneous issues: no truncation, multiple reasons per trap, red tint/outlines, centre-of-view red pixels after navigating to every affected piece, auto-selection, missing-mesh markers, hidden-category reveal, review persistence across closing and tab switching, keyboard activation, deletion/Undo/Redo revalidation, explicit clear, selection tools, 960×640 layout and successful export retry after removing invalid pieces. No renderer errors or HTTP(S) requests were observed.
- The repaired fixture's .sav passes the RDW native container, attachment and replay-plan checks (one valid structure). All fixture edits are in the viewer's validation artifacts; original saves and RDW source remain unchanged.
- Screenshots: artifacts/validation/export-issues-red.png and export-issues-compact.png. Machine-readable UI result: export-issues-smoke.json. Package target: artifacts/1.4.0/Homebase Viewer-win32-x64; compiled files are SHA-256 checked against app.asar during packaging.

No live Fortnite replay was performed. Existing asset fidelity and estimated Z-limit qualifications still apply.

## Version 1.3.1 — estimated support-relative Z bounds

The default Constrain Z policy uses the user's estimates: floor/ceiling −472…+472 cm and wall −345…+720 cm (conservative upper estimate from 720–730). These are world-Z differences from the captured support actor, not per-edit deltas or verified engine constants. Numeric edits validate the resulting total; dragging clamps to the common remaining interval across the selection, after displacement snapping. Repeated moves cannot bypass the bounds. Imported exceptions remain intact and may move toward the range; the checkbox allows an explicit override. Existing limits on each operation remain separate.

Native Electron mouse checks passed for the exact +472 cm clamp, a repeated drag at the limit, numeric rejection at +473 cm and explicit opt-out, plus the existing XYZ/flip/save regressions, with no renderer errors.

49 unit/regression tests passed, covering exact boundaries, fractional overflows, repeated edits, inverted ceilings, imported exceptions above and below range, opt-out, mixed-category bulk intersections, snap clamping and atomic undo. Live Fortnite acceptance has not been tested. Current portable artifact: artifacts/1.3.1/Homebase Viewer-win32-x64. Packager verifies compiled files against app.asar by SHA-256.

## Version 1.3.0 — XYZ trap movement and inverted ceiling placement

- TypeScript / production build and all 45 tests passed. Local saves remain read-only: nine files and 27,322 primary mesh transforms checked.
- The new regression reproduces 1,167 actual zero-offset upside-down ceiling electric-field records, including actor/mesh placement, native trap type and attachment side. Other tests cover all four yaw turns, a rotated fractional support, signed component scales, component-relative transforms, preserved offsets, world-axis conversion, displacement-only snap, limit boundaries and undo.
- Native Electron pointer testing passed for X/Y/Z arrows, correct positive Unreal directions, live actor/mesh movement, fixed support links, one-step undo/redo, snap, Escape cancellation and the next drag. Ceiling flipping, new inverted placement, bounded dragging and .sav export/reimport passed with no renderer errors. Evidence: artifacts/validation/gizmo-smoke.json and gizmo-move.png / gizmo-upside-down.png.
- The actual RDW native validators accepted gizmo-export.sav: three placements (one support, two inverted ceiling traps), no attachment issues and a valid replay plan. The menu source was used read-only; no game installation or live replay occurred.
- Package creation verifies every dist/main/preload file against app.asar by SHA-256 and emits build-verification.json. Versioned output: artifacts/1.3.0/Homebase Viewer-win32-x64.

Offset evidence: RDW src/STW.Menu/Assets/Widgets/SpinBoxWidgets.cs exports 234–239 specify ±1,000 cm and ±180° for the original placement fields. Features/Traps/FreeTrapFeature.Tick.cs bounds free-preview XYZ to ±2,000 cm and angles to ±3,600°. These are separate control limits, not an engine-wide maximum. In nine saves, 34 resolved trap/support pairs exceed 2,000 cm along at least one world axis; maximum observed separation is 16,640 cm. The viewer exposes both per-edit policies plus unrestricted finite blueprint edits, without clamping imported positions. Repeated edits may exceed the per-edit range in total.

The upside-down audit found 1,205 inverted ceiling records: 1,201 electric fields and four zappers. Most have zero relative translation and local quaternion (0, ±1, 0, 0); all retain ceiling side 1 and type 2. Some add 380 cm or larger custom translations. The preset uses the common local pitch half-turn and zero vertical offset; it never inserts a universal 380 cm correction. Existing flips retain positions and rotate primary components about the actor pivot. This is transform/support fidelity, not proof that Penny's baked geometry or game placement acceptance is exact.

## Version 1.2.0 - Material blue and pointer placement

- 39 unit/integration tests pass, including seven pointer-target tests for all cardinal support rotations, local edge inference, wall extensions and camera-facing trap sides. Nine local saves / 27,322 imported transforms remain unchanged.
- The final packaged 1.2.0 Windows EXE passed the new native blue-smoke workflow: hover preview, click placement, continued build mode, occupied-face rejection, rotation button/shortcut, Escape, undo/redo, bulk trap offsets, copy/paste, JSON draft saving, .sav export/reimport, search empty state, both color themes and the 960x640 minimum window.
- No renderer errors or HTTP(S) requests were observed in that packaged test. Real bundled mesh thumbnails, light/dark screenshots, compact layout and ghost placement were visually inspected. The updated package was opened for the user's test.
- Production assets and main/preload files were SHA-256 compared with their app.asar copies. The build-verification.json in the portable folder records the exact list.
- Material Web controls, a generated blue theme, bundled Roboto/Phosphor assets, and focused floating panels replace the green sidebar. Existing serialization and geometry conversion rules are retained.
- The .sav produced by the redesigned UI is checked with the native menu validators. No live Fortnite replay or installation is performed. Engine placement acceptance and previous mesh-fidelity limitations still apply.

## Version 1.1.0 — blueprint editor

- 32 tests pass, covering import precision, corrected trap pivots, native-grid placement, opposite trap faces, occupied slots, support closure, signed scales, rigid rotation, offsets, exact replay fields, undo/redo, and unchanged-source checks.
- Nine installed menu saves / 27,322 primary mesh transforms were read-only validated.
- Final packaged Windows 1.1.0 EXE passed the editor UI suite: rectangle selection, multi-file merging, 90-degree group rotation, placement previews, incompatible-support rejection, trap XYZ/angle offsets, undo/redo, cascade deletion, JSON draft saving, native .sav export and reimport.
- Final packaged EXE also passed existing Stonewood/Twine viewing, walking, flying, scene toggles, fidelity reporting and malformed-input checks. Both UI suites observed zero renderer errors and zero HTTP(S) requests.
- The UI-exported 10-piece blueprint passed the actual RDW-source HomebaseSaveFile reader, BlueprintCaptureFile.Validate, AttachmentIssues, and CreateReplayPlan checks.
- A separate 868-piece merge from two actual Twine files passed those same native validators. Generated exports/fixtures stay in ignored artifacts/validation. Original saves were unchanged.
- All 49 production renderer/asset/main/preload files were SHA-256 checked against their copies in the packaged app.asar. The portable folder contains build-verification.json.
- Portable output: artifacts/1.1.0/Homebase Viewer-win32-x64/Start-Homebase-Viewer.cmd. Versioned builds are separate; no older viewer folder was replaced.
- The native export/import format was validated locally. No blueprint was installed into Fortnite and no live server replay was performed. Terrain/build restrictions, stability, permissions and inventory are not simulated. The asset fidelity limitations documented for 1.0.1 still apply.

## Version 1.0.1 — horizontal trap pivot fix

The missing half-tile compensation is fixed. The renderer now reverses Penny's documented -256 local Unreal Y trap-centering export step on the audited edge-origin mesh families. It applies this to local geometry before saved scale, quaternion rotation and translation. Wall traps, native centre-origin anti-air, half-size jump pads and building meshes are untouched. No capture coordinates are altered.

- All 17 tests passed. New regressions read bounds from the actual bundled GLBs and verify floor/trap footprint alignment, all four yaw orientations, compound/upside-down rotations, negative/nonuniform scale, unchanged saved transforms and unaffected families.
- Nine local saves / 27,322 transforms continue to pass read-only import checks.
- Final packaged 1.0.1 EXE passed the native smoke checks with no renderer errors or HTTP(S) requests. Stonewood had 84 corrected trap records; Twine had 2,050.
- A separate native regression scene visually confirmed four rotated floor/freeze pairs align, while the anti-air and wall pairs stay aligned. Screenshot: artifacts/validation/pivot-cases.png.
- All 48 production files in app.asar were SHA-256 verified against the new build. Portable output: artifacts/1.0.1/Homebase Viewer-win32-x64.

The separate vertical ceiling seating, unrecorded component transforms, missing assets and live Unreal comparison remain unverified. This corrects the identified horizontal displacement; it is not a claim of exhaustive 1:1 visual fidelity.

## Initial version 1.0.0 validation (historical)

- TypeScript checking and production Vite build passed.
- 12 tests passed, including UTF-8/UTF-16 GVAS parsing, malformed input, duplicate identities, schema-6 exact binary64 decoding, fractional offsets, reflection-aware quaternion conversion, inverted rotations and nonuniform/negative scales.
- Read-only import of 9 existing local menu saves validated 27,322 primary mesh transforms. No save files were changed or added to this project.
- Native Electron UI tests passed against the final portable EXE: import, replacement import, scene switches, walk-mode initialization, fly-mode selection, reset, malformed-file feedback and report export. No renderer errors or HTTP(S) requests were observed.
- Stonewood sample: 937 records, 881 source mesh names matched, 56 markers (52 Flame Grill, 4 Healing Pad meshes absent from Penny).
- Twine sample: 6,561 records and source mesh names matched; 2,985 structures and 3,576 traps. This proves source-name coverage, not original-pivot fidelity.
- All 48 production renderer/asset/main-process files were compared byte-for-byte by SHA-256 against their copies in the final EXE's app.asar. The portable folder includes build-verification.json.
- Screenshots were visually inspected. Test evidence and reports are in ignored artifacts/validation. The initial packaged hidden-window screenshot timed out because Windows had not provided a compositor surface; rerunning with the temporary test window visible passed.

### Unresolved requirement at initial handoff

Exact visual 1:1 fidelity is not achieved. The supplied .sav provides saved transforms but no mesh geometry. Penny's quantized blueprint assemblies have baked component transforms and artificial trap seating offsets. The originals needed to undo these correctly are not present in the repository or available from the user. See README.md and the exported fidelity report. Primary mesh names are resolved directly from the shipped GLBs; no full trap assembly or grid/yaw inference is substituted. The viewer remains usable as a clearly labeled reference viewer, with exact imported transforms available for inspection.

No live Unreal comparison, authoritative full-homebase coverage, original mesh pivot recovery, secondary component reconstruction, or Unreal-equivalent collision behavior is claimed. Nothing was installed into Fortnite or published. RDW-source's existing edits were left untouched.
