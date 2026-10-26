import { describe, it, expect } from 'vitest';
import { redactSecrets, isSensitiveFilename } from '../src/context/redactor.js';

describe('Secret Redactor & Privacy Guard', () => {
  it('redacts API keys and bearer tokens', () => {
    const raw = `const key = "sk-1234567890abcdef1234567890abcdef";
const bearer = "Bearer ya29.a0AfH6SMD_veryLongAccessToken1234567890";
const googleKey = "AIzaSyD-fakeKey1234567890abcdefghijklmn";
const ghToken = "ghp_abcdefghijklmnopqrstuvwxyz1234567890";`;

    const cleaned = redactSecrets(raw);
    expect(cleaned).not.toContain('sk-1234567890abcdef1234567890abcdef');
    expect(cleaned).toContain('[REDACTED_API_KEY]');
    expect(cleaned).toContain('[REDACTED_BEARER_TOKEN]');
    expect(cleaned).toContain('[REDACTED_GOOGLE_KEY]');
    expect(cleaned).toContain('[REDACTED_GITHUB_TOKEN]');
  });

  it('redacts private key blocks', () => {
    const raw = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA0Y1+fakePrivateKeyData
-----END RSA PRIVATE KEY-----`;

    const cleaned = redactSecrets(raw);
    expect(cleaned).toContain('[REDACTED_PRIVATE_KEY_BLOCK]');
    expect(cleaned).not.toContain('fakePrivateKeyData');
  });

  it('identifies sensitive files by name', () => {
    expect(isSensitiveFilename('.env')).toBe(true);
    expect(isSensitiveFilename('.env.local')).toBe(true);
    expect(isSensitiveFilename('.env.production')).toBe(true);
    expect(isSensitiveFilename('.env.example')).toBe(false); // Example templates allowed

    expect(isSensitiveFilename('server.key')).toBe(true);
    expect(isSensitiveFilename('cert.pem')).toBe(true);
    expect(isSensitiveFilename('id_rsa')).toBe(true);
    expect(isSensitiveFilename('id_ed25519')).toBe(true);
    expect(isSensitiveFilename('package.json')).toBe(false);
  });
});
