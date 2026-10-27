export type Zone = {
  id: string;
  name: string;
  file: string;
  available: boolean;
  level: number;
  updated: string | null;
};
export type State = {
  status: string;
  displayName?: string;
  zones: Zone[];
  error?: string;
  loading?: boolean;
  userCode?: string;
  expiresAt?: number;
};
export type PennyAccount = {
  id: string;
  displayName: string;
};
