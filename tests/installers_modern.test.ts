import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { installForClient, getClientPaths } from '../src/clients/installer.js';
import { APP_NAME, BIN_NAME } from '../src/constants.js';

describe('Modern Client Rules & Config Installers Suite', () => {
  const tmpHome = path.join(os.tmpdir(), `overwatch-modern-home-${Date.now()}`);
  const tmpWs = path.join(os.tmpdir(), `overwatch-modern-ws-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.mkdirSync(tmpWs, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpWs, { recursive: true, force: true });
  });

  it('installs modern Cursor rules to .cursor/rules/overwatch.mdc with alwaysApply: true', () => {
    const res = installForClient('cursor', {
      customHome: tmpHome,
      workspaceRoot: tmpWs,
    });
    expect(res.status).toBe('installed');

    const paths = getClientPaths('cursor', tmpHome, tmpWs);
    expect(paths.rulesPath).toBe(path.join(tmpWs, '.cursor', 'rules', `${APP_NAME}.mdc`));
    expect(fs.existsSync(paths.rulesPath!)).toBe(true);

    const mdcContent = fs.readFileSync(paths.rulesPath!, 'utf-8');
    expect(mdcContent).toContain('alwaysApply: true');
    expect(mdcContent).toContain(`${APP_NAME.toUpperCase()} Mandatory Checkpoint Protocol`);

    // Uninstall removes file
    installForClient('cursor', {
      uninstall: true,
      customHome: tmpHome,
      workspaceRoot: tmpWs,
    });
    expect(fs.existsSync(paths.rulesPath!)).toBe(false);
  });

  it('installs modern Windsurf rules to .windsurf/rules/overwatch.md with Activation Mode: Always On', () => {
    const res = installForClient('windsurf', {
      customHome: tmpHome,
      workspaceRoot: tmpWs,
    });
    expect(res.status).toBe('installed');

    const paths = getClientPaths('windsurf', tmpHome, tmpWs);
    expect(paths.rulesPath).toBe(path.join(tmpWs, '.windsurf', 'rules', `${APP_NAME}.md`));
    expect(fs.existsSync(paths.rulesPath!)).toBe(true);

    const mdContent = fs.readFileSync(paths.rulesPath!, 'utf-8');
    expect(mdContent).toContain('Activation Mode: Always On');
    expect(mdContent).toContain(`${APP_NAME.toUpperCase()} Mandatory Checkpoint Protocol`);

    // Uninstall removes file
    installForClient('windsurf', {
      uninstall: true,
      customHome: tmpHome,
      workspaceRoot: tmpWs,
    });
    expect(fs.existsSync(paths.rulesPath!)).toBe(false);
  });

  it('installs Claude Code with MCP config, SKILL.md, and CLAUDE.md rules', () => {
    const res = installForClient('claude_code', {
      customHome: tmpHome,
      workspaceRoot: tmpWs,
    });
    expect(res.status).toBe('installed');

    const paths = getClientPaths('claude_code', tmpHome, tmpWs);
    expect(fs.existsSync(paths.mcpConfigPath!)).toBe(true);
    expect(fs.existsSync(paths.skillInstallPath!)).toBe(true);
    expect(fs.existsSync(paths.rulesPath!)).toBe(true);

    const rules = fs.readFileSync(paths.rulesPath!, 'utf-8');
    expect(rules).toContain(`BEGIN ${APP_NAME.toUpperCase()} RULES`);

    // Uninstall cleans all
    installForClient('claude_code', {
      uninstall: true,
      customHome: tmpHome,
      workspaceRoot: tmpWs,
    });
    expect(fs.existsSync(paths.skillInstallPath!)).toBe(false);
    const mcpJson = JSON.parse(fs.readFileSync(paths.mcpConfigPath!, 'utf-8'));
    expect(mcpJson.mcpServers?.[APP_NAME]).toBeUndefined();
  });

  it('configures OpenAI Codex via ~/.codex/config.toml seamlessly', () => {
    const res = installForClient('codex', {
      customHome: tmpHome,
      workspaceRoot: tmpWs,
    });
    expect(res.status).toBe('installed');

    const paths = getClientPaths('codex', tmpHome, tmpWs);
    expect(fs.existsSync(paths.mcpConfigPath!)).toBe(true);

    const toml = fs.readFileSync(paths.mcpConfigPath!, 'utf-8');
    expect(toml).toContain(`[mcp_servers.${APP_NAME}]`);
    expect(toml).toContain(`command = "${BIN_NAME}"`);
    expect(toml).toContain('args = ["serve"]');
    expect(toml).toContain('enabled = true');

    // Test idempotency: re-running does not duplicate TOML section
    installForClient('codex', {
      customHome: tmpHome,
      workspaceRoot: tmpWs,
    });
    const toml2 = fs.readFileSync(paths.mcpConfigPath!, 'utf-8');
    const matches = toml2.match(new RegExp(`\\[mcp_servers\\.${APP_NAME}\\]`, 'g'));
    expect(matches?.length).toBe(1);

    // Uninstall cleanly removes TOML section
    installForClient('codex', {
      uninstall: true,
      customHome: tmpHome,
      workspaceRoot: tmpWs,
    });
    const tomlAfter = fs.readFileSync(paths.mcpConfigPath!, 'utf-8');
    expect(tomlAfter).not.toContain(`[mcp_servers.${APP_NAME}]`);
  });

  it('installs VS Code / Cline with cline_mcp_settings.json AND workspace .clinerules', () => {
    const res = installForClient('vscode', {
      customHome: tmpHome,
      workspaceRoot: tmpWs,
    });
    expect(res.status).toBe('installed');

    const paths = getClientPaths('vscode', tmpHome, tmpWs);
    expect(fs.existsSync(paths.mcpConfigPath!)).toBe(true);
    expect(paths.rulesPath).toBe(path.join(tmpWs, '.clinerules'));
    expect(fs.existsSync(paths.rulesPath!)).toBe(true);

    const clineRules = fs.readFileSync(paths.rulesPath!, 'utf-8');
    expect(clineRules).toContain(`${APP_NAME.toUpperCase()} Mandatory Checkpoint Protocol`);

    // Uninstall removes .clinerules
    installForClient('vscode', {
      uninstall: true,
      customHome: tmpHome,
      workspaceRoot: tmpWs,
    });
    expect(fs.existsSync(paths.rulesPath!)).toBe(false);
  });

  it('installs Codex with ~/.codex/config.toml AND workspace AGENTS.md rules', () => {
    installForClient('codex', {
      customHome: tmpHome,
      workspaceRoot: tmpWs,
    });

    const paths = getClientPaths('codex', tmpHome, tmpWs);
    expect(fs.existsSync(paths.mcpConfigPath!)).toBe(true);
    expect(paths.rulesPath).toBe(path.join(tmpWs, 'AGENTS.md'));
    expect(fs.existsSync(paths.rulesPath!)).toBe(true);

    const agentsMd = fs.readFileSync(paths.rulesPath!, 'utf-8');
    expect(agentsMd).toContain(`BEGIN ${APP_NAME.toUpperCase()} RULES`);
  });
});
