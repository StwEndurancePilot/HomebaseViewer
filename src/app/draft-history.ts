import { EditorDocument } from '../core/editor-document';
import type { Capture } from '../core/save';

export type HistoryEntry = {
  id: string;
  name: string;
  updatedAt: number;
  pieces: number;
  dirty: boolean;
  revision?: number;
  preview?: string;
};
type Draft = HistoryEntry & {
  data: Capture;
  template: Uint8Array | null;
  revision: number;
  savedRevision: number;
};

export class DraftHistory {
  private database?: Promise<IDBDatabase>;
  private saved = new WeakMap<EditorDocument, string>();

  private db() {
    return (this.database ??= new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('homebase-drafts', 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore('drafts', { keyPath: 'id' });
        request.result.createObjectStore('history', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        this.database = undefined;
        reject(request.error);
      };
    }));
  }

  async save(doc: EditorDocument, touch = false) {
    const state = `${doc.revision}:${doc.savedRevision}:${doc.name}`;
    if (!touch && this.saved.get(doc) === state) return;
    const db = await this.db();
    const entry: HistoryEntry = {
      id: doc.id,
      name: doc.name,
      updatedAt: Date.now(),
      pieces: doc.data.placements.length,
      dirty: doc.dirty,
      revision: doc.revision,
    };
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(['drafts', 'history'], 'readwrite');
      const metadata = transaction.objectStore('history');
      const previous = metadata.get(doc.id);
      previous.onsuccess = () => {
        if (previous.result?.revision === doc.revision) entry.preview = previous.result.preview;
        metadata.put(entry);
      };
      transaction.objectStore('drafts').put({
        ...entry,
        data: doc.data,
        template: doc.template,
        revision: doc.revision,
        savedRevision: doc.savedRevision,
      } satisfies Draft);
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error ?? new Error('Draft save aborted.'));
      transaction.onerror = () => reject(transaction.error);
    });
    this.saved.set(doc, state);
  }

  async list(): Promise<HistoryEntry[]> {
    const db = await this.db();
    return new Promise((resolve, reject) => {
      const request = db.transaction('history').objectStore('history').getAll();
      request.onsuccess = () =>
        resolve((request.result as HistoryEntry[]).sort((a, b) => b.updatedAt - a.updatedAt));
      request.onerror = () => reject(request.error);
    });
  }

  async savePreview(id: string, revision: number, preview: string) {
    const db = await this.db();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('history', 'readwrite');
      const store = transaction.objectStore('history');
      const request = store.get(id);
      request.onsuccess = () => {
        const entry = request.result as HistoryEntry | undefined;
        if (entry && (entry.revision === undefined || entry.revision === revision))
          store.put({ ...entry, revision, preview });
      };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(transaction.error);
      transaction.onerror = () => reject(transaction.error);
    });
  }

  async restore(id: string): Promise<EditorDocument | null> {
    const db = await this.db();
    const draft = await new Promise<Draft | undefined>((resolve, reject) => {
      const request = db.transaction('drafts').objectStore('drafts').get(id);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!draft) return null;
    const doc = new EditorDocument(draft.name, draft.data, draft.template, draft.id);
    doc.revision = draft.revision;
    doc.savedRevision = draft.savedRevision;
    return doc;
  }
}
