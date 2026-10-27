import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { installForClient, getClientPaths } from '../src/clients/installer.js';
import { APP_NAME } from '../src/constants.js';

describe('Client Installers Suite', () => {
  const tmpHome = path.join(os.tmpdir(), `overwatch-inst-home-${Date.now()}`);
  const tmpWs = path.join(os.tmpdir(), `overwatch-inst-ws-${Date.now()}`);

  beforeEach(() => {
    fs.mkdirSync(tmpHome, { recursive: true });
    fs.mkdirSync(tmpWs, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpHome, { recursive: true, force: true });
    fs.rmSync(tmpWs, { recursive: true, force: true });
  });

  it('runs dry-run without writing any files', () => {
    const res = installForClient('antigravity', {
      dryRun: true,
      customHome: tmpHome,
      workspaceRoot: tmpWs,
    });

    expect(res.status).toBe('dry_run');
    expect(res.pathsModified.length).toBeGreaterThan(0);

    const paths = getClientPaths('antigravity', tmpHome, tmpWs);
    expect(fs.existsSync(paths.mcpConfigPath!)).toBe(false);
    expect(fs.existsSync(paths.skillInstallPath!)).toBe(false);
  });

  it('installs cleanly to Antigravity and verifies JSON & Skill merge', () => {
    const res = installForClient('antigravity', {
      customHome: tmpHome,
      workspaceRoot: tmpWs,
    });

    expect(res.status).toBe('installed');
    const paths = getClientPaths('antigravity', tmpHome, tmpWs);

    expect(fs.existsSync(paths.mcpConfigPath!)).toBe(true);
    const mcpJson = JSON.parse(fs.readFileSync(paths.mcpConfigPath!, 'utf-8'));
    expect(mcpJson.mcpServers[APP_NAME]).toBeDefined();
    expect(mcpJson.mcpServers[APP_NAME].command).toBe(APP_NAME);

    expect(fs.existsSync(paths.skillInstallPath!)).toBe(true);
    expect(fs.existsSync(paths.rulesPath!)).toBe(true);
  });

  it('is idempotent: running install twice preserves single entry and rules', () => {
    installForClient('antigravity', { customHome: tmpHome, workspaceRoot: tmpWs });
    installForClient('antigravity', { customHome: tmpHome, workspaceRoot: tmpWs });

    const paths = getClientPaths('antigravity', tmpHome, tmpWs);
    const mcpJson = JSON.parse(fs.readFileSync(paths.mcpConfigPath!, 'utf-8'));
    expect(Object.keys(mcpJson.mcpServers).filter((k) => k === APP_NAME).length).toBe(1);

    const rules = fs.readFileSync(paths.rulesPath!, 'utf-8');
    const rulePattern = new RegExp(`BEGIN ${APP_NAME.toUpperCase()} RULES`, 'g');
    const matches = rules.match(rulePattern);
    expect(matches?.length).toBe(1);
  });

  it('uninstalls cleanly and removes entry and rules', () => {
    installForClient('antigravity', { customHome: tmpHome, workspaceRoot: tmpWs });
    const uninstRes = installForClient('antigravity', {
      uninstall: true,
      customHome: tmpHome,
      workspaceRoot: tmpWs,
    });

    expect(uninstRes.status).toBe('uninstalled');
    const paths = getClientPaths('antigravity', tmpHome, tmpWs);

    const mcpJson = JSON.parse(fs.readFileSync(paths.mcpConfigPath!, 'utf-8'));
    expect(mcpJson.mcpServers[APP_NAME]).toBeUndefined();

    // Check backup was created
    expect(fs.existsSync(`${paths.mcpConfigPath!}.bak`)).toBe(true);
  });

  it('installs to Claude Code and Cursor with proper paths', () => {
    const claudeRes = installForClient('claude_code', {
      customHome: tmpHome,
      workspaceRoot: tmpWs,
    });
    expect(claudeRes.status).toBe('installed');

    const cursorRes = installForClient('cursor', {
      customHome: tmpHome,
      workspaceRoot: tmpWs,
    });
    expect(cursorRes.status).toBe('installed');

    const claudePaths = getClientPaths('claude_code', tmpHome, tmpWs);
    expect(fs.existsSync(claudePaths.mcpConfigPath!)).toBe(true);

    const cursorPaths = getClientPaths('cursor', tmpHome, tmpWs);
    expect(fs.existsSync(cursorPaths.mcpConfigPath!)).toBe(true);
  });

  it('configures Codex in ~/.codex/config.toml with mcp_servers entry', () => {
    const res = installForClient('codex', {
      customHome: tmpHome,
      workspaceRoot: tmpWs,
    });
    expect(res.status).toBe('installed');
    expect(res.message).toContain('codex');

    const paths = getClientPaths('codex', tmpHome, tmpWs);
    expect(fs.existsSync(paths.mcpConfigPath!)).toBe(true);
    const toml = fs.readFileSync(paths.mcpConfigPath!, 'utf-8');
    expect(toml).toContain(`[mcp_servers.${APP_NAME}]`);
  });

  it('installs with useLocal flag pointing command to node and args to local bin', () => {
    installForClient('antigravity', {
      customHome: tmpHome,
      workspaceRoot: tmpWs,
      useLocal: true,
    });

    const paths = getClientPaths('antigravity', tmpHome, tmpWs);
    const mcpJson = JSON.parse(fs.readFileSync(paths.mcpConfigPath!, 'utf-8'));
    expect(mcpJson.mcpServers[APP_NAME].command).toBe(process.execPath);
    expect(mcpJson.mcpServers[APP_NAME].args[0]).toContain('overwatch.js');
    expect(mcpJson.mcpServers[APP_NAME].args[1]).toBe('serve');
  });
});
