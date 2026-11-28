import { Profile } from './types';

export type ProfileInput = Pick<Profile, 'fullName' | 'email' | 'mobile'>;
export type ProfileErrors = Partial<Record<keyof ProfileInput, string>>;

/** Trim and collapse inner whitespace. */
export function cleanName(name: string): string {
  return name.trim().replace(/\s+/g, ' ');
}

export function cleanEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function nameError(name: string): string | undefined {
  const n = cleanName(name);
  if (!n) return 'Enter your full name';
  if (n.length < 2 || !/\p{L}/u.test(n)) return 'Enter a valid name';
  if (n.length > 80) return 'Name is too long';
  return undefined;
}

// Practical check: something@domain.tld, no spaces, no double dots.
const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;

export function emailError(email: string): string | undefined {
  const e = cleanEmail(email);
  if (!e) return 'Enter your email address';
  if (e.length > 254 || !EMAIL.test(e) || e.includes('..')) return 'Enter a valid email address';
  return undefined;
}

/** Mobile is optional; when given it must look like a phone number (7-15 digits). */
export function mobileError(mobile: string | undefined): string | undefined {
  const m = (mobile ?? '').trim();
  if (!m) return undefined;
  if (!/^\+?[\d\s\-().]+$/.test(m)) return 'Use digits, spaces and an optional leading +';
  const digits = m.replace(/\D/g, '').length;
  if (digits < 7 || digits > 15) return 'Enter a valid mobile number';
  return undefined;
}

export function validateProfile(p: ProfileInput): ProfileErrors {
  const errors: ProfileErrors = {};
  const n = nameError(p.fullName);
  const e = emailError(p.email);
  const m = mobileError(p.mobile);
  if (n) errors.fullName = n;
  if (e) errors.email = e;
  if (m) errors.mobile = m;
  return errors;
}

/** Normalised copy ready to store, or null when a required field is invalid. */
export function toProfile(p: ProfileInput, now = new Date()): Profile | null {
  if (Object.keys(validateProfile(p)).length) return null;
  const mobile = (p.mobile ?? '').trim().replace(/\s+/g, ' ');
  return { fullName: cleanName(p.fullName), email: cleanEmail(p.email), ...(mobile ? { mobile } : {}), updatedAt: now.toISOString() };
}

/** True when a stored profile has both required fields (guards old or hand-edited data). */
export function isCompleteProfile(p: Profile | undefined | null): p is Profile {
  return !!p && !nameError(p.fullName ?? '') && !emailError(p.email ?? '');
}

/** Up to two initials for the avatar. */
export function initials(name: string | undefined): string {
  const parts = cleanName(name ?? '').split(' ').filter(Boolean);
  if (!parts.length) return '';
  const first = [...parts[0]][0] ?? '';
  const last = parts.length > 1 ? [...parts[parts.length - 1]][0] ?? '' : '';
  return (first + last).toUpperCase();
}
