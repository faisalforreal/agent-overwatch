import crypto from 'node:crypto';
import {
  MentorProvider,
  ProviderHealth,
  ProviderRequestOptions,
} from './base.js';
import { UsageStats } from '../types.js';
import { DEFAULT_TIMEOUT_MS } from '../constants.js';
import { estimateModelCost } from '../tiers.js';

export interface BedrockProviderOptions {
  apiKey?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  region?: string;
  baseUrl?: string;
  defaultModel?: string;
}

/**
 * Pure Node.js AWS SigV4 signer for bedrock-runtime without external dependencies
 */
function signAwsV4Request(
  method: string,
  url: URL,
  headers: Record<string, string>,
  payload: string,
  credentials: {
    accessKeyId: string;
    secretAccessKey: string;
    sessionToken?: string;
    region: string;
    service: string;
  }
): Record<string, string> {
  const { accessKeyId, secretAccessKey, sessionToken, region, service } = credentials;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.substring(0, 8);

  const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');

  const signedHeadersRecord: Record<string, string> = {
    ...headers,
    host: url.host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
  };

  if (sessionToken) {
    signedHeadersRecord['x-amz-security-token'] = sessionToken;
  }

  // Canonical headers (sorted, lowercase)
  const sortedHeaderKeys = Object.keys(signedHeadersRecord)
    .map((k) => k.toLowerCase())
    .sort();

  const canonicalHeadersStr = sortedHeaderKeys
    .map((k) => `${k}:${signedHeadersRecord[k].trim()}\n`)
    .join('');

  const signedHeadersStr = sortedHeaderKeys.join(';');

  const canonicalRequest = [
    method.toUpperCase(),
    url.pathname,
    url.search ? url.search.substring(1) : '',
    canonicalHeadersStr,
    signedHeadersStr,
    payloadHash,
  ].join('\n');

  const algorithm = 'AWS4-HMAC-SHA256';
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const canonicalRequestHash = crypto
    .createHash('sha256')
    .update(canonicalRequest)
    .digest('hex');

  const stringToSign = [algorithm, amzDate, credentialScope, canonicalRequestHash].join('\n');

  // Key derivation
  function hmac(key: Buffer | string, data: string): Buffer {
    return crypto.createHmac('sha256', key).update(data).digest();
  }

  const kDate = hmac('AWS4' + secretAccessKey, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const authHeader = `${algorithm} Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeadersStr}, Signature=${signature}`;

  return {
    ...signedHeadersRecord,
    Authorization: authHeader,
  };
}

export class BedrockProvider implements MentorProvider {
  public name = 'bedrock';
  public defaultModel: string;
  private apiKey?: string;
  private accessKeyId?: string;
  private secretAccessKey?: string;
  private sessionToken?: string;
  private region: string;
  private customBaseUrl?: string;

  constructor(options: BedrockProviderOptions = {}) {
    this.apiKey = options.apiKey;
    this.accessKeyId = options.accessKeyId;
    this.secretAccessKey = options.secretAccessKey;
    this.sessionToken = options.sessionToken;
    this.region = options.region || 'us-east-1';
    this.customBaseUrl = options.baseUrl?.replace(/\/+$/, '');
    this.defaultModel = options.defaultModel || 'anthropic.claude-3-5-sonnet-20241022-v2:0';
  }

  private getModelUrl(modelId: string): string {
    const cleanModel = modelId.replace(/^bedrock\//, '');
    if (this.customBaseUrl) {
      return `${this.customBaseUrl}/model/${encodeURIComponent(cleanModel)}/converse`;
    }
    return `https://bedrock-runtime.${this.region}.amazonaws.com/model/${encodeURIComponent(cleanModel)}/converse`;
  }

  private buildRequestHeaders(
    method: string,
    urlStr: string,
    payload: string
  ): Record<string, string> {
    const url = new URL(urlStr);
    const baseHeaders: Record<string, string> = {
      'content-type': 'application/json',
      accept: 'application/json',
    };

    // 1. If explicit Bedrock API Key is set, use Bearer / x-api-key authentication
    if (this.apiKey) {
      return {
        ...baseHeaders,
        Authorization: `Bearer ${this.apiKey}`,
        'x-api-key': this.apiKey,
      };
    }

    // 2. If AWS Credentials are set, sign using AWS SigV4
    if (this.accessKeyId && this.secretAccessKey) {
      return signAwsV4Request(method, url, baseHeaders, payload, {
        accessKeyId: this.accessKeyId,
        secretAccessKey: this.secretAccessKey,
        sessionToken: this.sessionToken,
        region: this.region,
        service: 'bedrock',
      });
    }

    return baseHeaders;
  }

  async healthCheck(model?: string): Promise<ProviderHealth> {
    const targetModel = (model || this.defaultModel).replace(/^bedrock\//, '');
    const start = Date.now();
    try {
      const url = this.getModelUrl(targetModel);
      const payload = JSON.stringify({
        messages: [{ role: 'user', content: [{ text: 'ping' }] }],
        inferenceConfig: { maxTokens: 1, temperature: 0 },
      });

      const headers = this.buildRequestHeaders('POST', url, payload);
      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: payload,
      });

      const latencyMs = Date.now() - start;
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        return {
          ok: false,
          provider: this.name,
          model: targetModel,
          latencyMs,
          error: `HTTP ${res.status}: ${errText.slice(0, 200)}`,
        };
      }

      return {
        ok: true,
        provider: this.name,
        model: targetModel,
        latencyMs,
      };
    } catch (err: any) {
      return {
        ok: false,
        provider: this.name,
        model: targetModel,
        latencyMs: Date.now() - start,
        error: err?.message || String(err),
      };
    }
  }

  async generate(
    options: ProviderRequestOptions
  ): Promise<{ rawText: string; usage: UsageStats }> {
    const targetModel = (options.model || this.defaultModel).replace(/^bedrock\//, '');
    const controller = new AbortController();
    const timeout = options.timeoutMs || DEFAULT_TIMEOUT_MS;
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, timeout);

    let progressInterval: NodeJS.Timeout | undefined;
    if (options.onProgress) {
      let tick = 0;
      options.onProgress(5, 100, `Contacting Amazon Bedrock mentor (${targetModel})...`);
      progressInterval = setInterval(() => {
        tick++;
        const pct = Math.min(10 + tick * 10, 95);
        options.onProgress!(pct, 100, `Reasoning in progress... (${tick * 5}s)`);
      }, 5000);
    }

    try {
      const systemText = options.notesContext
        ? `${options.systemPrompt}\n\n### Persistent Project Notes:\n${options.notesContext}`
        : options.systemPrompt;

      const body = {
        messages: [
          {
            role: 'user',
            content: [{ text: options.userPrompt }],
          },
        ],
        system: [{ text: systemText }],
        inferenceConfig: {
          maxTokens: options.maxTokens || 4096,
        },
      };

      const payload = JSON.stringify(body);
      const url = this.getModelUrl(targetModel);
      const headers = this.buildRequestHeaders('POST', url, payload);

      const res = await fetch(url, {
        method: 'POST',
        headers,
        body: payload,
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Amazon Bedrock API Error (${res.status}): ${errorText}`);
      }

      const data = (await res.json()) as any;
      let rawText = '';
      if (Array.isArray(data.output?.message?.content)) {
        for (const item of data.output.message.content) {
          if (item.text) rawText += item.text;
        }
      }

      const promptTokens = data.usage?.inputTokens || 0;
      const completionTokens = data.usage?.outputTokens || 0;
      const totalTokens = data.usage?.totalTokens || promptTokens + completionTokens;

      const cost = estimateModelCost(targetModel, promptTokens, completionTokens);

      return {
        rawText,
        usage: {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: totalTokens,
          estimated_cost_usd: cost,
        },
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new Error(`Request to Amazon Bedrock timed out after ${timeout}ms.`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
      if (progressInterval) clearInterval(progressInterval);
    }
  }
}
