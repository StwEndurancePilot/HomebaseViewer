import type { Capture, Placement } from './save';
import { editStructure, type EditPattern } from './build-pieces';
import {
  attachment,
  placementConflict,
  withOffsets,
  flipCeilingTrap,
  type PastePlan,
  type Offsets,
} from './editor';
export class EditorDocument {
  selected = new Set<string>();
  private undoStack: {
    rows: Placement[];
    selected: Set<string>;
  }[] = [];
  private redoStack: {
    rows: Placement[];
    selected: Set<string>;
  }[] = [];
  revision = 0;
  savedRevision = 0;
  constructor(
    public name: string,
    public data: Capture,
    public template: Uint8Array | null,
  ) {}
  get canUndo() {
    return this.undoStack.length > 0;
  }
  get canRedo() {
    return this.redoStack.length > 0;
  }
  get dirty() {
    return this.revision !== this.savedRevision;
  }
  commit(rows: Placement[], selected: Set<string>) {
    this.undoStack.push({ rows: this.data.placements, selected: new Set(this.selected) });
    if (this.undoStack.length > 50) this.undoStack.shift();
    this.redoStack = [];
    this.data = {
      ...this.data,
      placements: rows,
      capturedCount: rows.length,
      completeHomebase: false,
    };
    this.selected = selected;
    this.revision++;
  }
  add(p: Placement) {
    const issue = placementConflict(p, this.data.placements);
    if (issue) throw new Error(issue);
    this.commit([...this.data.placements, p], new Set([p.actorPath]));
  }
  editBuilding(actorPath: string, pattern: EditPattern, turn = 0, mirror = false) {
    const source = this.data.placements.find((p) => p.actorPath === actorPath);
    if (!source) throw new Error('The selected piece no longer exists.');
    if (
      this.data.placements.some(
        (p) => p.kind === 'trap' && attachment(p)?.supportActorPath === actorPath,
      )
    )
      throw new Error('Remove attached traps before editing their support.');
    const result = editStructure(source, pattern, turn, mirror),
      issue = placementConflict(result, this.data.placements);
    if (issue) throw new Error(issue);
    this.commit(
      this.data.placements.map((p) => (p === source ? result : p)),
      new Set([actorPath]),
    );
  }
  paste(plan: PastePlan) {
    if (plan.errors.length) throw new Error(plan.errors.slice(0, 3).join('\n'));
    if (!plan.records.length) throw new Error('Everything in this group already exists here.');
    this.commit([...this.data.placements, ...plan.records], new Set(plan.added));
  }
  deleteSelected() {
    const ids = new Set(this.selected);
    for (const p of this.data.placements)
      if (p.kind === 'trap' && ids.has(attachment(p)?.supportActorPath ?? '')) ids.add(p.actorPath);
    if (
      [...ids].some(
        (key) => this.data.placements.find((p) => p.actorPath === key)?.captureRole !== 'placement',
      )
    )
      throw new Error('Fixed world references cannot be deleted as player builds.');
    if (!ids.size) throw new Error('Select pieces to delete.');
    this.commit(
      this.data.placements.filter((p) => !ids.has(p.actorPath)),
      new Set(),
    );
  }
  offsetSelected(offsets: Offsets) {
    this.editTraps((p, parent) => withOffsets(p, offsets, parent));
  }
  flipSelectedCeilings() {
    this.editTraps(flipCeilingTrap);
  }
  private editTraps(edit: (p: Placement, parent: Placement) => Placement) {
    const selected = this.data.placements.filter((p) => this.selected.has(p.actorPath));
    if (
      !selected.length ||
      selected.some((p) => p.kind !== 'trap' || p.captureRole !== 'placement')
    )
      throw new Error('Select only traps to apply menu offsets.');
    const changes = new Map<string, Placement>();
    for (const p of selected) {
      const parent = this.data.placements.find(
        (t) => t.actorPath === attachment(p)?.supportActorPath,
      );
      if (!parent || parent.kind !== 'structure' || parent.captureRole !== 'placement')
        throw new Error('A selected trap has no player-built support.');
      changes.set(p.actorPath, edit(p, parent));
    }
    const untouched = this.data.placements.filter((p) => !changes.has(p.actorPath));
    for (const p of changes.values()) {
      const issue = placementConflict(p, untouched);
      if (issue) throw new Error(issue);
      untouched.push(p);
    }
    this.commit(
      this.data.placements.map((p) => changes.get(p.actorPath) ?? p),
      new Set(this.selected),
    );
  }
  undo() {
    const old = this.undoStack.pop();
    if (!old) return;
    this.redoStack.push({ rows: this.data.placements, selected: new Set(this.selected) });
    this.data = { ...this.data, placements: old.rows, capturedCount: old.rows.length };
    this.selected = old.selected;
    this.revision++;
  }
  redo() {
    const next = this.redoStack.pop();
    if (!next) return;
    this.undoStack.push({ rows: this.data.placements, selected: new Set(this.selected) });
    this.data = { ...this.data, placements: next.rows, capturedCount: next.rows.length };
    this.selected = next.selected;
    this.revision++;
  }
}
