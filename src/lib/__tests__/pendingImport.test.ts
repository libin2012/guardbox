import { redirectSystemPath } from '../../app/+native-intent';
import { isIncomingFile, usePendingImport } from '../pendingImport';

beforeEach(() => usePendingImport.getState().clear());

describe('isIncomingFile', () => {
  it('matches file, content and .gbox paths', () => {
    expect(isIncomingFile('file:///var/mobile/backup.gbox')).toBe(true);
    expect(isIncomingFile('content://com.android.providers/123')).toBe(true);
    expect(isIncomingFile('https://example.com/x.gbox')).toBe(true);
    expect(isIncomingFile('https://example.com/x.gbox?token=1')).toBe(true);
  });

  it('ignores normal in-app links', () => {
    expect(isIncomingFile('guardbox://home')).toBe(false);
    expect(isIncomingFile('/holding/123')).toBe(false);
    expect(isIncomingFile('https://example.com/page')).toBe(false);
  });
});

describe('pending import store', () => {
  it('holds a uri and hands it out exactly once', () => {
    usePendingImport.getState().request('file:///a.gbox');
    expect(usePendingImport.getState().uri).toBe('file:///a.gbox');
    expect(usePendingImport.getState().take()).toBe('file:///a.gbox');
    expect(usePendingImport.getState().uri).toBeNull();
    expect(usePendingImport.getState().take()).toBeNull();
  });
});

describe('redirectSystemPath', () => {
  it('stashes an opened file and routes the app home', () => {
    expect(redirectSystemPath({ path: 'file:///a.gbox', initial: true })).toBe('/');
    expect(usePendingImport.getState().uri).toBe('file:///a.gbox');
  });

  it('passes a normal deep link through untouched', () => {
    expect(redirectSystemPath({ path: '/holding/1', initial: false })).toBe('/holding/1');
    expect(usePendingImport.getState().uri).toBeNull();
  });
});
