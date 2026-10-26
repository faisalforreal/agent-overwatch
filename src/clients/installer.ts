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
      // Source: antigravity documentation in builtin/skills/agy-customizations/docs/
      return {
        mcpConfigPath: path.join(home, '.gemini', 'config', 'mcp_config.json'),
        skillInstallPath: path.join(home, '.gemini', 'config', 'skills', APP_NAME, 'SKILL.md'),
        rulesPath: path.join(home, '.gemini', 'config', 'rules', 'AGENTS.md'),
      };

    case 'claude_code':
      // Source: Claude Code documentation
      return {
        mcpConfigPath: path.join(home, '.claude.json'),
        skillInstallPath: path.join(home, '.claude', 'skills', APP_NAME, 'SKILL.md'),
        rulesPath: path.join(ws, 'CLAUDE.md'),
      };

    case 'cursor':
      // Source: Cursor documentation for modern .cursor/rules/*.mdc
      return {
        mcpConfigPath: isWin
          ? path.join(home, '.cursor', 'mcp.json')
          : path.join(home, '.cursor', 'mcp.json'),
        rulesPath: path.join(ws, '.cursor', 'rules', `${APP_NAME}.mdc`),
      };

    case 'windsurf':
      // Source: Windsurf documentation for modern .windsurf/rules/*.md
      return {
        mcpConfigPath: path.join(home, '.codeium', 'windsurf', 'mcp_config.json'),
        rulesPath: path.join(ws, '.windsurf', 'rules', `${APP_NAME}.md`),
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
      // Source: OpenAI Codex documentation for ~/.codex/config.toml
      return {
        mcpConfigPath: path.join(home, '.codex', 'config.toml'),
      };

    default:
      return {};
  }
}

export function generateMcpServerEntry(execPath?: string): { command: string; args: string[] } {
  return {
    command: execPath || BIN_NAME,
    args: ['serve'],
  };
}

export function generateRulesContentForClient(client: SupportedClient): string {
  const baseRules = `# ${APP_NAME.toUpperCase()} Mandatory Checkpoint Protocol
1. Pre-Implementation: MUST call ${APP_NAME}_plan_check before writing code.
2. Checkpoint: MUST call ${APP_NAME}_checkpoint after milestones and after 2 consecutive failures.
3. Verification: MUST call ${APP_NAME}_verify with test results before declaring done.
4. Memory: Check .${APP_NAME}/NOTES.md for established constraints.`;

  if (client === 'cursor') {
    return `---
description: "Mandatory ${APP_NAME} senior architect steering gates"
globs: "*"
alwaysApply: true
---

${baseRules}
`;
  }

  if (client === 'windsurf') {
    return `---
Activation Mode: Always On
---

${baseRules}
`;
  }

  return `\n<!-- BEGIN ${APP_NAME.toUpperCase()} RULES -->
${baseRules}
<!-- END ${APP_NAME.toUpperCase()} RULES -->\n`;
}

/**
 * Manages TOML config for Codex (~/.codex/config.toml)
 */
function manageCodexToml(
  filePath: string,
  options: { dryRun?: boolean; uninstall?: boolean; execPath?: string }
): { modified: boolean; backup?: string } {
  const dir = path.dirname(filePath);
  let content = '';
  if (fs.existsSync(filePath)) {
    content = fs.readFileSync(filePath, 'utf-8');
  }

  const sectionRegex = new RegExp(
    `\\[mcp_servers\\.${APP_NAME}\\][\\s\\S]*?(?=\\n\\[|$)`,
    'g'
  );

  if (options.uninstall) {
    if (sectionRegex.test(content)) {
      content = content.replace(sectionRegex, '').trim();
      if (!options.dryRun) {
        const backup = `${filePath}.bak`;
        fs.copyFileSync(filePath, backup);
        fs.writeFileSync(filePath, content ? `${content}\n` : '', 'utf-8');
        return { modified: true, backup };
      }
      return { modified: true };
    }
    return { modified: false };
  }

  // Install
  const execCmd = options.execPath || BIN_NAME;
  const tomlEntry = `\n[mcp_servers.${APP_NAME}]\ncommand = "${execCmd}"\nargs = ["serve"]\nenabled = true\n`;

  if (!sectionRegex.test(content)) {
    content = content ? `${content.trim()}\n${tomlEntry}` : tomlEntry.trim() + '\n';
    if (!options.dryRun) {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      let backup: string | undefined;
      if (fs.existsSync(filePath)) {
        backup = `${filePath}.bak`;
        fs.copyFileSync(filePath, backup);
      }
      fs.writeFileSync(filePath, content, 'utf-8');
      return { modified: true, backup };
    }
    return { modified: true };
  }

  return { modified: false };
}

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
  const pathsModified: string[] = [];
  const backupsCreated: string[] = [];

  // Special case: Codex TOML configuration
  if (client === 'codex' && paths.mcpConfigPath) {
    const res = manageCodexToml(paths.mcpConfigPath, options);
    if (res.modified) {
      pathsModified.push(paths.mcpConfigPath);
      if (res.backup) backupsCreated.push(res.backup);
    }
    return {
      client,
      status: options.dryRun ? 'dry_run' : options.uninstall ? 'uninstalled' : 'installed',
      pathsModified,
      backupsCreated,
      message: options.dryRun
        ? `[DRY-RUN] Would ${options.uninstall ? 'uninstall from' : 'configure in'} ~/.codex/config.toml`
        : `Successfully ${options.uninstall ? 'uninstalled from' : 'configured'} ~/.codex/config.toml`,
    };
  }

  // 1. Manage JSON MCP Config (Antigravity, Claude Code, Cursor, Windsurf, VS Code)
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

  // 2. Manage Skill (Antigravity & Claude Code)
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

  // 3. Manage Rules (Cursor .mdc, Windsurf .md, Claude Code CLAUDE.md, Antigravity AGENTS.md)
  if (paths.rulesPath) {
    const rulesDir = path.dirname(paths.rulesPath);
    const isStandaloneRuleFile = client === 'cursor' || client === 'windsurf';

    if (isStandaloneRuleFile) {
      if (options.uninstall) {
        if (fs.existsSync(paths.rulesPath)) {
          if (!options.dryRun) {
            fs.rmSync(paths.rulesPath, { force: true });
          }
          pathsModified.push(paths.rulesPath);
        }
      } else {
        if (!options.dryRun) {
          if (!fs.existsSync(rulesDir)) {
            fs.mkdirSync(rulesDir, { recursive: true });
          }
          const ruleContent = generateRulesContentForClient(client);
          fs.writeFileSync(paths.rulesPath, ruleContent, 'utf-8');
        }
        pathsModified.push(paths.rulesPath);
      }
    } else {
      // Shared file snippet appending/cleaning (CLAUDE.md, AGENTS.md)
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
          const snippet = generateRulesContentForClient(client);
          rulesContent = rulesContent ? `${rulesContent.trim()}\n\n${snippet}` : snippet;
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
