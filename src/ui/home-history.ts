import type { DraftHistory } from '../app/draft-history';
import { el } from './dom';
import { baseThumbnail } from './base-thumbnail';

export class HomeHistory {
  private generation = 0;
  private observer?: IntersectionObserver;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private history: DraftHistory,
    private open: (id: string) => void,
  ) {}

  async refresh() {
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
        host.append(button);
        if (!entry.preview) this.observer.observe(button);
      }
    } catch {
      if (generation === this.generation)
        message.textContent = 'Could not load history. Try reopening History from the toolbar.';
    }
  }
}
