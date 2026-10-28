import { el } from '../dom';
import type { EditorDocument } from '../../core/editor-document';
import type { Placement } from '../../core/save';
import {
  requirements,
  trapName,
  trapPerks,
  trapTypeKey,
  type Requirements,
} from '../../core/requirements';
import { trapArtwork, trapRarity } from '../inventory-art';
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}
function button(text: string, action: () => void, cls = 'requirement-action') {
  const n = element('button', text, cls);
  n.type = 'button';
  n.onclick = action;
  return n;
}
function level(p: Placement) {
  return typeof p.trapLevel === 'number' && Number.isFinite(p.trapLevel)
    ? `Level ${p.trapLevel}`
    : 'Level unknown';
}
function itemLabel(p: Placement) {
  const leaf = (p.itemPath ?? '').split('.').at(-1) ?? '',
    tier = /_T(\d+)$/i.exec(leaf),
    rarity = /_(UR|SR|VR|UC|R|C)(?:_|$)/i.exec(leaf);
  const names: Record<string, string> = {
    C: 'Common',
    UC: 'Uncommon',
    R: 'Rare',
    VR: 'Epic',
    SR: 'Legendary',
    UR: 'Mythic',
  };
  return (
    [rarity ? names[rarity[1].toUpperCase()] : null, tier ? `Tier ${Number(tier[1])}` : null]
      .filter(Boolean)
      .join(' · ') || leaf
  );
}
function perkList(p: Placement) {
  const data = trapPerks(p),
    list = element('ol', undefined, 'perk-list');
  if (data.state !== 'recorded' && data.state !== 'observed')
    return element(
      'p',
      { empty: 'No perks', unknown: 'Perks not recorded', unreadable: 'Perks could not be read' }[
        data.state
      ],
      'muted perk-note',
    );
  list.setAttribute('aria-label', 'Saved perks');
  for (const perk of data.perks) {
    const row = element('li'),
      text = element('span', perk.label, 'perk-description');
    row.dataset.rarity = perk.rarity?.toLowerCase() ?? 'unknown';
    text.title = perk.path;
    const rank =
      ['common', 'uncommon', 'rare', 'epic', 'legendary'].indexOf(row.dataset.rarity) + 1;
    const emblem = element('span', undefined, 'perk-rank');
    emblem.setAttribute('aria-hidden', 'true');
    const glyph = element('i', undefined, `ph ph-${rank ? 'caret-double-up' : 'sparkle'}`);
    emblem.append(glyph);
    if (rank) {
      const bars = element('span', undefined, 'perk-rank-bars');
      for (let i = 0; i < 5; i++) bars.append(element('b', undefined, i < rank ? 'lit' : ''));
      emblem.append(bars);
    }
    const label = element('span', undefined, 'perk-copy');
    label.append(text);
    if (perk.rarity) label.append(element('small', perk.rarity));
    if (!perk.known) label.append(element('small', 'Unknown perk'));
    row.append(emblem, label);
    list.append(row);
  }
  if (data.state === 'observed') {
    const group = element('div');
    group.append(
      element(
        'p',
        'Observed perks � the list may be incomplete; slot order is unknown.',
        'muted perk-note',
      ),
      list,
    );
    return group;
  }
  return list;
}
function trapArt(p: Placement, mixed = false) {
  const host = element('span', undefined, 'trap-art');
  host.dataset.rarity = mixed ? 'unknown' : trapRarity(p);
  const src = trapArtwork(p);
  if (src) {
    const img = element('img');
    img.src = src;
    img.alt = '';
    img.width = 64;
    img.height = 64;
    img.decoding = 'async';
    host.append(img);
  } else {
    const fallback = element('i', undefined, 'ph ph-cube');
    fallback.setAttribute('aria-hidden', 'true');
    host.append(fallback);
  }
  return host;
}
export function renderSelectedPerks(rows: Placement[]) {
  let host = el('selectedTrapPerks');
  if (!host) {
    host = element('section');
    host.id = 'selectedTrapPerks';
    el('selectionPanel').insertBefore(host, el('selectionPanel').querySelector('details'));
  }
  host.replaceChildren();
  host.hidden = rows.length !== 1 || rows[0].kind !== 'trap';
  if (host.hidden) return;
  const p = rows[0],
    heading = element('div', undefined, 'selected-trap-heading'),
    copy = element('div');
  copy.append(element('h3', trapName(p)), element('p', `${level(p)} · ${itemLabel(p)}`, 'muted'));
  heading.append(trapArt(p), copy);
  host.append(heading, perkList(p));
}
type FilterState = {
  hidden: Set<string>;
  expanded: Set<string>;
};
export class RequirementsPanel {
  private states = new WeakMap<EditorDocument, FilterState>();
  private doc: EditorDocument | null = null;
  private model: Requirements | null = null;
  constructor(
    private callbacks: {
      filter: (ids: Set<string>, interactive: boolean) => void;
      focus: (records: Placement[]) => void;
      busy: () => boolean;
    },
  ) {
    el('requirementsShowAll').onclick = () => {
      if (this.callbacks.busy() || !this.doc) return;
      this.state().hidden.clear();
      this.apply(true);
    };
    el<HTMLInputElement>('requirementsSearch').oninput = () => this.search();
  }
  private state() {
    let state = this.states.get(this.doc!);
    if (!state) {
      state = { hidden: new Set(), expanded: new Set() };
      this.states.set(this.doc!, state);
    }
    return state;
  }
  refresh(doc: EditorDocument) {
    if (this.doc !== doc) el<HTMLInputElement>('requirementsSearch').value = '';
    this.doc = doc;
    this.model = requirements(doc.data);
    const state = this.state(),
      model = this.model;
    ['Wood', 'Stone', 'Metal'].forEach((name, i) => {
      el(`required${name}`).textContent = model.materials[i].toLocaleString();
      el(`required${name}`).title = `${model.materialPieces[i].toLocaleString()} structures`;
    });
    el('requirementsTotals').textContent =
      `${model.structures.toLocaleString()} builds · ${model.traps.toLocaleString()} traps`;
    const warning = el('requirementsWarning');
    warning.hidden = !model.unknownStructures;
    warning.textContent = `Totals incomplete: ${model.unknownStructures} structures have unknown material or tier.`;
    const host = el('requiredTrapList');
    host.replaceChildren();
    for (const type of model.types) {
      const row = element('div', undefined, 'requirement-type');
      row.dataset.trapType = type.key;
      const toggle = element('input');
      toggle.type = 'checkbox';
      toggle.checked = !state.hidden.has(type.key);
      toggle.setAttribute('aria-label', `Show ${type.name}`);
      toggle.onchange = () => {
        if (this.callbacks.busy()) {
          toggle.checked = !state.hidden.has(type.key);
          return;
        }
        toggle.checked ? state.hidden.delete(type.key) : state.hidden.add(type.key);
        this.apply(true);
      };
      const details = element('details'),
        summary = element('summary');
      details.open = state.expanded.has(type.key);
      const label = element('span', undefined, 'trap-summary-copy');
      label.append(
        element('span', type.name),
        element(
          'small',
          `${type.variants.length} ${type.variants.length === 1 ? 'setup' : 'setups'}`,
        ),
      );
      summary.append(
        trapArt(type.records[0], new Set(type.records.map(trapRarity)).size > 1),
        label,
        element('b', type.records.length.toLocaleString(), 'trap-quantity'),
      );
      details.append(summary);
      details.ontoggle = () => {
        details.open ? state.expanded.add(type.key) : state.expanded.delete(type.key);
      };
      const only = button('Only', () => {
        if (this.callbacks.busy()) return;
        state.hidden = new Set(model.types.filter((t) => t.key !== type.key).map((t) => t.key));
        this.apply(true);
      });
      only.setAttribute('aria-label', `Show only ${type.name}`);
      for (const variant of type.variants) {
        const entry = element('div', undefined, 'requirement-variant');
        entry.dataset.variant = variant.key;
        const heading = element('div', undefined, 'variant-heading');
        heading.append(
          element(
            'strong',
            `${level(variant.sample)} · ${variant.records.length.toLocaleString()}`,
          ),
          button('Locate', () => {
            if (this.callbacks.busy()) return;
            this.reveal(variant.records);
            this.callbacks.focus(variant.records);
          }),
        );
        entry.append(heading, perkList(variant.sample));
        const definition = element('small', itemLabel(variant.sample), 'trap-definition');
        definition.title = variant.sample.itemPath ?? '';
        entry.append(definition);
        details.append(entry);
      }
      row.append(toggle, details, only);
      host.append(row);
    }
    el('requirementsEmpty').hidden = Boolean(model.types.length);
    this.apply();
    this.search();
  }
  reveal(records: Placement[]) {
    if (!this.doc) return;
    for (const p of records) if (p.kind === 'trap') this.state().hidden.delete(trapTypeKey(p));
    this.apply(true);
  }
  private apply(interactive = false) {
    if (!this.doc || !this.model) return;
    const state = this.state();
    const ids = new Set(
      this.doc.data.placements
        .filter((p) => p.kind === 'trap' && state.hidden.has(trapTypeKey(p)))
        .map((p) => p.actorPath),
    );
    for (const row of el('requiredTrapList').querySelectorAll<HTMLElement>('[data-trap-type]')) {
      const shown = !state.hidden.has(row.dataset.trapType!);
      row.querySelector<HTMLInputElement>('input')!.checked = shown;
      row.classList.toggle('trap-hidden', !shown);
    }
    const shown = this.model.types
      .filter((t) => !state.hidden.has(t.key))
      .reduce((n, t) => n + t.records.length, 0);
    el('requirementsVisible').textContent =
      `${shown.toLocaleString()} / ${this.model.traps.toLocaleString()} traps shown`;
    el('requirementsButton').classList.toggle('filtered', shown !== this.model.traps);
    this.callbacks.filter(ids, interactive);
  }
  private search() {
    const query = el<HTMLInputElement>('requirementsSearch').value.trim().toLowerCase();
    let visible = 0;
    for (const row of el('requiredTrapList').querySelectorAll<HTMLElement>('[data-trap-type]')) {
      row.hidden = Boolean(query && !row.textContent?.toLowerCase().includes(query));
      if (!row.hidden) visible++;
    }
    el('requirementsNoMatches').hidden = !this.model?.types.length || visible > 0;
  }
}
