/**
 * Firebase via REST (Identity Toolkit + Firestore). No SDK needed.
 * Document: users/{uid}/guardbox/backup  { data: string, updatedAt: timestamp }
 */
import { parseBackup } from '../store';
import { errorMessage, postJson, ProviderConfig, required, SyncProvider } from './types';

const fields = [
  { key: 'apiKey', label: 'Web API key', placeholder: 'AIza…' },
  { key: 'projectId', label: 'Project ID', placeholder: 'my-project' },
  { key: 'email', label: 'Email', placeholder: 'you@example.com' },
  { key: 'password', label: 'Password', secure: true },
];

interface Session {
  idToken: string;
  localId: string;
}

async function signIn(cfg: ProviderConfig): Promise<Session> {
  required(cfg, fields);
  return postJson<Session>(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(cfg.apiKey)}`, {
    email: cfg.email.trim(),
    password: cfg.password,
    returnSecureToken: true,
  });
}

function docUrl(cfg: ProviderConfig, uid: string): string {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId.trim())}/databases/(default)/documents/users/${uid}/guardbox/backup`;
}

export const firebaseProvider: SyncProvider = {
  id: 'firebase',
  label: 'Firebase',
  description: 'Google Firebase: Email/Password auth + Cloud Firestore. Free Spark plan is enough.',
  fields,
  async signUp(cfg) {
    required(cfg, fields);
    await postJson(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(cfg.apiKey)}`, {
      email: cfg.email.trim(),
      password: cfg.password,
      returnSecureToken: true,
    });
  },
  async push(cfg, backup) {
    const s = await signIn(cfg);
    const res = await fetch(docUrl(cfg, s.localId), {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${s.idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fields: { data: { stringValue: JSON.stringify(backup) }, updatedAt: { timestampValue: backup.exportedAt } },
      }),
    });
    if (!res.ok) throw new Error(errorMessage(await res.json().catch(() => null)) ?? `Firestore HTTP ${res.status}`);
  },
  async pull(cfg) {
    const s = await signIn(cfg);
    const res = await fetch(docUrl(cfg, s.localId), { headers: { Authorization: `Bearer ${s.idToken}` } });
    if (res.status === 404) return null;
    const json = await res.json();
    if (!res.ok) throw new Error(errorMessage(json) ?? `Firestore HTTP ${res.status}`);
    const text = json?.fields?.data?.stringValue;
    return text ? parseBackup(text) : null;
  },
};
