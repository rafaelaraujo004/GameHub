export type LaunchStatus = 'idle' | 'downloading' | 'launching' | 'error' | 'success';

export type LaunchConfig = {
  pcsx2Path: string;
  tempDir: string;
};

export type LaunchResult = {
  success: boolean;
  error?: string;
};

export type GameSource = 'local' | 'google_drive';