import * as Crypto from 'expo-crypto';

export function newId(prefix = 'h'): string {
  return `${prefix}-${Crypto.randomUUID()}`;
}
