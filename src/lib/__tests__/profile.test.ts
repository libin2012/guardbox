import { describe, expect, it } from '@jest/globals';
import { emailError, initials, isCompleteProfile, mobileError, nameError, toProfile, validateProfile } from '../profile';

describe('profile validation', () => {
  it('requires a full name', () => {
    expect(nameError('')).toBeTruthy();
    expect(nameError('   ')).toBeTruthy();
    expect(nameError('1')).toBeTruthy();
    expect(nameError('Libin George')).toBeUndefined();
    expect(nameError('李明')).toBeUndefined();
  });

  it('requires a valid email', () => {
    expect(emailError('')).toBeTruthy();
    for (const bad of ['a', 'a@', '@b.com', 'a@b', 'a@b.c', 'a b@c.com', 'a@b..com', 'a@@b.com']) expect(emailError(bad)).toBeTruthy();
    for (const ok of ['a@b.co', 'first.last+tag@mail.example.org', ' Me@Example.COM ']) expect(emailError(ok)).toBeUndefined();
  });

  it('treats mobile as optional but checks it when given', () => {
    expect(mobileError(undefined)).toBeUndefined();
    expect(mobileError('  ')).toBeUndefined();
    expect(mobileError('+91 98765 43210')).toBeUndefined();
    expect(mobileError('(555) 123-4567')).toBeUndefined();
    expect(mobileError('12345')).toBeTruthy();
    expect(mobileError('call me')).toBeTruthy();
    expect(mobileError('91+9876543210')).toBeTruthy();
  });

  it('normalises what it stores', () => {
    const p = toProfile({ fullName: '  Libin   George ', email: ' Libin@Example.com', mobile: ' +91  98765 43210 ' }, new Date('2026-01-01T00:00:00Z'));
    expect(p).toEqual({ fullName: 'Libin George', email: 'libin@example.com', mobile: '+91 98765 43210', updatedAt: '2026-01-01T00:00:00.000Z' });
    expect(toProfile({ fullName: 'A B', email: 'a@b.co', mobile: '' })).not.toHaveProperty('mobile');
    expect(toProfile({ fullName: '', email: 'a@b.co' })).toBeNull();
    expect(Object.keys(validateProfile({ fullName: '', email: 'x', mobile: '1' })).sort()).toEqual(['email', 'fullName', 'mobile']);
  });

  it('spots incomplete stored profiles', () => {
    expect(isCompleteProfile(undefined)).toBe(false);
    expect(isCompleteProfile({ fullName: 'A B', email: '', updatedAt: '' })).toBe(false);
    expect(isCompleteProfile({ fullName: 'A B', email: 'a@b.co', updatedAt: '' })).toBe(true);
  });

  it('makes initials', () => {
    expect(initials('libin george')).toBe('LG');
    expect(initials('Cher')).toBe('C');
    expect(initials('Anna Maria Lopez')).toBe('AL');
    expect(initials('')).toBe('');
  });
});
