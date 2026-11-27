import { describe, expect, it } from '@jest/globals';
import { hex, hmac, presignS3, sha256, utf8 } from '../sync/sigv4';

describe('sigv4', () => {
  it('sha256 matches known vectors', () => {
    expect(hex(sha256(utf8('')))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(hex(sha256(utf8('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('hmac matches RFC 4231 case 2', () => {
    expect(hex(hmac(utf8('Jefe'), utf8('what do ya want for nothing?')))).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });
  it('matches the AWS documentation presigned URL example', () => {
    const url = presignS3({
      method: 'GET',
      bucket: 'examplebucket',
      key: 'test.txt',
      region: 'us-east-1',
      accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
      secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
      expiresIn: 86400,
      date: new Date('2013-05-24T00:00:00Z'),
      host: 'examplebucket.s3.amazonaws.com',
    });
    expect(url).toContain('X-Amz-Signature=aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404');
  });
});
