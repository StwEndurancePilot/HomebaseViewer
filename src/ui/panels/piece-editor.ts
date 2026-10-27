import { el } from '../dom';
import type { Placement } from '../../core/save';
import { attachment } from '../../core/editor';
import type { EditorDocument } from '../../core/editor-document';
import {
  EDIT_PATTERNS,
  buildDefinition,
  patternOf,
  mirrorCells,
  rotateCells,
  matchEdit,
  editStructure,
  definitionFor,
  type EditPattern,
} from '../../core/build-pieces';
import type { Viewer } from '../../scene/viewer';
export class PieceEditor {
  private source: Placement | null = null;
  private doc: EditorDocument | null = null;
  private revision = 0;
  private cells: number[] = [];
  private initialCells: number[] = [];
  private kind: EditPattern['kind'] = 'wall';
  private paint: number | null = null;
  private visited = new Set<number>();
  constructor(
    private callbacks: {
      viewer: () => Viewer | null;
      document: () => EditorDocument;
      open: () => void;
      render: () => Promise<void>;
    },
  ) {
    el('cancelPieceEdit').onclick = () => this.cancel();
    el('closePieceEdit').onclick = () => this.cancel();
    el('confirmPieceEdit').onclick = () => void this.confirm();
    el('resetPieceEdit').onclick = () => this.reset();
    el('rotatePieceEdit').onclick = () => this.rotate();
    el('mirrorPieceEdit').onclick = () => {
      this.cells = mirrorCells(this.cells, this.kind === 'wall' ? 3 : 2);
      this.refresh();
    };
    el('facePieceEdit').onclick = () => {
      if (this.source) this.callbacks.viewer()?.facePiece(this.source);
    };
    document.addEventListener('pointerup', () => {
      this.paint = null;
      this.visited.clear();
    });
  }
  get active() {
    return Boolean(this.source);
  }
  start(source: Placement) {
    const pattern = patternOf(source);
    if (!pattern || source.captureRole !== 'placement')
      throw new Error('Select a player-built wall, floor, ramp or cone to edit.');
    const doc = this.callbacks.document();
    if (
      doc.data.placements.some(
        (p) => p.kind === 'trap' && attachment(p)?.supportActorPath === source.actorPath,
      )
    )
      throw new Error('Remove attached traps before editing their support.');
    this.callbacks.open();
    this.doc = doc;
    this.revision = doc.revision;
    this.source = source;
    this.kind = pattern.kind;
    this.cells = source.mirrored
      ? mirrorCells(pattern.cells, this.kind === 'wall' ? 3 : 2)
      : [...pattern.cells];
    this.initialCells = [...this.cells];
    el('pieceEditPanel').hidden = false;
    el('pieceEditTitle').textContent =
      `Edit ${this.kind === 'stair' ? 'ramp' : this.kind === 'roof' ? 'cone' : this.kind}`;
    el('pieceEditPanel').querySelector('details')!.open = this.kind === 'stair';
    el('pieceEditHelp').textContent =
      this.kind === 'stair'
        ? 'Choose a path, then rotate or mirror.'
        : this.kind === 'roof'
          ? 'Click corners to raise or lower them.'
          : 'Click or drag across tiles to remove them.';
    el('rotatePieceEdit').hidden = this.kind === 'wall';
    const host = el('pieceEditPresets');
    host.replaceChildren();
    const def = buildDefinition(source)!;
    for (const preset of EDIT_PATTERNS.filter((p) => p.kind === this.kind)) {
      try {
        definitionFor(preset.id, def.material, def.tier);
      } catch {
        continue;
      }
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = preset.label;
      button.dataset.pattern = preset.id;
      button.onclick = () => {
        this.cells = [...preset.cells];
        this.refresh();
      };
      host.append(button);
    }
    this.callbacks.viewer()?.facePiece(source);
    this.callbacks.viewer()?.setEditTarget(source.actorPath);
    this.refresh();
    el('pieceEditPanel').scrollTop = 0;
  }
  cancel() {
    if (!this.source) return;
    this.source = null;
    this.doc = null;
    this.paint = null;
    el('pieceEditPanel').hidden = true;
    this.callbacks.viewer()?.setEditTarget(null);
    void this.callbacks.viewer()?.preview([]);
  }
  reset() {
    this.cells = [
      ...EDIT_PATTERNS.find(
        (p) =>
          p.id === { wall: 'Solid', floor: 'Floor', stair: 'StairW', roof: 'RoofC' }[this.kind],
      )!.cells,
    ];
    this.refresh();
  }
  rotate() {
    if (this.kind === 'wall') return;
    this.cells = rotateCells(this.cells);
    this.refresh();
  }
  private refresh() {
    if (!this.source) return;
    const grid = el('pieceEditGrid');
    grid.style.setProperty('--edit-columns', this.kind === 'wall' ? '3' : '2');
    if (grid.children.length !== this.cells.length || grid.dataset.kind !== this.kind) {
      grid.replaceChildren();
      grid.dataset.kind = this.kind;
      this.cells.forEach((_, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.dataset.cell = String(i);
        b.addEventListener('pointerdown', (e) => {
          if (e.button !== 0 || this.kind === 'stair') return;
          e.preventDefault();
          this.paint = this.cells[i] ? 0 : 1;
          this.visited = new Set([i]);
          this.cells[i] = this.paint;
          this.refresh();
        });
        b.addEventListener('pointerenter', (e) => {
          if (!e.buttons || this.paint === null || this.visited.has(i) || this.kind === 'stair')
            return;
          this.visited.add(i);
          this.cells[i] = this.paint;
          this.refresh();
        });
        b.onclick = (e) => {
          if (e.detail !== 0 || this.kind === 'stair') return;
          this.cells[i] = this.cells[i] ? 0 : 1;
          this.refresh();
        };
        grid.append(b);
      });
    }
    [...grid.children].forEach((node, i) => {
      const b = node as HTMLButtonElement;
      b.classList.toggle('kept', this.cells[i] > 0);
      b.setAttribute('aria-pressed', String(this.cells[i] > 0));
      b.setAttribute('aria-label', `Tile ${i + 1}: ${this.cells[i] ? 'kept' : 'removed'}`);
      b.textContent =
        this.kind === 'stair'
          ? this.cells[i]
            ? String(this.cells[i])
            : ''
          : this.cells[i]
            ? ''
            : '×';
      b.disabled = this.kind === 'stair';
    });
    const match = matchEdit(this.kind, this.cells);
    let message = 'Not a valid edit. Choose another pattern.',
      valid = false;
    if (match) {
      try {
        const unchanged = this.cells.every((v, i) => v === this.initialCells[i]);
        const record = unchanged
          ? this.source
          : editStructure(this.source, match.pattern, match.turn, match.mirror);
        void this.callbacks.viewer()?.preview([record]);
        message = match.pattern.label;
        valid = true;
      } catch (e) {
        message = (e as Error).message;
      }
    }
    if (!valid) void this.callbacks.viewer()?.preview([this.source], false);
    el('pieceEditResult').textContent = message;
    el('pieceEditResult').dataset.invalid = String(!valid);
    el<HTMLButtonElement>('confirmPieceEdit').disabled = !valid;
    for (const b of el('pieceEditPresets').querySelectorAll('button'))
      b.setAttribute('aria-pressed', String(match?.pattern.id === b.dataset.pattern));
  }
  async confirm() {
    if (!this.source || !this.doc) return;
    try {
      if (this.doc !== this.callbacks.document() || this.doc.revision !== this.revision)
        throw new Error('The blueprint changed. Reopen this edit.');
      if (this.cells.every((v, i) => v === this.initialCells[i])) {
        this.cancel();
        return;
      }
      const match = matchEdit(this.kind, this.cells);
      if (!match) throw new Error('Choose a valid edit pattern.');
      this.doc.editBuilding(this.source.actorPath, match.pattern, match.turn, match.mirror);
      this.cancel();
      await this.callbacks.render();
    } catch (e) {
      el('pieceEditResult').textContent = (e as Error).message;
    }
  }
}
