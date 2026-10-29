import type { Placement } from '../../core/save';
import { trapName, trapPerks } from '../../core/requirements';
import { trapPerkOptions } from '../../core/trap-perks';

function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text: string, action: () => void) {
  const node = element('button', text);
  node.type = 'button';
  node.onclick = action;
  return node;
}

export function openTrapPerkEditor(source: Placement, apply: (paths: string[]) => void) {
  const saved = trapPerks(source),
    paths = saved.perks.map((p) => p.path),
    maxSlots = Math.max(6, paths.length),
    dialog = element('dialog'),
    title = element('h2', `Edit ${trapName(source)} perks`),
    help = element(
      'p',
      'Choose a perk and rarity for each slot. Duplicate perks are kept in order.',
    ),
    list = element('ol'),
    error = element('p'),
    actions = element('div');
  dialog.className = 'trap-perk-editor';
  title.id = 'trapPerkEditorTitle';
  dialog.setAttribute('aria-labelledby', title.id);
  help.className = 'muted';
  list.className = 'trap-perk-slots';
  error.setAttribute('role', 'alert');
  error.hidden = true;
  actions.className = 'trap-perk-actions';
  const cancel = button('Cancel', () => dialog.close()),
    save = button('Apply perks', () => {
      try {
        apply([...paths]);
        dialog.close();
      } catch (e) {
        error.textContent = (e as Error).message;
        error.hidden = false;
      }
    }),
    add = button('Add perk', () => {
      paths.push('');
      refresh();
      list.lastElementChild?.querySelector('select')?.focus();
    });
  save.className = 'primary';
  function refresh() {
    list.replaceChildren();
    error.hidden = true;
    paths.forEach((path, index) => {
      const row = element('li'),
        label = element('label', `Slot ${index + 1}`),
        select = element('select'),
        tools = element('div');
      select.setAttribute('aria-label', `Perk slot ${index + 1}`);
      select.append(new Option('Choose a perk…', ''));
      if (path && !trapPerkOptions.some((g) => g.perks.some((p) => p.path === path))) {
        const perk = saved.perks.find((p) => p.path === path)!;
        select.append(
          new Option(`Saved: ${perk.label}${perk.rarity ? ` · ${perk.rarity}` : ''}`, path),
        );
      }
      for (const group of trapPerkOptions) {
        const options = element('optgroup');
        options.label = group.label;
        for (const perk of group.perks)
          options.append(new Option(`${perk.rarity} · ${perk.label}`, perk.path));
        select.append(options);
      }
      select.value = path;
      select.title = path;
      select.onchange = () => {
        paths[index] = select.value;
        select.title = select.value;
        error.hidden = true;
        save.disabled = paths.some((p) => !p);
      };
      const move = (delta: number) => {
        [paths[index], paths[index + delta]] = [paths[index + delta], paths[index]];
        refresh();
        list.children[index + delta].querySelector('select')?.focus();
      };
      const up = button('↑', () => move(-1)),
        down = button('↓', () => move(1)),
        remove = button('Remove', () => {
          paths.splice(index, 1);
          refresh();
          (
            list.children[Math.min(index, paths.length - 1)]?.querySelector('select') ?? add
          ).focus();
        });
      up.setAttribute('aria-label', `Move slot ${index + 1} up`);
      down.setAttribute('aria-label', `Move slot ${index + 1} down`);
      remove.setAttribute('aria-label', `Remove slot ${index + 1}`);
      up.disabled = index === 0;
      down.disabled = index === paths.length - 1;
      tools.className = 'trap-perk-actions';
      tools.append(up, down, remove);
      label.append(select);
      row.append(label, tools);
      list.append(row);
    });
    add.disabled = paths.length >= maxSlots;
    save.disabled = paths.some((p) => !p);
  }
  dialog.append(title, help);
  if (saved.state === 'observed' || saved.state === 'unknown' || saved.state === 'unreadable') {
    const note = element(
      'p',
      saved.state === 'observed'
        ? 'These are observed effects; the original slot order may be incomplete. Changes save the order shown here.'
        : 'The original perks were not recorded or could not be read. Applying replaces them with the list shown here.',
    );
    note.className = 'perk-note';
    dialog.append(note);
  }
  const note = element(
    'p',
    'Available choices are not restricted by trap type or slot. Check that your setup suits this trap.',
  );
  note.className = 'muted';
  actions.append(cancel, save);
  dialog.append(list, add, note, error, actions);
  dialog.addEventListener('keydown', (event) => event.stopPropagation());
  dialog.addEventListener('close', () => dialog.remove(), { once: true });
  document.body.append(dialog);
  refresh();
  dialog.showModal();
}
