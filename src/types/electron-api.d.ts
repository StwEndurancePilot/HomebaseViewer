import type { UpdateState } from './update';
import type { Zone, State, PennyAccount } from './account';
declare global {
  interface Window {
    homebaseUpdates?: {
      state(): Promise<UpdateState>;
      check(): Promise<UpdateState>;
      restart(): Promise<void>;
      onState(callback: (state: UpdateState) => void): () => void;
    };
    homebaseAccount?: {
      state(): Promise<State>;
      login(): Promise<void>;
      cancel(): Promise<void>;
      reopen(): Promise<void>;
      list(): Promise<Zone[]>;
      pennyAccounts(): Promise<{
        accounts: PennyAccount[];
        message: string;
      }>;
      loginPenny(id: string): Promise<void>;
      download(zone: string): Promise<{
        zone: Zone;
        bytes: Uint8Array;
        sourceBytes: number;
      }>;
      decode(bytes: Uint8Array): Promise<Uint8Array>;
      onState(callback: (state: State) => void): () => void;
    };
  }
}

declare global {
  interface Window {
    homebaseDownloads?: {
      onFinished(callback: (result: { url: string; completed: boolean }) => void): void;
    };
  }
}
