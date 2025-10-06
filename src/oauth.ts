import express, { Request, Response } from 'express';
import { Client } from '@hubspot/api-client';
import crypto from 'crypto';
import { getRequestBaseUrl, logInfo, logWarn } from './utils';

// Simple in-memory token store. Replace with DB for production.
type AppInstall = {
  portalId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: number; // epoch ms
};

const installs = new Map<string, AppInstall>();

export const router = express.Router();

function getBaseUrl(): string {
  const fromEnv = process.env.APP_BASE_URL;
  if (!fromEnv) throw new Error('APP_BASE_URL not configured');
  return fromEnv.replace(/\/$/, '');
}

function getScopes(): string {
  return (process.env.HUBSPOT_SCOPES || '').split(/[ ,]+/).filter(Boolean).join(' ');
}

router.get('/install', async (req: Request, res: Response) => {
  const clientId = process.env.HUBSPOT_CLIENT_ID;
  const redirectUri = process.env.HUBSPOT_REDIRECT_URI || `${getRequestBaseUrl(req)}/oauth/callback`;
  const scopes = getScopes();
  if (!clientId) {
    return res.status(500).send('HUBSPOT_CLIENT_ID not configured');
  }
  const state = crypto.randomBytes(16).toString('hex');
  const authUrl = `https://app.hubspot.com/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&state=${encodeURIComponent(state)}`;
  res.redirect(authUrl);
});

router.get('/callback', async (req: Request, res: Response) => {
  const { code } = req.query as { code?: string };
  if (!code) {
    const base = getRequestBaseUrl(req);
    return res.redirect(`${base}/oauth/error?reason=missing_code`);
  }
  const redirectUri = process.env.HUBSPOT_REDIRECT_URI || `${getRequestBaseUrl(req)}/oauth/callback`;
  const client = new Client({});
  try {
    const tokenResponse = await (client.oauth.tokensApi as any).createToken(
      'authorization_code',
      code,
      redirectUri,
      process.env.HUBSPOT_CLIENT_ID || '',
      process.env.HUBSPOT_CLIENT_SECRET || ''
    );

    const accessToken = tokenResponse.accessToken as string;
    const refreshToken = tokenResponse.refreshToken as string;
    const expiresIn = Number(tokenResponse.expiresIn || 0) * 1000;
    const expiresAt = Date.now() + expiresIn - 60_000; // refresh 60s early

    // Fetch portal info using the token
    const authedClient = new Client({ accessToken });
    const portalInfo = await (authedClient.oauth.accessTokensApi as any).getAccessToken(accessToken);
    const portalId = String(portalInfo.hubId || portalInfo.hub_id);

    installs.set(portalId, { portalId, accessToken, refreshToken, expiresAt });
    logInfo('OAuth success', { portalId });
    const base = getRequestBaseUrl(req);
    return res.redirect(`${base}/oauth/success?portalId=${encodeURIComponent(portalId)}`);
  } catch (err) {
    logWarn('OAuth failed', {});
    const base = getRequestBaseUrl(req);
    return res.redirect(`${base}/oauth/error?reason=oauth_failed`);
  }
});

export async function getAccessTokenForPortal(portalId: string): Promise<string | undefined> {
  const found = installs.get(portalId);
  if (!found) return undefined;
  if (Date.now() < found.expiresAt) return found.accessToken;

  // refresh
  const client = new Client({});
  const redirectUri = process.env.HUBSPOT_REDIRECT_URI || `${getBaseUrl()}/oauth/callback`;
  const refreshResponse = await (client.oauth.tokensApi as any).createToken(
    'refresh_token',
    undefined,
    redirectUri,
    process.env.HUBSPOT_CLIENT_ID || '',
    process.env.HUBSPOT_CLIENT_SECRET || '',
    found.refreshToken
  );
  found.accessToken = refreshResponse.accessToken as string;
  found.refreshToken = refreshResponse.refreshToken as string;
  const expiresIn = Number(refreshResponse.expiresIn || 0) * 1000;
  found.expiresAt = Date.now() + expiresIn - 60_000;
  installs.set(portalId, found);
  return found.accessToken;
}

export function getInstallStore() {
  return installs;
}

