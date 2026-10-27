# Homebase 1.2 design direction

Reading this as: a redesign of a creative 3D building tool for Fortnite homebase builders, with a calm, scene-first Material You blue language.

Mode: visual overhaul and placement workflow redesign, explicitly requested by the user. Keep capture/replay formats, copy/paste, precision, scene navigation, offsets, source attribution and offline behavior.

DESIGN_VARIANCE: 5. MOTION_INTENSITY: 3. VISUAL_DENSITY: 3. Use motivated, short panel transitions and standard Material feedback. No promotional animation in a 3D editor.

## Audit

The existing shell uses dark green surfaces, lime highlights, Segoe UI, small rectangular buttons, a monogram and a 350px permanent scrolling sidebar. Selection, placement, offsets, merging, visibility and diagnostics compete simultaneously. Placement is a support-selection form with a direction dropdown and separate preview/commit buttons. Long help paragraphs and technical identifiers make the simple action difficult to find. Preserve real previews, support validation, shortcuts, file tabs and the undo model. Retire the permanent sidebar, green chrome, raw trap names in the picker, and the form as the primary placement path.

## Implementation

Use official @material/web buttons, icon buttons and chips, Material color utilities seeded from blue #3678D7, locally bundled Roboto Variable and one Phosphor icon family. Both light and dark schemes share the same semantic tokens. System theme by default, with a manual override. The skill excludes dense product UI, so its marketing layouts, hero image requirements, SEO and scroll choreography do not apply; official Material components and direct manipulation govern this editor.

The scene occupies the workspace. A compact dock switches between selection and building. A floating build palette provides wall/floor/trap choice, material and tier. Hover a supporting piece to preview; click to place repeatedly; R rotates/cycles edges; F flips wall-trap facing; Escape returns to selection. Optional exact-placement controls remain for keyboard/numeric use. Advanced selection, offsets, merge and scene diagnostics live in focused, dismissible panels. Actual bundled mesh thumbnails show the selected piece.

Shape scale: Material pill controls, 24px floating surfaces, 12px input fields. Layers: scene 0, workspace controls 2, panels 3, status 4. Blue denotes selection/valid preview; red denotes a blocked placement. Preserve asset colors inside the world. No colored decoration or gradients.

Validation: unit tests for picking-relative placement and invariants; native Electron tests for hover/click/repeated placement, invalid slots, shortcuts, panels, themes, minimum-window layout, import/export; screenshots in both themes at desktop/minimum dimensions. Native save validators and packaged byte verification remain required. Lighthouse is not applicable to an offline Electron file:// application; measure local startup and interaction responsiveness in the native tests.

## 1.3.0 direct trap offsets

Move is a contextual dock action for trap selections. A Three translation gizmo moves rendered instances live; world Unreal axes use red X, green Y and blue Z with positive-end labels. Offset limits and optional displacement snap remain in the existing floating offset panel. A small readout reports the drag delta. Inversion is a ceiling-only build checkbox and an existing-selection action; the blue Material theme remains unchanged.

## 1.4.0 export issue navigation

Export validation stays in a persistent floating panel. One clickable row per affected piece carries every reason, with coordinates as secondary text. Red scene tint and depth-independent red bounds identify the affected builds; the selected row uses the existing blue focus treatment. A persistent badge reopens the review. The heading stays visible while scrolling. Document-wide failures occupy a separate message area in the same panel.

## 1.6.0 building workflow

Keep the Material blue editor shell. A contextual E action opens the native tile-edit grid with a live ghost in the scene, keyboard confirmation, reset/cancel and compact shape presets. Grid cells are equal-sized and support drag painting. Ramp path presets preserve native step ordering. Add an explicit Attach height control, keys 1–5 for piece choice, and a camera-angle picker. Focus on direct manipulation and short labels; no marketing layout or decorative motion.
