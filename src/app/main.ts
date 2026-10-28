import { connectLauncherFiles } from './launcher-files';
import '../styles/updates.css';
import { setupUpdatePanel } from '../ui/panels/update-panel';
import { el } from '../ui/dom';
import '../ui/theme';
import '../styles/app.css';
import '../styles/requirements.css';
import '../styles/building.css';
import { PieceEditor } from '../ui/panels/piece-editor';
import { patternOf, editStructure, type BuildKind } from '../core/build-pieces';
import { cycleColorTheme } from '../ui/theme';
import { partThumbnail } from '../ui/part-thumbnail';
import { directionAt, wallFaceAt } from '../core/placement-target';
import { parseCapture, type Placement } from '../core/save';
import {
  exportDiagnostics,
  shapeOf,
  attachment,
  selectionZDeltaRange,
  OFFSET_LIMITS,
  type OffsetLimit,
  copyGroup,
  planPaste,
  placeStructure,
  placeTrap,
  placementConflict,
  trapCategory,
  buildingRecord,
  placeStructure as makeStructure,
  type Clipboard,
  type PastePlan,
  type Offsets,
  type Vec3,
} from '../core/editor';
import { EditorDocument } from '../core/editor-document';
import { exportSave, exportJson } from '../core/export';
import { meshStem } from '../core/mesh-identity';
import { Viewer, type PlacementHit } from '../scene/viewer';
import { setupAccountPanel } from '../ui/panels/account-panel';
import {
  menuContainer,
  applyCloudTrapLevelFallback,
  repairCloudMeshMappings,
} from '../cloud/convert';
import { version } from '../../package.json';
import { trapName } from '../core/requirements';
import { RequirementsPanel, renderSelectedPerks } from '../ui/panels/requirements-panel';
setupUpdatePanel();
document.title = `Homebase Viewer ${version}`;
const val = (id: string) => el<HTMLInputElement>(id).value;
const number = (id: string) => {
  const s = val(id);
  if (!s.trim() || !Number.isFinite(Number(s)))
    throw new Error('Enter a finite number in every coordinate field.');
  return Number(s);
};
let statusTimer: ReturnType<typeof setTimeout>;
const status = (text: string) => {
  clearTimeout(statusTimer);
  el('status').textContent = text;
  if (text)
    statusTimer = setTimeout(() => {
      el('status').textContent = '';
    }, 8000);
};
const fileInput = el<HTMLInputElement>('file');
const docs: EditorDocument[] = [];
let active: EditorDocument | null = null,
  viewer: Viewer | null = null,
  loading = false;
let clipboard: Clipboard | null = null,
  clipboardName = '',
  pendingPiece: Placement | null = null,
  pendingPaste: PastePlan | null = null;
let templates: Placement[] = [];
let buildActive = false,
  edgeCycle = 0,
  faceFlipped = false,
  hoverKey = '',
  lastHit: PlacementHit | null = null,
  thumbnailRevision = 0;
const pieceEditor = new PieceEditor({
  viewer: () => viewer,
  document: current,
  open: () => {
    stopBuilding();
    closePanels();
    setMode('orbit');
  },
  render: () => render(true),
});
const exportReviews = new WeakMap<
  EditorDocument,
  {
    revision: number;
    runtime: string[];
  }
>();
const saves = new Map<
  string,
  {
    doc: EditorDocument;
    revision: number;
  }
>();
const requirementsPanel = new RequirementsPanel({
  busy: () => loading,
  filter: (ids, interactive) => {
    stopMoving();
    if (interactive) {
      el<HTMLInputElement>('showTraps').checked = true;
      syncVisibility();
    }
    viewer?.setHiddenActors(ids);
    if (active) {
      for (const id of ids) active.selected.delete(id);
      selectionUI();
    }
  },
  focus: (records) => {
    if (!active || loading) return;
    stopBuilding();
    setMode('orbit');
    el<HTMLInputElement>('showTraps').checked = true;
    el<HTMLInputElement>('showMissing').checked = true;
    syncVisibility();
    select(records, false);
    viewer?.frame(true);
  },
});

window.homebaseDownloads?.onFinished(({ url, completed }) => {
  const save = saves.get(url);
  if (save && completed) {
    save.doc.savedRevision = save.revision;
    tabs();
    status(`Saved ${save.doc.name}.`);
  } else if (save) status('Not saved. Your edits are still open.');
  saves.delete(url);
  URL.revokeObjectURL(url);
});
const names: Record<string, string> = {
  pve_01: 'Stonewood',
  pve_02: 'Plankerton',
  pve_03: 'Canny Valley',
  pve_04: 'Twine Peaks',
};
const errorText = (error: unknown) => (error instanceof Error ? error.message : String(error));
function guard(fn: () => void | Promise<void>) {
  return () => {
    if (loading) return;
    try {
      const result = fn();
      if (result) void result.catch((e) => status(errorText(e)));
    } catch (e) {
      status(errorText(e));
    }
  };
}
function current() {
  if (!active) throw new Error('Open a homebase first.');
  return active;
}
function cancelPreview() {
  hoverKey = '';
  pendingPiece = null;
  pendingPaste = null;
  el<HTMLButtonElement>('place').disabled = true;
  el<HTMLButtonElement>('commitPaste').disabled = true;
  void viewer?.preview([]);
}
function tabs() {
  const host = el('documents');
  host.replaceChildren();
  for (const doc of docs) {
    const button = document.createElement('button');
    button.textContent =
      (doc.dirty ? '● ' : '') + doc.name.replace(/^STW_Homebase_/, '').replace('Zone_Outpost_', '');
    button.title = doc.name;
    button.classList.toggle('active', doc === active);
    button.disabled = loading;
    button.onclick = guard(async () => {
      stopBuilding();
      closePanels();
      active = doc;
      await render(false);
    });
    host.append(button);
  }
}
function selected() {
  return current().data.placements.filter((p) => current().selected.has(p.actorPath));
}
function select(records: Placement[], additive: boolean) {
  if (!active || loading) return;
  pieceEditor.cancel();
  stopMoving();
  cancelPreview();
  if (!additive) active.selected.clear();
  for (const p of records) {
    if (additive && records.length === 1 && active.selected.has(p.actorPath))
      active.selected.delete(p.actorPath);
    else active.selected.add(p.actorPath);
  }
  selectionUI();
  if (selected().length === 1 && !buildActive) openPanel('selectionPanel', true);
}
function selectionUI() {
  if (!active) return;
  const rows = selected();
  viewer?.setSelection(active.selected);
  syncExportIssueSelection();
  renderSelectedPerks(rows);
  el<HTMLButtonElement>('editPiece').disabled =
    rows.length !== 1 || !patternOf(rows[0]) || rows[0].captureRole !== 'placement';
  el<HTMLButtonElement>('moveTraps').disabled =
    !rows.length || rows.some((p) => p.kind !== 'trap' || p.captureRole !== 'placement');
  el<HTMLButtonElement>('offsetMove').disabled = el<HTMLButtonElement>('moveTraps').disabled;
  el<HTMLButtonElement>('flipSelected').disabled =
    !rows.length ||
    rows.some(
      (p) => p.kind !== 'trap' || trapCategory(p) !== 'ceiling' || p.captureRole !== 'placement',
    );
  el('selectedCount').textContent = rows.length.toLocaleString();
  el('selectionHint').hidden = rows.length > 0;
  el('selectionChip').hidden = !rows.length;
  el('selectionSummary').textContent = rows.length
    ? `${rows.filter((p) => p.kind === 'structure').length} structures and ${rows.filter((p) => p.kind === 'trap').length} traps selected.`
    : 'Click a piece or box-select a group.';
  el<HTMLButtonElement>('saveDraft').disabled = false;
  el('selection').textContent =
    rows.length === 1
      ? JSON.stringify(
          {
            mesh: rows[0].meshPath,
            kind: rows[0].kind,
            role: rows[0].captureRole,
            actorPath: rows[0].actorPath,
            meshTransform: rows[0].meshTransform,
            actorTransform: rows[0].transform,
            mirrored: rows[0].mirrored,
            attachment: rows[0].attachment,
          },
          null,
          2,
        )
      : rows.length
        ? `${rows.filter((p) => p.kind === 'structure').length} structures and ${rows.filter((p) => p.kind === 'trap').length} traps selected.`
        : '';
  el<HTMLButtonElement>('undo').disabled = !active.canUndo;
  el<HTMLButtonElement>('redo').disabled = !active.canRedo;
  el<HTMLButtonElement>('newBlueprint').disabled = false;
  el<HTMLButtonElement>('exportSave').disabled = false;
  el<HTMLButtonElement>('exportOptions').disabled = false;
}
function setMode(mode: 'orbit' | 'walk' | 'fly', spawn = false) {
  if (!viewer?.report) return;
  if (mode !== 'orbit') {
    stopMoving();
    stopBuilding();
    viewer.setBoxSelection(false);
    el('boxSelect').classList.remove('active');
  }
  viewer.setMode(mode, spawn);
  for (const m of ['orbit', 'walk', 'fly']) el(m).classList.toggle('active', m === mode);
  el('crosshair').hidden = mode !== 'fly';
}
function syncVisibility() {
  if (!viewer) return;
  for (const [id, group] of [
    ['showBuilds', viewer.builds],
    ['showTraps', viewer.traps],
    ['showTerrain', viewer.terrain],
    ['showScenery', viewer.scenery],
    ['showMissing', viewer.markers],
  ] as const)
    group.visible = el<HTMLInputElement>(id).checked;
}
function refreshTemplates() {
  const previous = templates[Number(val('trapTemplate'))];
  const byVariant = new Map<string, Placement>();
  for (const doc of docs)
    for (const p of doc.data.placements)
      if (p.kind === 'trap' && p.captureRole === 'placement' && p.itemPath) {
        const key = variantKey(p);
        if (!byVariant.has(key)) byVariant.set(key, p);
      }
  templates = [...byVariant.values()].sort((a, b) =>
    (a.itemPath ?? '').localeCompare(b.itemPath ?? ''),
  );
  const select = el<HTMLSelectElement>('trapTemplate');
  select.replaceChildren();
  templates.forEach((p, i) => {
    const option = document.createElement('option');
    option.value = String(i);
    option.textContent = `${trapName(p)} / Lv ${p.trapLevel ?? '?'} / ${i + 1}`;
    select.append(option);
  });
  const index = previous ? templates.findIndex((p) => variantKey(p) === variantKey(previous)) : -1;
  if (index >= 0) select.value = String(index);
  filterTraps();
  trapInfo();
}
function trapInfo() {
  const p = val('trapTemplate') !== '' ? templates[Number(val('trapTemplate'))] : undefined;
  el('trapInfo').textContent = p
    ? `Level ${p.trapLevel ?? 'unknown'}. Perks: ${p.trapPerks || 'none captured'}`
    : 'No captured trap variants. Open a save containing traps.';
}
async function render(preserveView: boolean) {
  const doc = current();
  pieceEditor.cancel();
  stopMoving();
  loading = true;
  cancelPreview();
  el<HTMLButtonElement>('open').disabled = true;
  tabs();
  try {
    if (!viewer) {
      viewer = new Viewer(el('viewport'), select, (text) => (el('hint').textContent = text));
      viewer.onPlacementHover = hoverPlacement;
      viewer.onPlacementClick = (hit) => void clickPlacement(hit);
      configureMover();
    }
    el('welcome').hidden = true;
    el('tools').hidden = false;
    el('editor').hidden = false;
    if (!preserveView) status(`Loading ${doc.data.placements.length.toLocaleString()} pieces…`);
    syncVisibility();
    const report = await viewer.load(doc.data, doc.name, preserveView);
    if (!report) return;
    for (const m of ['orbit', 'walk', 'fly']) el(m).classList.toggle('active', m === 'orbit');
    el('crosshair').hidden = true;
    el('filename').textContent = doc.name;
    el('zone').textContent = names[report.zone ?? ''] ?? 'Custom blueprint';
    el('structures').textContent = doc.data.placements
      .filter((p) => p.kind === 'structure' && p.captureRole === 'placement')
      .length.toLocaleString();
    el('traps').textContent = doc.data.placements
      .filter((p) => p.kind === 'trap' && p.captureRole === 'placement')
      .length.toLocaleString();
    el('fidelity').textContent =
      `${report.rendered.toLocaleString()} meshes · ${report.unmatched.length.toLocaleString()} missing · ${report.trapPivotCorrections.records.toLocaleString()} pivots corrected. Geometry unverified.${doc.data.cloudImport ? ' Cloud preview uses menu mesh defaults.' : ''}`;
    el<HTMLButtonElement>('report').disabled = false;
    requirementsPanel.refresh(doc);
    refreshExportIssues();
    selectionUI();
    refreshTemplates();
    status('');
  } finally {
    loading = false;
    el<HTMLButtonElement>('open').disabled = false;
    tabs();
    if (buildActive) {
      viewer?.setPlacementMode(true);
      viewer?.refreshPlacement();
      buildHint();
    }
  }
}
async function open(files: File[]) {
  if (loading) return;
  stopBuilding();
  closePanels();
  const failures: string[] = [];
  let added = false;
  loading = true;
  el<HTMLButtonElement>('open').disabled = true;
  try {
    for (const file of files) {
      try {
        if (file.size > 128 * 1024 * 1024)
          throw new Error('Homebase files must be 128 MiB or smaller.');
        const bytes = new Uint8Array(await file.arrayBuffer());
        let data;
        try {
          data = parseCapture(bytes);
        } catch (error) {
          const header = new TextDecoder('latin1').decode(bytes.subarray(0, 65536));
          if (
            !header.includes('/Script/ExtractionCoreRuntime.SpriteSaveGame') &&
            (header.startsWith('ECFD') ||
              (bytes[0] === 31 && bytes[1] === 139) ||
              header.includes('SavedActors') ||
              header.includes('++Fortnite+Release'))
          ) {
            accountPanel.queueLocal(bytes, file.name);
            continue;
          }
          throw error;
        }
        const template =
          String.fromCharCode(...bytes.subarray(0, 4)) === 'GVAS'
            ? bytes
            : data.cloudImport
              ? menuContainer()
              : null;
        const defaultedLevels = applyCloudTrapLevelFallback(data);
        const repairedMeshes = repairCloudMeshMappings(data);
        active = new EditorDocument(file.name, data, template);
        if (defaultedLevels || repairedMeshes) active.savedRevision = -1;
        docs.push(active);
        added = true;
      } catch (e) {
        failures.push(`${file.name}: ${errorText(e)}`);
      }
    }
  } finally {
    loading = false;
    fileInput.value = '';
    el<HTMLButtonElement>('open').disabled = false;
  }
  if (added) await render(false);
  if (failures.length) status(failures.join('\n'));
}
function offsets(): Offsets {
  return {
    position: ['X', 'Y', 'Z'].map((k) => number(`offset${k}`)) as Vec3,
    angles: ['Pitch', 'Yaw', 'Roll'].map((k) => number(`offset${k}`)) as Vec3,
    limit: val('offsetLimit') as OffsetLimit,
    constrainZ: el<HTMLInputElement>('constrainZ').checked,
  };
}
function support() {
  const rows = selected();
  if (rows.length !== 1 || rows[0].kind !== 'structure')
    throw new Error('Select exactly one full floor or solid wall to support the new piece.');
  return rows[0];
}
function previewPlace() {
  cancelPreview();
  const doc = current(),
    parent = support(),
    kind = val('pieceKind');
  const record =
    kind === 'trap'
      ? placeTrap(
          (val('trapTemplate') !== '' ? templates[Number(val('trapTemplate'))] : undefined) ??
            (() => {
              throw new Error('Choose a captured trap first.');
            })(),
          parent,
          number('trapTurn'),
          number('trapSide') as 0 | 1,
          offsets(),
          val('placementMode') as 'standard' | 'menu-offset',
          ceilingInverted(),
        )
      : placeStructure(
          parent,
          kind as BuildKind,
          val('direction'),
          number('material') as 0 | 1 | 2,
          number('tier') as 1 | 2 | 3,
        );
  const issue = placementConflict(record, doc.data.placements);
  void viewer?.preview([record], !issue);
  if (issue) throw new Error(issue);
  pendingPiece = record;
  el<HTMLButtonElement>('place').disabled = false;
  status('Preview ready.');
}
function copy() {
  const doc = current();
  clipboard = copyGroup(doc.data, doc.selected);
  clipboardName = doc.name;
  const [x, y, z] = clipboard.anchor;
  el<HTMLInputElement>('pasteX').value = String(x);
  el<HTMLInputElement>('pasteY').value = String(y);
  el<HTMLInputElement>('pasteZ').value = String(z);
  el<HTMLSelectElement>('pasteYaw').value = '0';
  el('clipboardInfo').textContent =
    `${clipboard.records.length} pieces from ${clipboardName}. Anchor: ${clipboard.anchor.join(', ')}.`;
  status(`Copied ${clipboard.records.length} pieces.`);
}
function previewPaste() {
  cancelPreview();
  if (!clipboard) throw new Error('Copy a group from an open save first.');
  openPanel('pastePanel');
  const plan = planPaste(
    current().data,
    clipboard,
    ['X', 'Y', 'Z'].map((k) => number(`paste${k}`)) as Vec3,
    number('pasteYaw'),
    el<HTMLInputElement>('pasteSnap').checked,
  );
  pendingPaste = plan;
  void viewer?.preview(plan.records, !plan.errors.length);
  const crossZone =
    clipboard.worldPath !== current().data.worldPath
      ? ' Source and target maps differ; review its world location against this terrain.'
      : '';
  el('pasteInfo').textContent =
    `${plan.records.length} pieces to add · ${plan.skipped} identical pieces reused.${crossZone}`;
  if (plan.errors.length) throw new Error(plan.errors.slice(0, 3).join('\n'));
  el<HTMLButtonElement>('commitPaste').disabled = !plan.records.length;
  status(plan.records.length ? 'Ready to paste.' : 'Already here. Choose another position.');
}
function download(bytes: Uint8Array | string, name: string, type: string, doc?: EditorDocument) {
  const blob =
    typeof bytes === 'string'
      ? new Blob([bytes], { type })
      : new Blob([new Uint8Array(bytes).buffer], { type });
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  if (doc) saves.set(url, { doc, revision: doc.revision });
  a.href = url;
  a.download = name;
  a.click();
  if (!window.homebaseDownloads) setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function exportBlueprint() {
  const doc = current();
  stopBuilding();
  status('');
  exportReviews.set(doc, { revision: doc.revision, runtime: [] });
  if (refreshExportIssues(true)) return;
  try {
    const template = doc.template ?? docs.find((d) => d.template)?.template;
    if (!template)
      throw new Error('Open a menu-generated .sav once to supply its native save container.');
    const bytes = exportSave(template, doc.data),
      stem = doc.name.replace(/\.(sav|json)$/i, '').replace(/^STW_Homebase_/, '');
    download(bytes, `STW_Homebase_${stem}_Blueprint.sav`, 'application/octet-stream', doc);
    status('Choose where to save.');
  } catch (error) {
    exportReviews.set(doc, { revision: doc.revision, runtime: [errorText(error)] });
    refreshExportIssues(true);
  }
}
el('open').onclick = el('choose').onclick = () => fileInput.click();
fileInput.onchange = () =>
  void open(Array.from(fileInput.files ?? [])).catch((e) => status(errorText(e)));
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  document.body.classList.add('dragging');
});
document.addEventListener('dragleave', (e) => {
  if (!e.relatedTarget) document.body.classList.remove('dragging');
});
document.addEventListener('drop', (e) => {
  e.preventDefault();
  document.body.classList.remove('dragging');
  void open(Array.from(e.dataTransfer?.files ?? [])).catch((e) => status(errorText(e)));
});
for (const mode of ['orbit', 'walk', 'fly'] as const) el(mode).onclick = () => setMode(mode);
el('reset').onclick = () => {
  setMode('orbit');
  viewer?.frame();
};
el('respawn').onclick = () => setMode('walk', true);
el('boxSelect').onclick = guard(() => {
  stopBuilding();
  setMode('orbit');
  viewer?.setBoxSelection(!viewer.boxSelecting);
  el('boxSelect').classList.toggle('active', viewer?.boxSelecting);
  el('boxSelect').setAttribute('aria-pressed', String(Boolean(viewer?.boxSelecting)));
  el('selectTool').classList.toggle('active', !viewer?.boxSelecting);
  el('selectTool').setAttribute('aria-pressed', String(!viewer?.boxSelecting));
  el('hint').textContent = viewer?.boxSelecting
    ? 'Drag a rectangle to select pieces at every depth · Shift-drag adds · Click Box select to return to orbit'
    : 'Drag to orbit · Shift-click adds to selection';
});
for (const id of ['showBuilds', 'showTraps', 'showTerrain', 'showScenery', 'showMissing'])
  el(id).onchange = syncVisibility;
el('selectAll').onclick = guard(() =>
  select(
    current().data.placements.filter(
      (p) => p.captureRole === 'placement' && !viewer?.isFilteredOut(p.actorPath),
    ),
    false,
  ),
);
el('clearSelection').onclick = guard(() => select([], false));
el('copy').onclick = guard(copy);
el('paste').onclick = guard(() => {
  stopBuilding();
  openPanel('pastePanel');
  previewPaste();
});
el('delete').onclick = guard(async () => {
  current().deleteSelected();
  await render(true);
});
el('undo').onclick = guard(async () => {
  current().undo();
  await render(true);
});
el('redo').onclick = guard(async () => {
  current().redo();
  await render(true);
});
el('newBlueprint').onclick = guard(async () => {
  stopBuilding();
  closePanels();
  const doc = current();
  active = new EditorDocument(
    `Custom-blueprint-${docs.filter((d) => d.name.startsWith('Custom-blueprint')).length + 1}.sav`,
    {
      ...structuredClone(doc.data),
      placements: [],
      capturedCount: 0,
      completeHomebase: false,
      cloudIssues: [],
    },
    doc.template,
  );
  docs.push(active);
  await render(false);
  status('Blueprint created.');
});
el('saveDraft').onclick = guard(() => {
  const doc = current();
  download(
    JSON.stringify(doc.data, null, 2) + '\n',
    doc.name.replace(/\.(sav|json)$/i, '') + '.json',
    'application/json',
    doc,
  );
  status('Choose where to save the draft.');
});
el('exportSave').onclick = guard(exportBlueprint);
const exportMenu = document.querySelector(
  'md-menu#exportMenu',
) as import('@material/web/menu/menu').MdMenu;
el('exportOptions').onclick = () => {
  if (loading) return;
  exportMenu.open = !exportMenu.open;
};
el('exportOptions').addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown' && !loading) {
    e.preventDefault();
    exportMenu.show();
  }
});
exportMenu.addEventListener('opened', () =>
  el('exportOptions').setAttribute('aria-expanded', 'true'),
);
exportMenu.addEventListener('closed', () =>
  el('exportOptions').setAttribute('aria-expanded', 'false'),
);
el('exportMenuSav').onclick = guard(exportBlueprint);
el('exportMenuJson').onclick = guard(() => {
  const doc = current();
  stopBuilding();
  try {
    const json = exportJson(doc.data),
      stem = doc.name.replace(/\.(sav|json)$/i, '').replace(/^STW_Homebase_/, '');
    download(json, `STW_Homebase_${stem}_Blueprint.json`, 'application/json');
    status('Choose where to save.');
  } catch (error) {
    exportReviews.set(doc, { revision: doc.revision, runtime: [errorText(error)] });
    refreshExportIssues(true);
  }
});
el('previewPlace').onclick = guard(previewPlace);
el('place').onclick = guard(async () => {
  if (!pendingPiece) throw new Error('Preview the piece first.');
  current().add(pendingPiece);
  await render(true);
});
el('applyOffsets').onclick = guard(async () => {
  current().offsetSelected(offsets());
  await render(true);
  status('Offsets applied.');
});
el('zeroOffsets').onclick = () => {
  for (const k of ['X', 'Y', 'Z', 'Pitch', 'Yaw', 'Roll'])
    el<HTMLInputElement>(`offset${k}`).value = '0';
  cancelPreview();
};
el('previewPaste').onclick = guard(previewPaste);
el('commitPaste').onclick = guard(async () => {
  if (!pendingPaste) throw new Error('Preview the group first.');
  const count = pendingPaste.records.length;
  current().paste(pendingPaste);
  await render(true);
  status(`Added ${count} pieces.`);
});
el('pasteAtSelected').onclick = guard(() => {
  const rows = selected();
  if (rows.length !== 1)
    throw new Error('Select one piece to use its actor position as the target anchor.');
  ['X', 'Y', 'Z'].forEach(
    (k, i) => (el<HTMLInputElement>(`paste${k}`).value = String(rows[0].transform.translation[i])),
  );
  cancelPreview();
});
el('cancelPreview').onclick = () => {
  cancelPreview();
  status('');
};
el('pieceKind').onchange = () => choosePiece(val('pieceKind') as BuildKind | 'trap');
el('trapTemplate').onchange = () => {
  trapInfo();
  refreshPieceImage();
  placementChanged();
};
for (const id of [
  'material',
  'tier',
  'direction',
  'trapTurn',
  'trapSide',
  'placementMode',
  'offsetX',
  'offsetY',
  'offsetZ',
  'offsetPitch',
  'offsetYaw',
  'offsetRoll',
  'pasteX',
  'pasteY',
  'pasteZ',
  'pasteYaw',
  'pasteSnap',
])
  el(id).addEventListener('input', () => {
    if (id === 'placementMode')
      el<HTMLInputElement>('useOffsets').checked = val(id) === 'menu-offset';
    placementChanged();
    if (['material', 'tier'].includes(id)) refreshPieceImage();
  });
el('report').onclick = () => {
  if (viewer?.report)
    download(
      JSON.stringify(
        {
          ...viewer.report,
          cloudImport: active?.data.cloudImport,
          conversionIssues: active?.data.cloudImport ? exportDiagnostics(active.data) : undefined,
        },
        null,
        2,
      ),
      'homebase-fidelity-report.json',
      'application/json',
    );
};
document.addEventListener('keydown', (e) => {
  if (exportMenu.open) {
    if (e.key === 'Escape') {
      e.preventDefault();
      exportMenu.close();
    }
    return;
  }
  if (
    loading ||
    !active ||
    e
      .composedPath()
      .some(
        (t) => t instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT|MD-.*FIELD)$/.test(t.tagName),
      ) ||
    document.pointerLockElement
  )
    return;
  if (pieceEditor.active && e.key !== 'Escape') {
    if (e.key === 'Enter') {
      e.preventDefault();
      void pieceEditor.confirm();
    } else if (e.key.toLowerCase() === 'r') {
      e.preventDefault();
      pieceEditor.reset();
    }
    return;
  }
  if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'e') {
    e.preventDefault();
    guard(() =>
      pieceEditor.start(
        (buildActive ? lastHit?.record : selected()[0]) ??
          (() => {
            throw new Error('Select a piece to edit.');
          })(),
      ),
    )();
    return;
  }
  if (!e.ctrlKey && !e.metaKey && ['1', '2', '3', '4', '5'].includes(e.key)) {
    e.preventDefault();
    if (!buildActive) startBuilding();
    choosePiece((['wall', 'floor', 'stair', 'roof', 'trap'] as const)[Number(e.key) - 1]);
    return;
  }
  if (buildActive && ['PageUp', 'PageDown', 'Home'].includes(e.key)) {
    e.preventDefault();
    el<HTMLSelectElement>('buildHeight').value =
      e.key === 'PageUp' ? 'above' : e.key === 'PageDown' ? 'below' : 'auto';
    placementChanged();
    return;
  }
  if (e.key === 'Escape') {
    e.preventDefault();
    stopMoving();
    stopBuilding();
    closePanels();
    cancelPreview();
    status('');
    return;
  }
  if (!buildActive && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'g') {
    e.preventDefault();
    el<HTMLButtonElement>('moveTraps').click();
    return;
  }
  if (viewer?.mover.dragging) return;
  if (buildActive && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'r') {
    e.preventDefault();
    rotatePiece();
    return;
  }
  if (buildActive && !e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'f') {
    e.preventDefault();
    flipPiece();
    return;
  }
  const ctrl = e.ctrlKey || e.metaKey;
  let action: string | undefined;
  if (ctrl && e.key.toLowerCase() === 'c') action = 'copy';
  if (ctrl && e.key.toLowerCase() === 'v') action = 'paste';
  if (ctrl && e.key.toLowerCase() === 'z') action = e.shiftKey ? 'redo' : 'undo';
  if (ctrl && e.key.toLowerCase() === 'y') action = 'redo';
  if (ctrl && e.key.toLowerCase() === 'a') action = 'selectAll';
  if (e.key === 'Delete') action = 'delete';
  if (e.key === 'Escape') action = 'cancelPreview';
  if (action) {
    e.preventDefault();
    el<HTMLButtonElement>(action).click();
  }
});
window.addEventListener('beforeunload', (e) => {
  if (docs.some((doc) => doc.dirty)) {
    e.preventDefault();
    e.returnValue = '';
  }
});
el('trapsOnly').onclick = guard(() =>
  select(
    selected().filter((p) => p.kind === 'trap'),
    false,
  ),
);
el('structuresOnly').onclick = guard(() =>
  select(
    selected().filter((p) => p.kind === 'structure'),
    false,
  ),
);
el('frameSelection').onclick = guard(() => {
  setMode('orbit');
  viewer?.frame(true);
});
el('framePreview').onclick = guard(() => {
  setMode('orbit');
  viewer?.frame(false, true);
});
const panelIds = [
  'selectionPanel',
  'offsetPanel',
  'pastePanel',
  'scenePanel',
  'exportIssuesPanel',
  'requirementsPanel',
];
function closePanels() {
  pieceEditor.cancel();
  for (const id of panelIds) el(id).hidden = true;
}
function openPanel(id: string, keepRequirements = false) {
  const keep = keepRequirements && !el('requirementsPanel').hidden;
  closePanels();
  if (keep) el('requirementsPanel').hidden = false;
  el(id).hidden = false;
}
function togglePanel(id: string) {
  const visible = !el(id).hidden;
  closePanels();
  if (!visible) el(id).hidden = false;
}
function variantKey(p: Placement) {
  return JSON.stringify([
    p.classPath,
    p.itemPath,
    p.meshPath,
    p.trapLevel,
    p.trapPerks,
    p.attachmentType,
  ]);
}
function filterTraps() {
  const search = val('trapSearch').trim().toLowerCase(),
    picker = el<HTMLSelectElement>('trapTemplate');
  let first: string | null = null;
  for (const option of picker.options) {
    const p = templates[Number(option.value)],
      show =
        Boolean(p) &&
        `${trapName(p)} ${p.itemPath} ${p.trapPerks ?? ''}`.toLowerCase().includes(search);
    option.hidden = !show;
    if (show && first === null) first = option.value;
  }
  if (picker.selectedOptions[0]?.hidden || !picker.selectedOptions.length)
    picker.value = first ?? '';
  el('trapEmpty').hidden = first !== null;
  picker.disabled = first === null;
}
function idlePlacementText() {
  if (['stair', 'roof'].includes(val('pieceKind'))) return 'Point at a build tile. R rotates.';
  return val('pieceKind') === 'wall'
    ? 'Point at a floor edge or wall to build.'
    : val('pieceKind') === 'floor'
      ? 'Point at an edge, or choose Above / Below.'
      : 'Point at a matching floor or wall to place a trap.';
}
function feedback(text: string, invalid = false) {
  el('placementFeedback').textContent = text;
  el('placementFeedback').dataset.invalid = String(invalid);
}
function buildHint() {
  el('hint').textContent =
    'Click place · Drag orbit · Right-drag pan · 1–5 pieces · R rotate · E edit · PgUp / PgDn height';
}
function stopBuilding() {
  pieceEditor.cancel();
  stopMoving();
  buildActive = false;
  lastHit = null;
  hoverKey = '';
  viewer?.setPlacementMode(false);
  el('placePanel').hidden = true;
  el('buildTool').classList.remove('active');
  el('buildTool').setAttribute('aria-pressed', 'false');
  el('selectTool').classList.add('active');
  el('selectTool').setAttribute('aria-pressed', 'true');
  cancelPreview();
}
function startBuilding() {
  current();
  stopMoving();
  closePanels();
  setMode('orbit');
  viewer?.setBoxSelection(false);
  el('boxSelect').classList.remove('active');
  el('boxSelect').setAttribute('aria-pressed', 'false');
  buildActive = true;
  viewer?.setPlacementMode(true);
  el('placePanel').hidden = false;
  el('buildTool').classList.add('active');
  el('buildTool').setAttribute('aria-pressed', 'true');
  el('selectTool').classList.remove('active');
  el('selectTool').setAttribute('aria-pressed', 'false');
  choosePiece(val('pieceKind') as BuildKind | 'trap');
  buildHint();
}
function choosePiece(kind: BuildKind | 'trap') {
  el<HTMLSelectElement>('pieceKind').value = kind;
  el('trapFields').hidden = kind !== 'trap';
  el('buildingFields').hidden = kind === 'trap';
  el('rotateBuild').hidden = kind === 'trap';
  el('buildHeight').closest<HTMLElement>('label')!.hidden = kind === 'trap';
  edgeCycle = 0;
  faceFlipped = false;
  for (const name of ['Wall', 'Floor', 'Stair', 'Roof', 'Trap']) {
    const button = el(`choose${name}`),
      chosen = name.toLowerCase() === kind;
    button.setAttribute('aria-pressed', String(chosen));
    button.classList.toggle('chosen', chosen);
  }
  const chosen = templates[Number(val('trapTemplate'))];
  el('flipPiece').hidden = kind !== 'trap' || !chosen || trapCategory(chosen) !== 'wall';
  feedback(idlePlacementText());
  refreshPieceImage();
  placementChanged();
}
async function refreshPieceImage() {
  const revision = ++thumbnailRevision,
    kind = val('pieceKind');
  let record: Placement | undefined;
  if (kind === 'trap') {
    const source = val('trapTemplate') !== '' ? templates[Number(val('trapTemplate'))] : undefined;
    if (source)
      record = {
        ...source,
        meshTransform: { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
      };
    el('flipPiece').hidden = !source || trapCategory(source) !== 'wall';
    el('ceilingFlipRow').hidden = !source || trapCategory(source) !== 'ceiling';
  } else
    record = buildingRecord(
      kind as BuildKind,
      number('material') as 0 | 1 | 2,
      number('tier') as 1 | 2 | 3,
      { translation: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] },
    );
  const image = el<HTMLImageElement>('pieceImage');
  try {
    const url = record ? await partThumbnail([record]) : null;
    if (revision !== thumbnailRevision) return;
    image.hidden = !url;
    el('pieceFallback').hidden = Boolean(url);
    if (url) {
      image.src = url;
      image.alt =
        kind === 'trap'
          ? trapName(record!)
          : `${['Wood', 'Brick', 'Metal'][number('material')]} ${kind}`;
    }
  } catch {
    if (revision === thumbnailRevision) {
      image.hidden = true;
      el('pieceFallback').hidden = false;
    }
  }
}
function placementChanged() {
  cancelPreview();
  if (buildActive) {
    feedback(idlePlacementText());
    if (lastHit) hoverPlacement(lastHit);
    viewer?.refreshPlacement();
  }
}
function rotatePiece() {
  if (val('pieceKind') === 'trap') {
    const turn = (number('trapTurn') + 90) % 360;
    el<HTMLSelectElement>('trapTurn').value = String(turn);
    el('rotationLabel').textContent = `Rotate ${turn}°`;
  } else edgeCycle++;
  placementChanged();
}
function ceilingInverted() {
  const p = templates[Number(val('trapTemplate'))];
  return Boolean(p && trapCategory(p) === 'ceiling' && el<HTMLInputElement>('ceilingFlip').checked);
}
el('ceilingFlip').onchange = placementChanged;
function flipPiece() {
  faceFlipped = !faceFlipped;
  el('flipPiece').setAttribute('aria-pressed', String(faceFlipped));
  placementChanged();
}
function hoverPlacement(hit: PlacementHit | null): boolean {
  if (!buildActive || loading) return false;
  lastHit = hit;
  if (!hit) {
    if (pendingPiece || hoverKey) cancelPreview();
    feedback(idlePlacementText());
    return false;
  }
  const kind = val('pieceKind');
  try {
    const height = val('buildHeight') as 'auto' | 'above' | 'below' | 'beside';
    const direction = ['stair', 'roof'].includes(kind)
        ? height
        : directionAt(
            hit.record,
            hit.point,
            kind === 'floor' ? 'floor' : 'wall',
            edgeCycle,
            height,
            hit.camera,
          ),
      side = wallFaceAt(hit.record, hit.camera, faceFlipped);
    const key = JSON.stringify([
      hit.record.actorPath,
      direction,
      side,
      kind,
      edgeCycle,
      val('material'),
      val('tier'),
      val('trapTemplate'),
      val('trapTurn'),
      val('placementMode'),
      ceilingInverted(),
      offsets(),
      current().revision,
    ]);
    if (key === hoverKey) return Boolean(pendingPiece);
    cancelPreview();
    hoverKey = key;
    const chosen = val('trapTemplate') !== '' ? templates[Number(val('trapTemplate'))] : undefined;
    let record =
      kind === 'trap'
        ? placeTrap(
            chosen ??
              (() => {
                throw new Error('Open a save containing this trap first.');
              })(),
            hit.record,
            number('trapTurn'),
            side,
            offsets(),
            val('placementMode') as 'standard' | 'menu-offset',
            ceilingInverted(),
          )
        : placeStructure(
            hit.record,
            kind as BuildKind,
            direction,
            number('material') as 0 | 1 | 2,
            number('tier') as 1 | 2 | 3,
          );
    if (kind === 'stair' || kind === 'roof')
      record = editStructure(record, patternOf(record)!, edgeCycle * 90, false);
    const issue = placementConflict(record, current().data.placements);
    void viewer?.preview([record], !issue);
    if (issue) {
      feedback(issue, true);
      return false;
    }
    pendingPiece = record;
    el<HTMLButtonElement>('place').disabled = false;
    feedback(
      kind === 'trap'
        ? `Click to place ${trapName(record)}.`
        : `Click to place ${kind === 'wall' ? 'a wall' : kind === 'floor' ? 'a floor' : kind === 'stair' ? 'a ramp' : 'a cone'} here.`,
    );
    return true;
  } catch (e) {
    pendingPiece = null;
    el<HTMLButtonElement>('place').disabled = true;
    void viewer?.preview([]);
    feedback(errorText(e), true);
    return false;
  }
}
async function clickPlacement(hit: PlacementHit | null) {
  if (loading || !buildActive || !hoverPlacement(hit) || !pendingPiece) return;
  try {
    current().add(pendingPiece);
    await render(true);
    buildHint();
  } catch (e) {
    status(errorText(e));
  }
}
el('theme').onclick = cycleColorTheme;
el('buildTool').onclick = guard(() => {
  if (buildActive) {
    stopBuilding();
    setMode('orbit');
  } else startBuilding();
});
el('selectTool').onclick = () => {
  stopBuilding();
  viewer?.setBoxSelection(false);
  el('boxSelect').classList.remove('active');
  el('boxSelect').setAttribute('aria-pressed', 'false');
  setMode('orbit');
};
el('closeBuild').onclick = () => {
  stopBuilding();
  setMode('orbit');
};
for (const kind of ['Wall', 'Floor', 'Stair', 'Roof', 'Trap'])
  el(`choose${kind}`).onclick = () => choosePiece(kind.toLowerCase() as BuildKind | 'trap');
for (const chip of document.querySelectorAll<HTMLElement>('[data-material]'))
  chip.onclick = () => {
    el<HTMLSelectElement>('material').value = chip.dataset.material!;
    for (const sibling of document.querySelectorAll<HTMLElement>('[data-material]'))
      (
        sibling as HTMLElement & {
          selected: boolean;
        }
      ).selected = sibling === chip;
    placementChanged();
    refreshPieceImage();
  };
el('trapSearch').oninput = () => {
  filterTraps();
  trapInfo();
  refreshPieceImage();
  placementChanged();
};
el('rotatePiece').onclick = rotatePiece;
el('flipPiece').onclick = flipPiece;
el('useOffsets').onchange = () => {
  el<HTMLSelectElement>('placementMode').value = el<HTMLInputElement>('useOffsets').checked
    ? 'menu-offset'
    : 'standard';
  placementChanged();
};
el('editOffsets').onclick = () => openPanel('offsetPanel');
el('selectionChip').onclick = () => {
  stopBuilding();
  togglePanel('selectionPanel');
};
el('selectionOffsets').onclick = () => openPanel('offsetPanel');
el('sceneToggle').onclick = () => {
  stopBuilding();
  togglePanel('scenePanel');
};
el('requirementsButton').onclick = guard(() => {
  stopBuilding();
  togglePanel('requirementsPanel');
});
for (const button of document.querySelectorAll<HTMLElement>('[data-close-panel]'))
  button.onclick = () => {
    const panel = button.closest<HTMLElement>('.floating-panel');
    if (panel) panel.hidden = true;
  };
const welcomeFloor = buildingRecord('floor', 2, 3, {
  translation: [0, 0, 0],
  rotation: [0, 0, 0, 1],
  scale: [1, 1, 1],
});
void partThumbnail([welcomeFloor, makeStructure(welcomeFloor, 'wall', 'south', 2, 3)])
  .then((url) => {
    if (url) el<HTMLImageElement>('welcomeModel').src = url;
    else el('welcomeModel').hidden = true;
  })
  .catch(() => {
    el('welcomeModel').hidden = true;
  });
function stopMoving() {
  viewer?.mover.detach();
  el('moveReadout').hidden = true;
  el('moveTraps').classList.remove('active');
}
function configureMover() {
  const v = viewer!;
  v.mover.onPreview = (delta) => {
    if (!active) return;
    v.previewTrapMove(active.selected, delta);
    el('moveReadout').hidden = false;
    el('moveReadout').textContent =
      `X ${delta[0].toFixed(2)} · Y ${delta[1].toFixed(2)} · Z ${delta[2].toFixed(2)} cm · Esc cancels`;
  };
  v.mover.onCommit = (delta) => {
    void (async () => {
      try {
        current().offsetSelected({
          position: delta,
          angles: [0, 0, 0],
          limit: val('offsetLimit') as OffsetLimit,
          constrainZ: el<HTMLInputElement>('constrainZ').checked,
        });
        await render(true);
        startMoving(false);
      } catch (e) {
        v.previewTrapMove(current().selected, [0, 0, 0]);
        stopMoving();
        status(errorText(e));
      }
    })();
  };
}
function startMoving(showPanel = true) {
  const rows = selected(),
    doc = current();
  if (!rows.length || rows.some((p) => p.kind !== 'trap' || p.captureRole !== 'placement'))
    throw new Error('Select one or more traps to move. Use Keep traps for a mixed selection.');
  if (
    rows.some(
      (p) =>
        !doc.data.placements.some(
          (s) =>
            s.actorPath === attachment(p)?.supportActorPath &&
            s.kind === 'structure' &&
            s.captureRole === 'placement',
        ),
    )
  )
    throw new Error('Selected traps need captured building supports.');
  stopBuilding();
  setMode('orbit');
  viewer!.setBoxSelection(false);
  el('boxSelect').classList.remove('active');
  configureMoveLimits();
  viewer!.startTrapMove();
  el('moveTraps').classList.add('active');
  if (showPanel) openPanel('offsetPanel');
  el('moveReadout').textContent = 'Drag an axis or plane · Esc finishes · Ctrl+Z undoes';
  el('moveReadout').hidden = false;
  el('hint').textContent =
    'Move traps in world XYZ · Red X · Green Y · Blue Z · Supports stay in place';
}
el('moveTraps').onclick = guard(() => {
  if (viewer?.mover.active) stopMoving();
  else startMoving();
});
el('offsetMove').onclick = guard(() => startMoving());
el('flipSelected').onclick = guard(async () => {
  stopMoving();
  current().flipSelectedCeilings();
  await render(true);
  status('Ceiling traps flipped.');
});
function syncOffsetLimits() {
  const limit = OFFSET_LIMITS[val('offsetLimit') as OffsetLimit];
  for (const name of ['X', 'Y', 'Z', 'Pitch', 'Yaw', 'Roll']) {
    const input = el<HTMLInputElement>(`offset${name}`),
      max = name.length === 1 ? limit.position : limit.angle;
    if (Number.isFinite(max)) {
      input.min = String(-max);
      input.max = String(max);
    } else {
      input.removeAttribute('min');
      input.removeAttribute('max');
    }
  }
  if (viewer) {
    viewer.mover.cancel();
    configureMoveLimits();
  }
  placementChanged();
}
el('offsetLimit').onchange = guard(syncOffsetLimits);
el('moveSnap').onchange = guard(syncOffsetLimits);
function configureMoveLimits() {
  if (!viewer) return;
  viewer.mover.max = OFFSET_LIMITS[val('offsetLimit') as OffsetLimit].position;
  viewer.mover.step = number('moveSnap');
  const rows = active ? selected() : [];
  viewer.mover.zRange =
    el<HTMLInputElement>('constrainZ').checked &&
    rows.length &&
    rows.every((p) => p.kind === 'trap')
      ? selectionZDeltaRange(rows, current().data.placements)
      : [-Infinity, Infinity];
}
el('constrainZ').onchange = guard(syncOffsetLimits);
function issuePieceName(p: Placement, index: number) {
  const meshShape = shapeOf(p),
    shape =
      meshShape !== 'other'
        ? meshShape
        : p.buildingType === 0
          ? 'wall'
          : p.buildingType === 1
            ? 'floor'
            : 'other',
    name =
      p.kind === 'trap'
        ? trapName(p)
        : shape !== 'other'
          ? `${['Wood', 'Brick', 'Metal'][Number(p.resourceType)] ?? 'Building'} ${shape}`
          : meshStem(p.meshPath || p.classPath).replaceAll('_', ' ') || 'Structure';
  return `${name} · #${index + 1}`;
}
function syncExportIssueSelection() {
  for (const button of el('exportIssueList').querySelectorAll<HTMLButtonElement>(
    'button[data-actor-path]',
  )) {
    const chosen = Boolean(active?.selected.has(button.dataset.actorPath!));
    button.setAttribute('aria-pressed', String(chosen));
  }
  el<HTMLButtonElement>('issueSelectionTools').disabled = !active?.selected.size;
}
function focusExportIssue(actorPath: string) {
  if (loading || !active) return;
  const rows = active.data.placements.filter((p) => p.actorPath === actorPath);
  if (!rows.length) {
    refreshExportIssues();
    return;
  }
  stopBuilding();
  setMode('orbit');
  viewer?.setBoxSelection(false);
  el('boxSelect').classList.remove('active');
  el('boxSelect').setAttribute('aria-pressed', 'false');
  for (const p of rows)
    el<HTMLInputElement>(p.kind === 'structure' ? 'showBuilds' : 'showTraps').checked = true;
  requirementsPanel.reveal(rows);
  el<HTMLInputElement>('showMissing').checked = true;
  syncVisibility();
  select(rows, false);
  viewer?.frame(true);
  openPanel('exportIssuesPanel');
  el('hint').textContent =
    'Issue selected · Use Selection tools to edit, or Delete to remove it · Ctrl+Z undoes';
}
function refreshExportIssues(show = false): number {
  const doc = active,
    review = doc ? exportReviews.get(doc) : undefined;
  if (!doc || !review) {
    viewer?.setExportIssues(new Set());
    el('exportIssuesButton').hidden = true;
    el('exportIssuesPanel').hidden = true;
    el('exportIssueList').replaceChildren();
    el('exportGeneralIssues').replaceChildren();
    return 0;
  }
  if (review.revision !== doc.revision) {
    review.revision = doc.revision;
    review.runtime = [];
  }
  const diagnostics = exportDiagnostics(doc.data),
    general = diagnostics.filter((d) => !d.actorPaths.length).map((d) => d.message);
  if (!(doc.template ?? docs.find((d) => d.template)?.template))
    general.push(
      'Open a menu-generated .sav once to provide the native save container. Your JSON draft can still be saved.',
    );
  general.push(...review.runtime);
  const byActor = new Map<string, Set<string>>();
  for (const issue of diagnostics)
    for (const id of issue.actorPaths) {
      const messages = byActor.get(id) ?? new Set<string>();
      messages.add(issue.message);
      byActor.set(id, messages);
    }
  viewer?.setExportIssues(new Set(byActor.keys()));
  const issueCount =
    diagnostics.length + general.length - diagnostics.filter((d) => !d.actorPaths.length).length;
  el('exportIssuesButton').hidden = false;
  el('exportIssuesButton').textContent = issueCount
    ? `Export issues · ${issueCount}`
    : 'Export ready';
  el('exportIssueSummary').textContent = issueCount
    ? `${issueCount} issue${issueCount === 1 ? '' : 's'} across ${byActor.size} piece${byActor.size === 1 ? '' : 's'}. Select an issue to locate it.`
    : 'All checks passed.';
  const globals = el('exportGeneralIssues');
  globals.replaceChildren();
  for (const message of new Set(general)) {
    const li = document.createElement('li');
    li.textContent = message;
    globals.append(li);
  }
  globals.hidden = !general.length;
  const list = el('exportIssueList'),
    fragment = document.createDocumentFragment();
  list.replaceChildren();
  const records = new Map(doc.data.placements.map((p, i) => [p.actorPath, { p, i }]));
  for (const [actorPath, messages] of byActor) {
    const record = records.get(actorPath);
    if (!record) continue;
    const { p, i } = record,
      li = document.createElement('li'),
      button = document.createElement('button'),
      title = document.createElement('strong'),
      position = document.createElement('span'),
      reason = document.createElement('span');
    button.type = 'button';
    button.dataset.actorPath = actorPath;
    button.className = 'export-issue-item';
    const name = issuePieceName(p, i);
    title.textContent = name;
    position.className = 'issue-position';
    position.textContent = `X ${p.transform.translation[0].toFixed(2)} · Y ${p.transform.translation[1].toFixed(2)} · Z ${p.transform.translation[2].toFixed(2)}`;
    reason.textContent = [...messages].join(' ');
    reason.className = 'issue-reason';
    button.setAttribute('aria-label', `Select and frame ${name}. ${reason.textContent}`);
    button.onclick = guard(() => focusExportIssue(actorPath));
    button.append(title, position, reason);
    li.append(button);
    fragment.append(li);
  }
  list.append(fragment);
  syncExportIssueSelection();
  if (show) openPanel('exportIssuesPanel');
  return issueCount;
}
el('exportIssuesButton').onclick = guard(() => {
  stopBuilding();
  refreshExportIssues(true);
});
el('recheckExport').onclick = guard(() => {
  const doc = current();
  exportReviews.set(doc, { revision: doc.revision, runtime: [] });
  refreshExportIssues(true);
});
el('retryExport').onclick = guard(exportBlueprint);
el('issueSelectionTools').onclick = () => openPanel('selectionPanel');
el('clearExportIssues').onclick = () => {
  if (active) exportReviews.delete(active);
  refreshExportIssues();
};
const accountPanel = setupAccountPanel(async (data, name) => {
  if (loading)
    throw new Error('Wait for the current homebase to finish loading, then retry import.');
  stopBuilding();
  closePanels();
  active = new EditorDocument(
    name,
    data,
    docs.find((d) => d.template)?.template ?? menuContainer(),
  );
  docs.push(active);
  active.savedRevision = -1;
  exportReviews.set(active, { revision: active.revision, runtime: [] });
  await render(false);
  const count = refreshExportIssues();
  if (count) refreshExportIssues(true);
  else status(`Imported ${data.placements.length.toLocaleString()} pieces.`);
});
el('editPiece').onclick = guard(() => pieceEditor.start(selected()[0]));
el('buildHeight').onchange = placementChanged;
el('cameraView').onchange = () => {
  setMode('orbit');
  viewer?.viewFrom(val('cameraView'));
};
el('rotateBuild').onclick = rotatePiece;

connectLauncherFiles(open, () => loading, status);
