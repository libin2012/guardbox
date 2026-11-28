import type { SyncPayload } from '../backupCrypto';
import { SyncProviderId } from '../types';

export interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
  secure?: boolean;
  optional?: boolean;
}

export type ProviderConfig = Record<string, string>;

export interface SyncProvider {
  id: Exclude<SyncProviderId, 'none'>;
  label: string;
  description: string;
  fields: FieldDef[];
  /** optional: create an account with the provider's auth service */
  signUp?(cfg: ProviderConfig): Promise<void>;
  /** Store the payload as is. syncNow encrypts it first; providers never see plain data. */
  push(cfg: ProviderConfig, payload: SyncPayload): Promise<void>;
  pull(cfg: ProviderConfig): Promise<SyncPayload | null>;
}

export function required(cfg: ProviderConfig, fields: FieldDef[]): void {
  const missing = fields.filter((f) => !f.optional && !cfg[f.key]?.trim()).map((f) => f.label);
  if (missing.length) throw new Error(`Missing: ${missing.join(', ')}`);
}

export async function postJson<T>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(errorMessage(json) ?? `HTTP ${res.status}`);
  return json as T;
}

export function errorMessage(json: unknown): string | undefined {
  if (!json || typeof json !== 'object') return undefined;
  const j = json as Record<string, any>;
  return j.error?.message ?? j.error_description ?? j.msg ?? j.message ?? (typeof j.error === 'string' ? j.error : undefined);
}

/** When the payload was made: from a plain backup, or now for an encrypted one (whose time is inside). */
export function payloadTime(p: SyncPayload): string {
  return 'exportedAt' in p ? p.exportedAt : new Date().toISOString();
}

const TIMEOUT_MS = 30000;

/** fetch with a timeout, so a dead connection fails with a readable message instead of hanging. */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = TIMEOUT_MS): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (ctrl.signal.aborted) throw new Error(`${new URL(url).host} did not answer in time. Check your connection and try again.`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}
