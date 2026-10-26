export type SupportedClient =
  | 'antigravity'
  | 'claude_code'
  | 'cursor'
  | 'windsurf'
  | 'vscode'
  | 'codex'
  | 'all';

export interface ClientInstallResult {
  client: string;
  status: 'installed' | 'uninstalled' | 'dry_run' | 'manual' | 'skipped' | 'error';
  pathsModified: string[];
  backupsCreated: string[];
  message: string;
}

export interface ClientPathInfo {
  mcpConfigPath?: string;
  skillInstallPath?: string;
  rulesPath?: string;
  isManual?: boolean;
  manualInstructions?: string;
}
