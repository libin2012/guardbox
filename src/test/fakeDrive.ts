/**
 * A tiny in-memory Google (OAuth token endpoint + Drive v3) for tests. Install
 * with `fakeGoogle()`; it replaces global fetch through `mockFetch`.
 */
import { mockFetch } from './helpers';

export const CLIENT_ID = '123-abc.apps.googleusercontent.com';

export interface FakeFile {
  id: string;
  name: string;
  mimeType: string;
  parents: string[];
  appProperties?: Record<string, string>;
  content: string;
  createdTime: string;
  trashed?: boolean;
}

function res(status: number, body?: unknown): Partial<Response> {
  const text = body === undefined ? '' : typeof body === 'string' ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text, json: async () => JSON.parse(text) };
}

function form(body: unknown): Record<string, string> {
  return Object.fromEntries(String(body).split('&').map((kv) => kv.split('=').map(decodeURIComponent) as [string, string]));
}

/** Split a multipart/related body into its JSON metadata and its content. */
function parseMultipart(body: string, contentType: string): { meta: Partial<FakeFile>; content: string } {
  const boundary = /boundary=(.+)$/.exec(contentType)![1];
  const parts = body.split(`--${boundary}`).slice(1, -1).map((p) => p.split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, ''));
  return { meta: JSON.parse(parts[0]), content: parts[1] };
}

export function fakeGoogle(opts: { email?: string } = {}) {
  const files = new Map<string, FakeFile>();
  const tokens = { refresh: 'refresh-1', access: 'access-1', revoked: [] as string[], refreshCalls: 0, rejectRefresh: false, expireNext: false };
  let seq = 0;
  let clock = Date.parse('2026-11-28T10:00:00.000Z');
  const add = (f: Omit<FakeFile, 'id' | 'createdTime'>) => {
    seq += 1;
    clock += 60000;
    const file = { ...f, id: `file-${seq}`, createdTime: new Date(clock).toISOString() };
    files.set(file.id, file);
    return file;
  };
  const view = (f: FakeFile) => ({ id: f.id, name: f.name, createdTime: f.createdTime, modifiedTime: f.createdTime, size: String(f.content.length) });

  const fetchMock = mockFetch((url, init) => {
    const method = init?.method ?? 'GET';
    const u = new URL(url);
    if (u.host === 'oauth2.googleapis.com' && u.pathname === '/token') {
      const f = form(init?.body);
      if (f.grant_type === 'authorization_code') {
        if (f.code !== 'auth-code' || !f.code_verifier) return res(400, { error: 'invalid_grant', error_description: 'Bad code' });
        return res(200, { access_token: tokens.access, expires_in: 3600, refresh_token: tokens.refresh });
      }
      tokens.refreshCalls += 1;
      if (tokens.rejectRefresh || f.refresh_token !== tokens.refresh) return res(400, { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' });
      tokens.access = `access-${tokens.refreshCalls + 1}`;
      return res(200, { access_token: tokens.access, expires_in: 3600 });
    }
    if (u.host === 'oauth2.googleapis.com' && u.pathname === '/revoke') {
      tokens.revoked.push(u.searchParams.get('token')!);
      return res(200, {});
    }
    if (u.host !== 'www.googleapis.com') throw new Error(`Unexpected network call in test: ${url}`);
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    if (tokens.expireNext) {
      tokens.expireNext = false;
      return res(401, { error: { code: 401, message: 'Invalid Credentials' } });
    }
    if (auth !== `Bearer ${tokens.access}`) return res(401, { error: { code: 401, message: 'Invalid Credentials' } });

    const path = u.pathname;
    if (path === '/drive/v3/about') return res(200, { user: { emailAddress: opts.email ?? 'asha@gmail.com', displayName: 'Asha Rao' } });
    if (path === '/drive/v3/files' && method === 'GET') {
      const q = u.searchParams.get('q')!;
      let list = [...files.values()].filter((f) => !f.trashed);
      if (q.includes("mimeType = 'application/vnd.google-apps.folder'")) list = list.filter((f) => f.mimeType === 'application/vnd.google-apps.folder' && q.includes(`name = '${f.name}'`));
      else {
        const parent = /'([^']+)' in parents/.exec(q)![1];
        const kind = /value='([^']+)'/.exec(q)![1];
        list = list.filter((f) => f.parents.includes(parent) && f.appProperties?.guardbox === kind);
        list.sort((a, b) => b.createdTime.localeCompare(a.createdTime));
      }
      return res(200, { files: list.map(view) });
    }
    if (path === '/drive/v3/files' && method === 'POST') {
      const meta = JSON.parse(String(init?.body));
      return res(200, view(add({ ...meta, parents: [], content: '' })));
    }
    if (path === '/upload/drive/v3/files' && method === 'POST') {
      const { meta, content } = parseMultipart(String(init?.body), (init?.headers as Record<string, string>)['Content-Type']);
      if (!meta.parents?.every((p) => files.has(p))) return res(404, { error: { code: 404, message: 'File not found: parent.' } });
      return res(200, view(add({ name: meta.name!, mimeType: meta.mimeType!, parents: meta.parents, appProperties: meta.appProperties, content })));
    }
    const m = /^\/(upload\/)?drive\/v3\/files\/([^/]+)$/.exec(path);
    const file = m ? files.get(decodeURIComponent(m[2])) : undefined;
    if (!file) return res(404, { error: { code: 404, message: 'File not found.' } });
    if (method === 'PATCH') {
      file.content = String(init?.body);
      return res(200, view(file));
    }
    if (method === 'DELETE') {
      files.delete(file.id);
      return res(204);
    }
    if (u.searchParams.get('alt') === 'media') return res(200, file.content);
    return res(200, view(file));
  });

  return { files, tokens, fetch: fetchMock, folder: () => [...files.values()].find((f) => f.mimeType === 'application/vnd.google-apps.folder') };
}

/** Makes `new AuthSession.AuthRequest(...).promptAsync()` resolve with this result. */
export function mockAuthResult(result: unknown) {
  const AuthSession = jest.requireMock<{ __setResult: (r: unknown) => void }>('expo-auth-session');
  AuthSession.__setResult(result);
}

/** jest.mock factory for expo-auth-session: a fake AuthRequest whose prompt result tests choose. */
export function authSessionMock() {
  let result: unknown = { type: 'success', params: { code: 'auth-code' } };
  const requests: unknown[] = [];
  class AuthRequest {
    codeVerifier = 'verifier-123';
    constructor(public config: unknown) {
      requests.push(config);
    }
    async promptAsync() {
      return result;
    }
  }
  return {
    AuthRequest,
    ResponseType: { Code: 'code' },
    Prompt: { Consent: 'consent' },
    __setResult: (r: unknown) => void (result = r),
    __requests: requests,
  };
}
