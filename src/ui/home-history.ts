import type { DraftHistory, HistoryEntry } from '../app/draft-history';
import { el } from './dom';
import { baseThumbnail } from './base-thumbnail';

export class HomeHistory {
  private generation = 0;
  private observer?: IntersectionObserver;
  private queue: Promise<void> = Promise.resolve();
  private contextMenu?: HTMLDivElement;

  private showContextMenu(entry: HistoryEntry, anchor: HTMLButtonElement, x: number, y: number) {
    this.contextMenu?.remove();
    const menu = document.createElement('div');
    menu.className = 'home-history-menu';
    menu.popover = 'auto';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', `Actions for ${entry.name}`);
    const item = document.createElement('button');
    item.type = 'button';
    item.setAttribute('role', 'menuitem');
    item.textContent = 'Remove homebase…';
    item.onclick = () => {
      menu.hidePopover();
      anchor.focus();
      this.confirmRemoval(entry);
    };
    menu.onkeydown = (event) => {
      if (event.key === 'Escape' || event.key === 'Tab') {
        event.preventDefault();
        menu.hidePopover();
        anchor.focus();
      }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault();
        item.focus();
      }
    };
    menu.append(item);
    document.body.append(menu);
    this.contextMenu = menu;
    menu.showPopover();
    const bounds = menu.getBoundingClientRect();
    menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8))}px`;
    menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))}px`;
    item.focus();
  }

  constructor(
    private history: DraftHistory,
    private open: (id: string) => void,
  ) {}

  private confirmRemoval(entry: HistoryEntry) {
    const dialog = el<HTMLDialogElement>('removeHomeDialog');
    const cancel = el<HTMLButtonElement>('cancelRemoveHome');
    const confirm = el<HTMLButtonElement>('confirmRemoveHome');
    const error = el('removeHomeError');
    el('removeHomeDescription').textContent =
      `Remove “${entry.name}” from Your homebases and History on this device? Your exported files and in-game homebase will not be changed.`;
    el('removeHomeWarning').textContent = entry.dirty
      ? 'This draft has unexported edits. Removing it permanently deletes those edits. Keep the homebase and export it first if you want a copy.'
      : 'This permanently deletes the local draft. You can open an exported save again to add it back.';
    error.hidden = true;
    let removing = false;
    dialog.oncancel = (event) => {
      if (removing) event.preventDefault();
    };
    cancel.onclick = () => dialog.close();
    confirm.onclick = async () => {
      if (removing) return;
      removing = true;
      cancel.disabled = confirm.disabled = true;
      confirm.textContent = 'Removing…';
      try {
        await this.history.remove(entry.id);
        dialog.close();
        await this.refresh();
        el('homeHistoryStatus').textContent =
          `“${entry.name}” removed. ` + el('homeHistoryStatus').textContent;
        const next = el('homeHistoryList').querySelector<HTMLButtonElement>('.home-history-remove');
        (next ?? el('welcomeNew')).focus();
      } catch {
        error.textContent =
          'Could not remove this homebase. Your draft is still saved. Please try again.';
        error.hidden = false;
      } finally {
        removing = false;
        cancel.disabled = confirm.disabled = false;
        confirm.textContent = 'Remove homebase';
      }
    };
    dialog.showModal();
    cancel.focus();
  }

  async refresh() {
    this.contextMenu?.remove();
    const generation = ++this.generation;
    this.observer?.disconnect();
    const host = el('homeHistoryList');
    const message = el('homeHistoryStatus');
    host.replaceChildren();
    message.textContent = 'Loading saved bases…';
    try {
      const entries = await this.history.list();
      if (generation !== this.generation) return;
      message.textContent = entries.length
        ? `${entries.length} saved ${entries.length === 1 ? 'base' : 'bases'} · Select a preview to continue editing.`
        : 'Your bases will appear here when you open a save or create a new base.';
      this.observer = new IntersectionObserver(
        (changes) => {
          for (const change of changes) {
            if (!change.isIntersecting) continue;
            const button = change.target as HTMLButtonElement;
            this.queue = this.queue.then(async () => {
              if (generation !== this.generation || el('welcome').hidden || !button.isConnected)
                return;
              this.observer?.unobserve(button);
              const image = button.querySelector('img')!;
              const state = button.querySelector('.history-preview-state')!;
              if (image.hasAttribute('src')) return;
              try {
                const doc = await this.history.restore(button.dataset.id!);
                if (!doc || generation !== this.generation) return;
                const preview = await baseThumbnail(doc.data.placements);
                image.src = preview;
                image.hidden = false;
                state.textContent = '';
                await this.history.savePreview(doc.id, doc.revision, preview).catch(() => {});
              } catch {
                state.textContent = 'Preview unavailable · Open base';
              }
              await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
            });
          }
        },
        { root: el('welcome'), rootMargin: '200px' },
      );
      for (const entry of entries) {
        const button = document.createElement('button');
        button.className = 'home-history-entry';
        button.dataset.id = entry.id;
        button.type = 'button';
        const preview = document.createElement('span');
        preview.className = 'history-preview';
        const image = document.createElement('img');
        image.alt = `Build preview of ${entry.name}`;
        image.width = 480;
        image.height = 300;
        image.loading = 'lazy';
        image.hidden = !entry.preview;
        if (entry.preview) image.src = entry.preview;
        const state = document.createElement('span');
        state.className = 'history-preview-state';
        state.textContent = entry.preview ? '' : 'Preparing preview…';
        preview.append(image, state);
        const name = document.createElement('strong');
        name.textContent = entry.name;
        const details = document.createElement('span');
        details.className = 'home-history-details';
        details.textContent = `${entry.pieces.toLocaleString()} pieces${entry.dirty ? ' · Unexported edits' : ''}`;
        const time = document.createElement('time');
        time.dateTime = new Date(entry.updatedAt).toISOString();
        time.textContent = new Date(entry.updatedAt).toLocaleString();
        button.append(preview, name, details, time);
        button.onclick = () => this.open(entry.id);
        const card = document.createElement('div');
        card.className = 'home-history-card';
        const remove = document.createElement('button');
        remove.className = 'home-history-remove';
        remove.type = 'button';
        const icon = document.createElement('i');
        icon.className = 'ph ph-trash';
        icon.setAttribute('aria-hidden', 'true');
        remove.append(icon);
        remove.title = 'Remove homebase';
        remove.setAttribute('aria-label', `Remove ${entry.name}`);
        remove.setAttribute('aria-haspopup', 'dialog');
        remove.onclick = () => this.confirmRemoval(entry);
        card.oncontextmenu = (event) => {
          event.preventDefault();
          const bounds = button.getBoundingClientRect();
          this.showContextMenu(
            entry,
            button,
            event.clientX || bounds.right - 32,
            event.clientY || bounds.top + 32,
          );
        };
        card.onkeydown = (event) => {
          if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) {
            event.preventDefault();
            const bounds = button.getBoundingClientRect();
            this.showContextMenu(entry, button, bounds.right - 32, bounds.top + 32);
          }
        };
        card.append(button, remove);
        host.append(card);
        if (!entry.preview) this.observer.observe(button);
      }
    } catch {
      if (generation === this.generation)
        message.textContent = 'Could not load history. Try reopening History from the toolbar.';
    }
  }
}
