/**
 * Secret Redaction Pass & Privacy Guard
 * Scrubs credentials, API keys, tokens, and private keys before content leaves the machine.
 */

const SECRET_PATTERNS: Array<{ name: string; regex: RegExp; replacement: string }> = [
  // Generic Bearer / Authorization headers
  {
    name: 'Bearer Token',
    regex: /(Bearer\s+)[A-Za-z0-9_\-\.]{15,}/gi,
    replacement: '$1[REDACTED_BEARER_TOKEN]',
  },
  // OpenAI / Anthropic / OpenRouter API Keys
  {
    name: 'Standard AI API Key',
    regex: /(?:sk-[a-zA-Z0-9_\-]{20,}|sk-ant-[a-zA-Z0-9_\-]{20,}|sk-or-[a-zA-Z0-9_\-]{20,})/g,
    replacement: '[REDACTED_API_KEY]',
  },
  // Google AI API Keys
  {
    name: 'Google API Key',
    regex: /AIza[0-9A-Za-z-_]{35}/g,
    replacement: '[REDACTED_GOOGLE_KEY]',
  },
  // AWS Access Key ID & Secret Key
  {
    name: 'AWS Access Key',
    regex: /(?:A3T[A-Z0-9]|AKIA|AGPA|AIDA|AROA|AIPA|ANPA|ANVA|ASIA)[A-Z0-9]{16}/g,
    replacement: '[REDACTED_AWS_KEY]',
  },
  {
    name: 'AWS Secret Key',
    regex: /(?:aws_secret_access_key\s*=\s*)[A-Za-z0-9\/+=]{40}/gi,
    replacement: 'aws_secret_access_key = [REDACTED_AWS_SECRET]',
  },
  // GitHub Personal Access Tokens
  {
    name: 'GitHub Token',
    regex: /(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{36}/g,
    replacement: '[REDACTED_GITHUB_TOKEN]',
  },
  // Generic Private Key Blocks
  {
    name: 'Private Key Block',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY_BLOCK]',
  },
  // Password in connection strings (e.g. postgres://user:pass@host)
  {
    name: 'Connection String Password',
    regex: /((?:postgres|mysql|mongodb|redis):\/\/[^:\s]+:)[^@\s]+(@)/gi,
    replacement: '$1[REDACTED_PASSWORD]$2',
  },
];

export function redactSecrets(content: string): string {
  if (!content) return '';
  let result = content;
  for (const { regex, replacement } of SECRET_PATTERNS) {
    result = result.replace(regex, replacement);
  }
  return result;
}

export function isSensitiveFilename(filename: string): boolean {
  const lower = filename.toLowerCase();
  const basename = lower.split(/[\\/]/).pop() || '';

  // Exclude .env files except .env.example
  if (basename.startsWith('.env') && !basename.includes('.example')) {
    return true;
  }

  // Certs and private keys
  if (
    basename.endsWith('.pem') ||
    basename.endsWith('.key') ||
    basename.endsWith('.pkcs12') ||
    basename.endsWith('.pfx') ||
    basename.endsWith('.crt') ||
    basename.endsWith('.cert') ||
    basename.startsWith('id_rsa') ||
    basename.startsWith('id_ed25519')
  ) {
    return true;
  }

  return false;
}
