/**
 * Supabase via REST (GoTrue auth + PostgREST). No SDK needed.
 * Table: public.guardbox_backups (user_id uuid pk, data jsonb, updated_at timestamptz) with RLS.
 */
import type { SyncPayload } from '../backupCrypto';
import { errorMessage, payloadTime, postJson, ProviderConfig, required, SyncProvider } from './types';

const fields = [
  { key: 'url', label: 'Project URL', placeholder: 'https://xyz.supabase.co' },
  { key: 'anonKey', label: 'Anon / publishable key', placeholder: 'eyJ… or sb_publishable_…' },
  { key: 'email', label: 'Email', placeholder: 'you@example.com' },
  { key: 'password', label: 'Password', secure: true },
];

const base = (cfg: ProviderConfig) => cfg.url.trim().replace(/\/+$/, '');

async function signIn(cfg: ProviderConfig): Promise<{ access_token: string; user: { id: string } }> {
  required(cfg, fields);
  return postJson(`${base(cfg)}/auth/v1/token?grant_type=password`, { email: cfg.email.trim(), password: cfg.password }, { apikey: cfg.anonKey });
}

export const supabaseProvider: SyncProvider = {
  id: 'supabase',
  label: 'Supabase',
  description: 'Supabase Auth + Postgres with row-level security. Free tier is enough.',
  fields,
  async signUp(cfg) {
    required(cfg, fields);
    await postJson(`${base(cfg)}/auth/v1/signup`, { email: cfg.email.trim(), password: cfg.password }, { apikey: cfg.anonKey });
  },
  async push(cfg, payload) {
    const s = await signIn(cfg);
    const res = await fetch(`${base(cfg)}/rest/v1/guardbox_backups?on_conflict=user_id`, {
      method: 'POST',
      headers: {
        apikey: cfg.anonKey,
        Authorization: `Bearer ${s.access_token}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ user_id: s.user.id, data: payload, updated_at: payloadTime(payload) }),
    });
    if (!res.ok) throw new Error(errorMessage(await res.json().catch(() => null)) ?? `Supabase HTTP ${res.status}`);
  },
  async pull(cfg) {
    const s = await signIn(cfg);
    const res = await fetch(`${base(cfg)}/rest/v1/guardbox_backups?select=data&user_id=eq.${s.user.id}`, {
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${s.access_token}` },
    });
    const json = await res.json();
    if (!res.ok) throw new Error(errorMessage(json) ?? `Supabase HTTP ${res.status}`);
    const row = Array.isArray(json) ? json[0] : null;
    return row ? (row.data as SyncPayload) : null;
  },
};
