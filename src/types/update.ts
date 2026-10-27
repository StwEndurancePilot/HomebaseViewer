export type UpdateState = {
  status:
    | 'unavailable'
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'current'
    | 'ready'
    | 'installing'
    | 'error';
  currentVersion: string;
  version?: string;
  percent?: number;
};
