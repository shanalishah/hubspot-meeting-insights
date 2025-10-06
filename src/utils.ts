import type { Request } from 'express';

export function getRequestBaseUrl(req: Request): string {
  const fromEnv = process.env.APP_BASE_URL;
  if (fromEnv && fromEnv.trim().length > 0) return fromEnv.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string) || (req.protocol || 'http');
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host') || 'localhost';
  return `${proto}://${host}`.replace(/\/$/, '');
}

export async function withRetry<T>(fn: () => Promise<T>, opts?: { retries?: number; baseMs?: number }): Promise<T> {
  const retries = opts?.retries ?? 3;
  const baseMs = opts?.baseMs ?? 300;
  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      const status = err?.status || err?.response?.status;
      if (attempt >= retries || ![429, 500, 502, 503, 504].includes(Number(status))) throw err;
      const delay = baseMs * Math.pow(2, attempt) + Math.floor(Math.random() * 100);
      await new Promise((r) => setTimeout(r, delay));
      attempt += 1;
    }
  }
}

export function logInfo(message: string, ctx?: Record<string, unknown>) {
  // Mask PII-like fields
  const masked = maskCtx(ctx);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ level: 'info', message, ...masked }));
}
export function maskToken(token?: string): string {
  if (!token) return '';
  if (token.length <= 8) return '*'.repeat(token.length);
  return `${token.slice(0, 4)}***${token.slice(-4)}`;
}


export function logWarn(message: string, ctx?: Record<string, unknown>) {
  const masked = maskCtx(ctx);
  // eslint-disable-next-line no-console
  console.warn(JSON.stringify({ level: 'warn', message, ...masked }));
}

function maskCtx(ctx?: Record<string, unknown>) {
  if (!ctx) return {};
  const clone: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(ctx)) {
    if (k.toLowerCase().includes('email')) {
      clone[k] = typeof v === 'string' ? maskEmail(v) : v;
    } else if (k.toLowerCase().includes('token') || k.toLowerCase().includes('secret')) {
      clone[k] = '***';
    } else {
      clone[k] = v;
    }
  }
  return { context: clone };
}

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return '***';
  const maskedUser = user.length <= 2 ? '*'.repeat(user.length) : user[0] + '*'.repeat(user.length - 2) + user[user.length - 1];
  return `${maskedUser}@${domain}`;
}

// Signature v3 helper for tests and handler
export function verifySignatureV3(rawBody: string, signature: string | undefined, secret: string | undefined): boolean {
  if (!signature || !secret) return false;
  const crypto = require('crypto');
  const computed = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
  try {
    return require('crypto').timingSafeEqual(Buffer.from(signature), Buffer.from(computed));
  } catch {
    return false;
  }
}


