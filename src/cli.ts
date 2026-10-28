import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { APP_NAME, BIN_NAME, CONFIG_DIR_NAME } from './constants.js';
import {
  resolveConfig,
  saveConfigFile,
  maskApiKey,
  getGlobalConfigPath,
  OverwatchConfig,
} from './config.js';
import { runServer } from './server.js';
import { ProviderRouter } from './providers/router.js';
import { validateMentorSuperiority, getModelTier } from './tiers.js';
import { installForClient, getClientPaths } from './clients/installer.js';
import { SupportedClient } from './clients/types.js';
import { loadStoredUsage } from './budget/tracker.js';

export function createCli(): Command {
  const program = new Command();

  program
    .name(BIN_NAME)
    .description(`${APP_NAME.toUpperCase()}: Steer junior models with senior mentor models via MCP.`)
    .version('1.0.0');

  // Command: serve
  program
    .command('serve')
    .description('Run the Stdio MCP server')
    .action(async () => {
      await runServer();
    });

  // Command: doctor
  program
    .command('doctor')
    .description('Check environment, provider connectivity, model tiers, and client configs')
    .action(async () => {
      console.log(`\n🏥 --- ${APP_NAME.toUpperCase()} DOCTOR --- 🏥\n`);

      // 1. Node version & executable
      console.log(`Node Environment:`);
      console.log(`  - Version: ${process.version}`);
      console.log(`  - Executable: ${process.execPath}`);
      console.log(`  - Platform: ${process.platform} (${process.arch})`);

      // 2. Config & Keys
      const config = resolveConfig();
      console.log(`\nConfiguration (${getGlobalConfigPath()}):`);
      console.log(`  - Mentor Provider:   ${config.mentorProvider || '(auto-detected from key/model)'}`);
      console.log(`  - Mentor Model:      ${config.mentorModel}`);
      console.log(`  - Junior Model:      ${config.juniorModel === 'auto' ? 'auto (dynamic from IDE)' : config.juniorModel}`);
      console.log(`  - OpenRouter Key:    ${maskApiKey(config.openrouterApiKey)}`);
      if (config.openrouterBaseUrl) {
        console.log(`  - OpenRouter Base:   ${config.openrouterBaseUrl}`);
      }
      console.log(`  - Anthropic Key:     ${maskApiKey(config.anthropicApiKey)}`);
      if (config.anthropicBaseUrl) {
        console.log(`  - Anthropic Base:    ${config.anthropicBaseUrl}`);
      }
      console.log(`  - Gemini Key:        ${maskApiKey(config.geminiApiKey)}`);
      if (config.geminiBaseUrl) {
        console.log(`  - Gemini Base URL:   ${config.geminiBaseUrl}`);
      }
      console.log(`  - OpenAI Key:        ${maskApiKey(config.openaiApiKey)}`);
      if (config.openaiBaseUrl) {
        console.log(`  - OpenAI Base URL:   ${config.openaiBaseUrl}`);
      }
      console.log(`  - Bedrock Key:       ${maskApiKey(config.bedrockApiKey)}`);
      if (config.awsAccessKeyId) {
        console.log(`  - AWS Access Key:    ${maskApiKey(config.awsAccessKeyId)} (${config.awsRegion || 'us-east-1'})`);
      }
      if (config.bedrockBaseUrl) {
        console.log(`  - Bedrock Base URL:  ${config.bedrockBaseUrl}`);
      }
      if (config.customBaseUrl) {
        console.log(`  - Custom Base URL:   ${config.customBaseUrl}`);
        console.log(`  - Custom API Key:    ${maskApiKey(config.customApiKey)}`);
      }

      // 3. Models & Tiers
      console.log(`\nModel Tier Validation:`);
      console.log(`  - Junior Model: ${config.juniorModel === 'auto' ? 'auto (dynamic from active agent)' : config.juniorModel}`);
      console.log(`  - Mentor Model: ${config.mentorModel}`);
      const tierRes = validateMentorSuperiority(config.mentorModel, config.juniorModel);
      console.log(`  - Junior Tier:  ${tierRes.juniorTier}`);
      console.log(`  - Mentor Tier:  ${tierRes.mentorTier}`);
      if (tierRes.valid) {
        if (config.juniorModel === 'auto') {
          console.log(`  - Status:       ✅ VALID (Dynamic runtime validation per tool call)`);
        } else {
          console.log(`  - Status:       ✅ VALID (Mentor is strictly stronger)`);
        }
      } else {
        console.log(`  - Status:       🚨 INVALID: ${tierRes.warning}`);
      }

      // 4. Provider Connectivity
      console.log(`\nLive Mentor Connectivity:`);
      const router = new ProviderRouter(config);
      try {
        const health = await router.healthCheck();
        if (health.ok) {
          console.log(`  - Status:  🟢 CONNECTED (${health.provider}, ping: ${health.latencyMs}ms)`);
        } else {
          console.log(`  - Status:  🔴 FAILED (${health.provider}: ${health.error})`);
        }
      } catch (err: any) {
        console.log(`  - Status:  🔴 ERROR: ${err?.message || err}`);
      }

      // 5. Client Registrations
      console.log(`\nClient MCP Registrations:`);
      const clients: SupportedClient[] = ['antigravity', 'claude_code', 'cursor', 'windsurf', 'vscode', 'codex'];
      for (const cl of clients) {
        const paths = getClientPaths(cl);
        let registered = false;
        if (paths.mcpConfigPath && fs.existsSync(paths.mcpConfigPath)) {
          try {
            const raw = fs.readFileSync(paths.mcpConfigPath, 'utf-8');
            if (cl === 'codex') {
              registered = raw.includes(`[mcp_servers.${APP_NAME}]`);
            } else {
              const parsed = JSON.parse(raw);
              if (parsed.mcpServers?.[APP_NAME]) {
                registered = true;
              }
            }
          } catch {}
        }
        // Display 'vscode (Cline)' to clarify the client actually configured is the Cline extension
        const displayName = cl === 'vscode' ? 'vscode (Cline)' : cl;
        console.log(
          `  - ${displayName.padEnd(16)}: ${registered ? '✅ Configured' : '⚪ Not registered'} (${paths.mcpConfigPath || 'n/a'})`
        );
      }

      console.log(`\nDoctor check completed.\n`);
    });

  // Command: setup
  program
    .command('setup')
    .description('Register the MCP server, skill, and rules in an AI agent client')
    .requiredOption(
      '--client <client>',
      'Target client (antigravity, claude_code, cursor, windsurf, vscode, codex, all)'
    )
    .option('--local', 'Register local development binary path for instant code reloads on npm run build')
    .option('--dry-run', 'Preview changes without modifying any files')
    .option('--uninstall', `Remove ${APP_NAME} from the specified client`)
    .action((opts) => {
      const client = opts.client as SupportedClient;
      const clientsToRun: SupportedClient[] =
        client === 'all'
          ? ['antigravity', 'claude_code', 'cursor', 'windsurf', 'vscode', 'codex']
          : [client];

      console.log(`\n⚙️  Running ${APP_NAME} setup for: ${clientsToRun.join(', ')}`);
      if (opts.dryRun) console.log(`   (Mode: DRY-RUN - no files will be written)\n`);

      for (const c of clientsToRun) {
        const res = installForClient(c, {
          dryRun: opts.dryRun,
          uninstall: opts.uninstall,
          useLocal: opts.local,
        });

        console.log(`[${c}] ${res.message}`);
        for (const p of res.pathsModified) {
          console.log(`  - Modified: ${p}`);
        }
        for (const b of res.backupsCreated) {
          console.log(`  - Backup:   ${b}`);
        }
      }
      console.log(`\nSetup completed.\n`);
    });

  // Command: configure
  program
    .command('configure')
    .description('Interactive configuration wizard for keys and models')
    .action(async () => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      const ask = (q: string): Promise<string> =>
        new Promise((resolve) => rl.question(q, resolve));

      const current = resolveConfig();
      console.log(`\n🛠️  --- ${APP_NAME.toUpperCase()} CONFIGURATION WIZARD --- 🛠️\n`);
      console.log('Select your primary Mentor Provider:');
      console.log('  1) Amazon Bedrock (bedrock)');
      console.log('  2) Anthropic (anthropic)');
      console.log('  3) Google Gemini (gemini)');
      console.log('  4) OpenAI (openai)');
      console.log('  5) OpenRouter (openrouter)');
      console.log('  6) Custom / Local (custom)');

      const providerChoice = await ask(`\nProvider [${current.mentorProvider || '1'}]: `);
      let provider: 'bedrock' | 'anthropic' | 'gemini' | 'openai' | 'openrouter' | 'custom' = current.mentorProvider || 'bedrock';
      const pRaw = providerChoice.trim().toLowerCase();
      if (pRaw === '1' || pRaw === 'bedrock') provider = 'bedrock';
      else if (pRaw === '2' || pRaw === 'anthropic') provider = 'anthropic';
      else if (pRaw === '3' || pRaw === 'gemini') provider = 'gemini';
      else if (pRaw === '4' || pRaw === 'openai') provider = 'openai';
      else if (pRaw === '5' || pRaw === 'openrouter') provider = 'openrouter';
      else if (pRaw === '6' || pRaw === 'custom') provider = 'custom';

      const newConfig: Partial<OverwatchConfig> = {
        mentorProvider: provider,
      };

      if (provider === 'bedrock') {
        const key = await ask(`Bedrock API Key / Bearer Token [${maskApiKey(current.bedrockApiKey)}]: `);
        if (key.trim()) newConfig.bedrockApiKey = key.trim();

        if (!newConfig.bedrockApiKey && !current.bedrockApiKey) {
          const awsKey = await ask(`AWS Access Key ID [${maskApiKey(current.awsAccessKeyId)}]: `);
          if (awsKey.trim()) newConfig.awsAccessKeyId = awsKey.trim();
          const awsSec = await ask(`AWS Secret Access Key [${maskApiKey(current.awsSecretAccessKey)}]: `);
          if (awsSec.trim()) newConfig.awsSecretAccessKey = awsSec.trim();
        }
        const region = await ask(`AWS Region [${current.awsRegion || 'us-east-1'}]: `);
        if (region.trim()) newConfig.awsRegion = region.trim();

        const defaultModel =
          current.mentorModel && (current.mentorModel.includes('bedrock') || current.mentorModel.includes('claude') || current.mentorModel.includes('anthropic.'))
            ? current.mentorModel
            : 'anthropic.claude-3-7-sonnet-20250219-v1:0';
        const mentor = await ask(`Mentor Model [${defaultModel}]: `);
        newConfig.mentorModel = mentor.trim() || defaultModel;
      } else if (provider === 'anthropic') {
        const key = await ask(`Anthropic API Key [${maskApiKey(current.anthropicApiKey)}]: `);
        if (key.trim()) newConfig.anthropicApiKey = key.trim();
        const defaultModel = current.mentorModel && current.mentorModel.startsWith('claude') ? current.mentorModel : 'claude-3-7-sonnet-20250219';
        const mentor = await ask(`Mentor Model [${defaultModel}]: `);
        newConfig.mentorModel = mentor.trim() || defaultModel;
      } else if (provider === 'gemini') {
        const key = await ask(`Gemini API Key [${maskApiKey(current.geminiApiKey)}]: `);
        if (key.trim()) newConfig.geminiApiKey = key.trim();
        const defaultModel = current.mentorModel && current.mentorModel.startsWith('gemini') ? current.mentorModel : 'gemini-2.5-pro';
        const mentor = await ask(`Mentor Model [${defaultModel}]: `);
        newConfig.mentorModel = mentor.trim() || defaultModel;
      } else if (provider === 'openai') {
        const key = await ask(`OpenAI API Key [${maskApiKey(current.openaiApiKey)}]: `);
        if (key.trim()) newConfig.openaiApiKey = key.trim();
        const defaultModel = current.mentorModel && (current.mentorModel.startsWith('o') || current.mentorModel.startsWith('gpt')) ? current.mentorModel : 'o3-mini';
        const mentor = await ask(`Mentor Model [${defaultModel}]: `);
        newConfig.mentorModel = mentor.trim() || defaultModel;
      } else if (provider === 'openrouter') {
        const key = await ask(`OpenRouter API Key [${maskApiKey(current.openrouterApiKey)}]: `);
        if (key.trim()) newConfig.openrouterApiKey = key.trim();
        const defaultModel = current.mentorModel && current.mentorModel.includes('/') ? current.mentorModel : 'anthropic/claude-3.7-sonnet';
        const mentor = await ask(`Mentor Model [${defaultModel}]: `);
        newConfig.mentorModel = mentor.trim() || defaultModel;
      } else if (provider === 'custom') {
        const baseUrl = await ask(`Custom Base URL [${current.customBaseUrl || 'http://localhost:11434/v1'}]: `);
        newConfig.customBaseUrl = baseUrl.trim() || current.customBaseUrl || 'http://localhost:11434/v1';
        const key = await ask(`Custom API Key (optional) [${maskApiKey(current.customApiKey)}]: `);
        if (key.trim()) newConfig.customApiKey = key.trim();
        const mentor = await ask(`Mentor Model [${current.mentorModel}]: `);
        newConfig.mentorModel = mentor.trim() || current.mentorModel;
      }

      // Junior model: defaults to 'auto' to let active IDE agent govern
      const defaultJunior = current.juniorModel || 'auto';
      const junior = await ask(`Junior model (worker agent in IDE; press Enter for '${defaultJunior}') [${defaultJunior}]: `);
      const updatedJunior = junior.trim() || defaultJunior;
      newConfig.juniorModel = updatedJunior;

      if (updatedJunior !== 'auto') {
        const tierRes = validateMentorSuperiority(newConfig.mentorModel!, updatedJunior, {
          allowSameTier: current.allowSameTier,
        });
        if (!tierRes.valid) {
          console.log(`\n⚠️  WARNING: ${tierRes.warning}`);
          const confirm = await ask(`Do you wish to keep this configuration anyway (force override)? (y/N): `);
          if (confirm.toLowerCase() !== 'y') {
            console.log(`Configuration aborted.`);
            rl.close();
            return;
          }
          newConfig.allowSameTier = true;
        }
      }

      saveConfigFile(newConfig);
      console.log(`\n✅ Configuration saved to ${getGlobalConfigPath()}`);
      console.log(`Active Mentor: ${newConfig.mentorModel} via ${newConfig.mentorProvider}\n`);
      rl.close();
    });

  // Command: stats
  program
    .command('stats')
    .description('Display session and lifetime token usage and estimated spend')
    .option('--repo <path>', 'Repository path to check usage file', process.cwd())
    .action((opts) => {
      const usage = loadStoredUsage(opts.repo);
      console.log(`\n📊 --- ${APP_NAME.toUpperCase()} USAGE STATS --- 📊`);
      console.log(`Repository: ${opts.repo}`);
      console.log(`Total Calls:             ${usage.totalCalls}`);
      console.log(`Total Tokens:            ${usage.totalTokens}`);
      console.log(`  - Prompt Tokens:       ${usage.totalPromptTokens}`);
      console.log(`  - Completion Tokens:   ${usage.totalCompletionTokens}`);
      console.log(`Total Estimated Spend:   \$${usage.totalSpendUsd.toFixed(4)}\n`);

      if (usage.history.length > 0) {
        console.log(`Recent Activity (Last 5):`);
        const recent = usage.history.slice(-5);
        for (const r of recent) {
          console.log(
            `  [${r.timestamp.slice(0, 19)}] ${r.tool.padEnd(22)} (${r.model}) : ${r.totalTokens} tokens, \$${r.estimatedCostUsd.toFixed(4)}`
          );
        }
        console.log('');
      }
    });

  return program;
}
