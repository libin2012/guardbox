/**
 * AWS: Cognito User Pool (sign-in) -> Cognito Identity Pool (temporary credentials) -> S3.
 * Cognito calls are unsigned JSON APIs, so plain fetch is used. S3 requests are
 * presigned with a small built-in SigV4 signer and sent with fetch, so no AWS SDK or Node polyfills are needed.
 * Object key: private/{identityId}/guardbox-backup.json
 */
import { parseBackup } from '../store';
import { presignS3 } from './sigv4';
import { errorMessage, ProviderConfig, required, SyncProvider } from './types';

const fields = [
  { key: 'region', label: 'Region', placeholder: 'us-east-1' },
  { key: 'userPoolId', label: 'User pool ID', placeholder: 'us-east-1_AbC123' },
  { key: 'clientId', label: 'App client ID (no secret)' },
  { key: 'identityPoolId', label: 'Identity pool ID', placeholder: 'us-east-1:0000-…' },
  { key: 'bucket', label: 'S3 bucket' },
  { key: 'email', label: 'Username / email' },
  { key: 'password', label: 'Password', secure: true },
];

async function cognito<T>(service: 'idp' | 'identity', region: string, target: string, body: unknown): Promise<T> {
  const host = service === 'idp' ? `cognito-idp.${region}.amazonaws.com` : `cognito-identity.${region}.amazonaws.com`;
  const prefix = service === 'idp' ? 'AWSCognitoIdentityProviderService' : 'AWSCognitoIdentityService';
  const res = await fetch(`https://${host}/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-amz-json-1.1', 'X-Amz-Target': `${prefix}.${target}` },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(errorMessage(json) ?? (json as any).__type ?? `Cognito HTTP ${res.status}`);
  return json as T;
}

interface AwsSession {
  identityId: string;
  credentials: { accessKeyId: string; secretAccessKey: string; sessionToken: string };
}

async function signIn(cfg: ProviderConfig): Promise<AwsSession> {
  required(cfg, fields);
  const region = cfg.region.trim();
  const auth = await cognito<{ AuthenticationResult?: { IdToken: string }; ChallengeName?: string }>('idp', region, 'InitiateAuth', {
    AuthFlow: 'USER_PASSWORD_AUTH',
    ClientId: cfg.clientId.trim(),
    AuthParameters: { USERNAME: cfg.email.trim(), PASSWORD: cfg.password },
  });
  if (!auth.AuthenticationResult) throw new Error(`Cognito needs an extra step (${auth.ChallengeName ?? 'unknown'}). Finish it in the AWS console first.`);
  const login = { [`cognito-idp.${region}.amazonaws.com/${cfg.userPoolId.trim()}`]: auth.AuthenticationResult.IdToken };
  const { IdentityId } = await cognito<{ IdentityId: string }>('identity', region, 'GetId', { IdentityPoolId: cfg.identityPoolId.trim(), Logins: login });
  const { Credentials } = await cognito<{ Credentials: { AccessKeyId: string; SecretKey: string; SessionToken: string } }>(
    'identity', region, 'GetCredentialsForIdentity', { IdentityId, Logins: login },
  );
  return {
    identityId: IdentityId,
    credentials: { accessKeyId: Credentials.AccessKeyId, secretAccessKey: Credentials.SecretKey, sessionToken: Credentials.SessionToken },
  };
}

function presign(cfg: ProviderConfig, s: AwsSession, method: 'GET' | 'PUT'): string {
  return presignS3({
    method,
    bucket: cfg.bucket.trim(),
    key: `private/${s.identityId}/guardbox-backup.json`,
    region: cfg.region.trim(),
    ...s.credentials,
  });
}

export const awsProvider: SyncProvider = {
  id: 'aws',
  label: 'AWS',
  description: 'Amazon Cognito sign-in + a private S3 object per user. Fits in the AWS free tier.',
  fields,
  async push(cfg, backup) {
    const s = await signIn(cfg);
    const url = presign(cfg, s, 'PUT');
    const res = await fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(backup) });
    if (!res.ok) throw new Error(`S3 upload failed (HTTP ${res.status})`);
  },
  async pull(cfg) {
    const s = await signIn(cfg);
    const res = await fetch(presign(cfg, s, 'GET'));
    if (res.status === 404 || res.status === 403) {
      // S3 returns 403 for a missing key when the role cannot ListBucket
      const body = await res.text();
      if (res.status === 404 || body.includes('NoSuchKey') || body.includes('AccessDenied')) return null;
    }
    if (!res.ok) throw new Error(`S3 download failed (HTTP ${res.status})`);
    return parseBackup(await res.text());
  },
};
