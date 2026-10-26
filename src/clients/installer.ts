import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { APP_NAME, BIN_NAME } from '../constants.js';
import { SupportedClient, ClientInstallResult, ClientPathInfo } from './types.js';

export function getClientPaths(
  client: SupportedClient,
  customHome?: string,
  workspaceRoot?: string
): ClientPathInfo {
  const home = customHome || os.homedir();
  const ws = workspaceRoot || process.cwd();
  const isWin = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  switch (client) {
    case 'antigravity':
      return {
        mcpConfigPath: path.join(home, '.gemini', 'config', 'mcp_config.json'),
        skillInstallPath: path.join(home, '.gemini', 'config', 'skills', APP_NAME, 'SKILL.md'),
        rulesPath: path.join(home, '.gemini', 'config', 'rules', 'AGENTS.md'),
      };

    case 'claude_code':
      return {
        mcpConfigPath: path.join(home, '.claude.json'),
        rulesPath: path.join(ws, 'CLAUDE.md'),
      };

    case 'cursor':
      return {
        mcpConfigPath: path.join(home, '.cursor', 'mcp.json'),
        rulesPath: path.join(ws, '.cursorrules'),
      };

    case 'windsurf':
      return {
        mcpConfigPath: path.join(home, '.codeium', 'windsurf', 'mcp_config.json'),
        rulesPath: path.join(ws, '.windsurfrules'),
      };

    case 'vscode': {
      let clinePath: string;
      if (isWin) {
        const appData = process.env.APPDATA || path.join(home, 'AppData', 'Roaming');
        clinePath = path.join(
          appData,
          'Code',
          'User',
          'globalStorage',
          'saoudrizwan.claude-dev',
          'settings',
          'cline_mcp_settings.json'
        );
      } else if (isMac) {
        clinePath = path.join(
          home,
          'Library',
          'Application Support',
          'Code',
          'User',
          'globalStorage',
          'saoudrizwan.claude-dev',
          'settings',
          'cline_mcp_settings.json'
        );
      } else {
        clinePath = path.join(
          home,
          '.config',
          'Code',
          'User',
          'globalStorage',
          'saoudrizwan.claude-dev',
          'settings',
          'cline_mcp_settings.json'
        );
      }
      return {
        mcpConfigPath: clinePath,
      };
    }

    case 'codex':
      return {
        isManual: true,
        manualInstructions: `Codex does not have a single standard global MCP json path.\nTo use with Codex CLI or extension, register via:\n  codex mcp add ${APP_NAME} -- "${BIN_NAME}" serve`,
      };

    default:
      return {};
  }
}

export function generateMcpServerEntry(execPath?: string): { command: string; args: string[] } {
  // Use global command name or node script path
  return {
    command: execPath || BIN_NAME,
    args: ['serve'],
  };
}

export const RULES_SNIPPET = `\n<!-- BEGIN ${APP_NAME.toUpperCase()} RULES -->
# ${APP_NAME.toUpperCase()} Mandatory Checkpoint Protocol
1. Pre-Implementation: MUST call ${APP_NAME}_plan_check before writing code.
2. Checkpoint: MUST call ${APP_NAME}_checkpoint after milestones and after 2 consecutive failures.
3. Verification: MUST call ${APP_NAME}_verify with test results before declaring done.
4. Memory: Check .${APP_NAME}/NOTES.md for established constraints.
<!-- END ${APP_NAME.toUpperCase()} RULES -->\n`;

export function installForClient(
  client: SupportedClient,
  options: {
    dryRun?: boolean;
    uninstall?: boolean;
    customHome?: string;
    workspaceRoot?: string;
    execPath?: string;
    skillSourceContent?: string;
  } = {}
): ClientInstallResult {
  const paths = getClientPaths(client, options.customHome, options.workspaceRoot);

  if (paths.isManual) {
    return {
      client,
      status: 'manual',
      pathsModified: [],
      backupsCreated: [],
      message: paths.manualInstructions || 'Manual setup required.',
    };
  }

  const pathsModified: string[] = [];
  const backupsCreated: string[] = [];

  // 1. Manage MCP Config
  if (paths.mcpConfigPath) {
    const configDir = path.dirname(paths.mcpConfigPath);
    let existingJson: Record<string, any> = {};

    if (fs.existsSync(paths.mcpConfigPath)) {
      try {
        const raw = fs.readFileSync(paths.mcpConfigPath, 'utf-8');
        existingJson = JSON.parse(raw);
      } catch {
        existingJson = {};
      }
    }

    if (!existingJson.mcpServers) {
      existingJson.mcpServers = {};
    }

    if (options.uninstall) {
      if (existingJson.mcpServers[APP_NAME]) {
        delete existingJson.mcpServers[APP_NAME];
        if (!options.dryRun) {
          // Backup
          const backupPath = `${paths.mcpConfigPath}.bak`;
          if (fs.existsSync(paths.mcpConfigPath)) {
            fs.copyFileSync(paths.mcpConfigPath, backupPath);
            backupsCreated.push(backupPath);
          }
          fs.writeFileSync(paths.mcpConfigPath, JSON.stringify(existingJson, null, 2), 'utf-8');
        }
        pathsModified.push(paths.mcpConfigPath);
      }
    } else {
      // Install / Merge
      const entry = generateMcpServerEntry(options.execPath);
      existingJson.mcpServers[APP_NAME] = entry;

      if (!options.dryRun) {
        if (!fs.existsSync(configDir)) {
          fs.mkdirSync(configDir, { recursive: true });
        }
        if (fs.existsSync(paths.mcpConfigPath)) {
          const backupPath = `${paths.mcpConfigPath}.bak`;
          fs.copyFileSync(paths.mcpConfigPath, backupPath);
          backupsCreated.push(backupPath);
        }
        fs.writeFileSync(paths.mcpConfigPath, JSON.stringify(existingJson, null, 2), 'utf-8');
      }
      pathsModified.push(paths.mcpConfigPath);
    }
  }

  // 2. Manage Skill
  if (paths.skillInstallPath) {
    const skillDir = path.dirname(paths.skillInstallPath);
    if (options.uninstall) {
      if (fs.existsSync(paths.skillInstallPath)) {
        if (!options.dryRun) {
          fs.rmSync(skillDir, { recursive: true, force: true });
        }
        pathsModified.push(paths.skillInstallPath);
      }
    } else {
      if (!options.dryRun) {
        if (!fs.existsSync(skillDir)) {
          fs.mkdirSync(skillDir, { recursive: true });
        }
        const skillContent =
          options.skillSourceContent ||
          `---\nname: ${APP_NAME}\ndescription: Overwatch mentor steering skill\n---\n# ${APP_NAME}\n`;
        fs.writeFileSync(paths.skillInstallPath, skillContent, 'utf-8');
      }
      pathsModified.push(paths.skillInstallPath);
    }
  }

  // 3. Manage Rules
  if (paths.rulesPath) {
    const rulesDir = path.dirname(paths.rulesPath);
    let rulesContent = '';
    if (fs.existsSync(paths.rulesPath)) {
      rulesContent = fs.readFileSync(paths.rulesPath, 'utf-8');
    }

    const snippetRegex = new RegExp(
      `<!-- BEGIN ${APP_NAME.toUpperCase()} RULES -->[\\s\\S]*?<!-- END ${APP_NAME.toUpperCase()} RULES -->\\n?`,
      'g'
    );

    if (options.uninstall) {
      if (snippetRegex.test(rulesContent)) {
        rulesContent = rulesContent.replace(snippetRegex, '').trim();
        if (!options.dryRun) {
          const backupPath = `${paths.rulesPath}.bak`;
          fs.copyFileSync(paths.rulesPath, backupPath);
          backupsCreated.push(backupPath);
          fs.writeFileSync(paths.rulesPath, rulesContent ? `${rulesContent}\n` : '', 'utf-8');
        }
        pathsModified.push(paths.rulesPath);
      }
    } else {
      if (!snippetRegex.test(rulesContent)) {
        rulesContent = rulesContent ? `${rulesContent.trim()}\n\n${RULES_SNIPPET}` : RULES_SNIPPET;
        if (!options.dryRun) {
          if (!fs.existsSync(rulesDir)) {
            fs.mkdirSync(rulesDir, { recursive: true });
          }
          if (fs.existsSync(paths.rulesPath)) {
            const backupPath = `${paths.rulesPath}.bak`;
            fs.copyFileSync(paths.rulesPath, backupPath);
            backupsCreated.push(backupPath);
          }
          fs.writeFileSync(paths.rulesPath, rulesContent, 'utf-8');
        }
        pathsModified.push(paths.rulesPath);
      }
    }
  }

  return {
    client,
    status: options.dryRun ? 'dry_run' : options.uninstall ? 'uninstalled' : 'installed',
    pathsModified,
    backupsCreated,
    message: options.dryRun
      ? `[DRY-RUN] Would ${options.uninstall ? 'uninstall from' : 'install to'} ${client}`
      : `Successfully ${options.uninstall ? 'uninstalled from' : 'configured'} ${client}`,
  };
}
