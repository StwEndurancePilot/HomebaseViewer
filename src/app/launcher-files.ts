type IncomingHomebase = { name: string; bytes?: Uint8Array; error?: string };
declare global {
  interface Window {
    homebaseLauncher?: {
      next(): Promise<IncomingHomebase | null>;
      onAvailable(callback: () => void): () => void;
    };
  }
}

export function connectLauncherFiles(
  open: (files: File[]) => Promise<void>,
  isLoading: () => boolean,
  report: (message: string) => void,
) {
  const bridge = window.homebaseLauncher;
  if (!bridge) return;
  let draining = false;
  let requested = false;
  async function drain() {
    requested = true;
    if (draining) return;
    draining = true;
    try {
      do {
        requested = false;
        for (;;) {
          while (isLoading()) await new Promise((resolve) => setTimeout(resolve, 100));
          const item = await bridge!.next();
          if (!item) break;
          while (isLoading()) await new Promise((resolve) => setTimeout(resolve, 100));
          if (item.error) report(`${item.name}: ${item.error}`);
          else if (item.bytes) await open([new File([new Uint8Array(item.bytes)], item.name)]);
        }
      } while (requested);
    } catch {
      report('Could not open the homebase sent by the launcher. Try again.');
    } finally {
      draining = false;
    }
  }
  bridge.onAvailable(() => {
    void drain();
  });
  void drain();
}
