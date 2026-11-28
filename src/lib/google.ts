/**
 * Google Drive, through Google's REST APIs (no SDK).
 *
 * Sign-in is OAuth 2.0 with PKCE in the system browser sheet (expo-auth-session),
 * using an iOS OAuth client from the owner's own Google Cloud project
 * (GOOGLE_IOS_CLIENT_ID at build time, see SYNC_SETUP.md). The only scope is
 * `drive.file`: GuardBox can see and change the files it created, and nothing
 * else in the user's Drive. The refresh token lives in the iOS Keychain; the
 * short-lived access token only in memory.
 *
 * Files go in a visible "GuardBox" folder. Callers only ever hand this module
 * ciphertext (encrypted backups and the encrypted sync copy).
 */
import Constants from 'expo-constants';
import * as AuthSession from 'expo-auth-session';
import { getSecret, setSecret } from './security';
import { errorMessage, fetchWithTimeout } from './sync/types';

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const FOLDER_NAME = 'GuardBox';
export const SYNC_FILE_NAME = 'GuardBox-sync.json';
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const SECRET = 'google';

/** What `appProperties.guardbox` says a file is. */
export type DriveFileKind = 'backup' | 'sync';

export interface DriveFile {
  id: string;
  name: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
}

export interface GoogleAccount {
  email?: string;
  name?: string;
}

interface StoredAccount extends GoogleAccount {
  refreshToken: string;
}

let access: { token: string; expires: number } | null = null;

export class GoogleNotConnectedError extends Error {
  constructor(message = 'Connect your Google account first.') {
    super(message);
    this.name = 'GoogleNotConnectedError';
  }
}

/** The iOS OAuth client ID this build was made with, if any. */
export function googleClientId(): string | undefined {
  const id = Constants.expoConfig?.extra?.googleIosClientId;
  return typeof id === 'string' && id.trim() ? id.trim() : undefined;
}

/** `123-abc.apps.googleusercontent.com` -> `com.googleusercontent.apps.123-abc` (the app's URL scheme for the redirect). */
export function reversedClientId(clientId: string): string {
  return `com.googleusercontent.apps.${clientId.replace(/\.apps\.googleusercontent\.com$/, '')}`;
}

export function redirectUri(clientId: string): string {
  return `${reversedClientId(clientId)}:/oauthredirect`;
}

function requireClientId(): string {
  const id = googleClientId();
  if (!id) throw new Error('Google Drive is not set up in this build. Add a Google iOS OAuth client ID as GOOGLE_IOS_CLIENT_ID and rebuild (see SYNC_SETUP.md).');
  return id;
}

async function stored(): Promise<StoredAccount | null> {
  const raw = await getSecret(SECRET);
  if (!raw) return null;
  try {
    const a = JSON.parse(raw) as StoredAccount;
    return a?.refreshToken ? a : null;
  } catch {
    return null;
  }
}

/** The connected Google account, or null. */
export async function getGoogleAccount(): Promise<GoogleAccount | null> {
  const a = await stored();
  return a ? { email: a.email, name: a.name } : null;
}

async function postForm<T>(url: string, form: Record<string, string>): Promise<T> {
  const res = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: Object.entries(form).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&'),
  });
  const text = await res.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    // not JSON; fall through to the status code
  }
  if (!res.ok) {
    const err = new Error(errorMessage(json) ?? `Google sign-in failed (HTTP ${res.status})`) as Error & { code?: string };
    err.code = (json as { error?: unknown })?.error === 'invalid_grant' ? 'invalid_grant' : undefined;
    throw err;
  }
  return json as T;
}

interface TokenResponse {
  access_token: string;
  expires_in?: number;
  refresh_token?: string;
}

function remember(t: TokenResponse) {
  access = { token: t.access_token, expires: Date.now() + ((t.expires_in ?? 3600) - 60) * 1000 };
}

/**
 * Show Google's sign-in sheet and connect an account. Returns null if the user
 * cancels. Asks only for the `drive.file` scope.
 */
export async function connectGoogle(): Promise<GoogleAccount | null> {
  const clientId = requireClientId();
  const request = new AuthSession.AuthRequest({
    clientId,
    redirectUri: redirectUri(clientId),
    scopes: [DRIVE_SCOPE],
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    // always return a refresh token, even if this account connected before
    prompt: AuthSession.Prompt.Consent,
  });
  const result = await request.promptAsync({ authorizationEndpoint: AUTH_URL });
  if (result.type !== 'success' && result.type !== 'error') return null;
  if (result.type === 'error' || !result.params.code) {
    throw new Error(result.type === 'error' && result.error?.message ? result.error.message : 'Google did not complete the sign-in. Try again.');
  }
  const tokens = await postForm<TokenResponse>(TOKEN_URL, {
    code: result.params.code,
    client_id: clientId,
    redirect_uri: redirectUri(clientId),
    grant_type: 'authorization_code',
    code_verifier: request.codeVerifier ?? '',
  });
  if (!tokens.refresh_token) throw new Error('Google did not return a sign-in token. Try connecting again.');
  remember(tokens);
  const account: StoredAccount = { refreshToken: tokens.refresh_token };
  try {
    const about = await driveJson<{ user?: { emailAddress?: string; displayName?: string } }>(`${API}/about?fields=user(emailAddress,displayName)`);
    account.email = about.user?.emailAddress;
    account.name = about.user?.displayName;
  } catch {
    // the account name is only for display
  }
  await setSecret(SECRET, JSON.stringify(account));
  return { email: account.email, name: account.name };
}

/** Forget the account on this phone and revoke GuardBox's access (best effort). Files in Drive stay. */
export async function disconnectGoogle(): Promise<void> {
  const a = await stored();
  access = null;
  await setSecret(SECRET, '');
  if (a) {
    try {
      await fetchWithTimeout(`${REVOKE_URL}?token=${encodeURIComponent(a.refreshToken)}`, { method: 'POST' }, 10000);
    } catch {
      // offline: the token is gone from this phone anyway
    }
  }
}

/** Forget the cached access token (tests, and after a 401). */
export function forgetGoogleAccessToken(): void {
  access = null;
}

async function accessToken(): Promise<string> {
  if (access && access.expires > Date.now()) return access.token;
  const a = await stored();
  if (!a) throw new GoogleNotConnectedError();
  try {
    remember(await postForm<TokenResponse>(TOKEN_URL, { client_id: requireClientId(), refresh_token: a.refreshToken, grant_type: 'refresh_token' }));
  } catch (e) {
    if ((e as { code?: string }).code === 'invalid_grant') {
      // revoked from the Google account page, or expired: the stored token is useless now
      await setSecret(SECRET, '');
      throw new GoogleNotConnectedError('Google access has expired or was removed. Connect your Google account again.');
    }
    throw e;
  }
  return access!.token;
}

/** An authorised Drive request. Retries once with a fresh token after a 401. */
async function drive(url: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const token = await accessToken();
  const res = await fetchWithTimeout(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } });
  if (res.status === 401 && retry) {
    access = null;
    return drive(url, init, false);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(errorMessage(body) ?? `Google Drive HTTP ${res.status}`);
  }
  return res;
}

async function driveJson<T>(url: string, init?: RequestInit): Promise<T> {
  return (await (await drive(url, init)).json()) as T;
}

const quote = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

async function listFiles(q: string, orderBy?: string, pageSize = 100): Promise<DriveFile[]> {
  const params = [
    `q=${encodeURIComponent(q)}`,
    'spaces=drive',
    `fields=${encodeURIComponent('files(id,name,createdTime,modifiedTime,size)')}`,
    `pageSize=${pageSize}`,
    ...(orderBy ? [`orderBy=${encodeURIComponent(orderBy)}`] : []),
  ];
  const r = await driveJson<{ files?: DriveFile[] }>(`${API}/files?${params.join('&')}`);
  return r.files ?? [];
}

/** The GuardBox folder, created on first use. Looked up each time, so a folder the user deleted is simply made again. */
export async function ensureFolder(): Promise<string> {
  const found = await listFiles(`name = ${quote(FOLDER_NAME)} and mimeType = ${quote(FOLDER_MIME)} and trashed = false`, undefined, 1);
  if (found[0]) return found[0].id;
  const made = await driveJson<DriveFile>(`${API}/files?fields=id`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: FOLDER_MIME }),
  });
  return made.id;
}

function multipart(meta: object, content: string): { body: string; contentType: string } {
  const boundary = `guardbox-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(meta),
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    content,
    `--${boundary}--`,
    '',
  ].join('\r\n');
  return { body, contentType: `multipart/related; boundary=${boundary}` };
}

const FILE_FIELDS = encodeURIComponent('id,name,createdTime,modifiedTime,size');

/** Upload a new file into the GuardBox folder. */
export async function createFile(name: string, content: string, kind: DriveFileKind): Promise<DriveFile> {
  const folder = await ensureFolder();
  const { body, contentType } = multipart({ name, parents: [folder], mimeType: 'application/json', appProperties: { guardbox: kind } }, content);
  return driveJson<DriveFile>(`${UPLOAD}/files?uploadType=multipart&fields=${FILE_FIELDS}`, { method: 'POST', headers: { 'Content-Type': contentType }, body });
}

/** Replace the content of an existing file. */
export async function updateFile(id: string, content: string): Promise<DriveFile> {
  return driveJson<DriveFile>(`${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media&fields=${FILE_FIELDS}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: content,
  });
}

/** GuardBox files of one kind in the GuardBox folder, newest first. */
export async function listGuardBoxFiles(kind: DriveFileKind): Promise<DriveFile[]> {
  const folder = await ensureFolder();
  return listFiles(`${quote(folder)} in parents and trashed = false and appProperties has { key='guardbox' and value=${quote(kind)} }`, 'createdTime desc');
}

export async function downloadFile(id: string): Promise<string> {
  return (await drive(`${API}/files/${encodeURIComponent(id)}?alt=media`)).text();
}

export async function deleteFile(id: string): Promise<void> {
  await drive(`${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** A file name for a new backup, e.g. `GuardBox-backup-2026-11-28-1305.json` (UTC). */
export function backupFileName(now = new Date()): string {
  const iso = now.toISOString();
  return `GuardBox-backup-${iso.slice(0, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}.json`;
}
