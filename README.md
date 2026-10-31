# Homebase Designer

Open a Fortnite STW homebase, walk through it, edit structures and traps, and export a menu-compatible blueprint. Local saves work offline. Epic sign-in and Penny account import are optional.

## Run

Install `Homebase-Designer-Setup-X.Y.Z.exe` from [GitHub Releases](https://github.com/StwEndurancePilot/HomebaseViewer/releases), then open Homebase Designer from its shortcut. New portable builds use `Start-Homebase-Designer.cmd`; older builds retain `Start-Homebase-Viewer.cmd`. The rename preserves the existing app data and installer identity.

Choose **Open homebases** or drop a `.sav`, `.asv` or capture `.json` onto the window. Original files are never overwritten automatically.

- **Orbit:** drag to rotate, right-drag to pan, scroll to zoom. Double-click a piece to frame it.
- **Walk / Fly:** click the scene to capture the mouse; use WASD and Shift. Escape releases the mouse.
- **Build:** use 1–5 to choose a wall, floor, ramp, cone or trap. Point at bare ground to start a build, or extend existing pieces. Floor and ceiling traps attach to full floors or cones edited into ramps; wall traps require a solid wall. R rotates. Page Up / Page Down changes placement height; Home restores automatic placement. In Fly, click once to capture the mouse, then aim with the crosshair and click to place. WASD moves, E / Q moves up / down, and 1–5 and R work while flying. Escape releases the mouse for panel controls.
- **Edit:** select a structure and press E. Choose an edit, then Enter to apply or Escape to cancel.
- **Move:** select pieces and use the arrow keys to move one horizontal tile relative to the camera. Page Up / Page Down moves the selection up / down one building level (384 Unreal units). Attached traps follow their structures. Ctrl+Z undoes a move. Select traps to use the XYZ handles or numeric offsets; support links are retained.
- **Requirements:** inspect material totals, trap quantities and saved perks, or filter trap visibility.
- **Trap perks:** select a trap and choose **Edit perks**. Pick perks and rarities, add or remove slots, and reorder them before applying. Changes support undo/redo and are included in drafts and exports.
- **Export .sav:** create a menu blueprint. The arrow also offers formatted JSON. **Save draft** retains the full editable document.

Export issues appear in a list and highlight affected pieces. Click an issue to select and frame it.

To support traps on a cone, edit it using **Sloped roof** (raise two adjacent corners) to make a ramp. Unedited cones and other cone shapes cannot support new traps. With **Auto-fit ramp cones** enabled (the default), aim at the ramp-shaped cone and click to place: a one-tile (512 cm) shift in front of the cone plus Z −91, Yaw 180 and Roll 180 are applied automatically relative to its base and direction. Rotating the trap does not change which side of the cone it is placed on. The preview shows the fitted trap. Optional trap offsets are additional adjustments; after placement, select the trap and use **Trap offsets** to refine it without reapplying auto-fit. Disable auto-fit for entirely manual placement. Ramp-shaped cone traps use the same base height and edge pivot as floor traps, regardless of the raised geometry. The Rotate control keeps traps centred; **Use trap offsets → Yaw 180** rotates about the actor pivot, moving edge-pivot traps one tile in the support's forward direction. Cone edits retain their own orientation. Z offsets such as −91 through −472 are literal centimetres from the base, and can be combined with Yaw 180 and Roll 180 (or Pitch 180). XYZ offsets use world axes; X −500 moves 500 cm along negative world X (a full tile is 512 cm).

## Updates and releases

Installed copies check for updates on launch, download in the background and upgrade when you close or restart. Unsaved edits keep their usual close warning.

Push to the repository’s default branch to build and publish the next version automatically. See [release setup](docs/releases.md) for the workflow, signing and installer details.

## Development

Use Node.js 22 LTS (22.12+) or 24+ and run commands from the project root.

```sh
npm ci
npm run check
npm run build
npm start
```

`npm run dev` starts the loopback browser preview. Account import requires Electron.

```sh
npm run format
npm run test:smoke
npm run package
npm run setup
```

Packaging writes a standalone Windows folder under `artifacts/<version>/` and verifies its bundled renderer and Electron files against the current build. It does not publish or install anything. `VIEWER_EXE` can point the smoke checks at a packaged EXE. Run `npm test` first to generate their fixtures.

See [architecture](docs/architecture.md), [validation](docs/validation.md), and [feature history](docs/history.md) for source details and known fidelity limits. Native menu checks need the sibling RDW-source checkout and .NET; the viewer does not.

## Attribution

Derived from Penny Launcher's outpost renderer under GPL-3.0. See [LICENSE](LICENSE) and [THIRD-PARTY.md](THIRD-PARTY.md). Preserve dependency licenses and asset provenance when distributing the viewer. Fortnite meshes and textures remain Epic Games assets.
