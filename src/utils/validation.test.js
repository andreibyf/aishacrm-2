import { describe, it, expect } from 'vitest';
import { sanitizeString } from './validation.js';

describe('[PLATFORM] sanitizeString', () => {
  it('returns empty string for falsy input', () => {
    expect(sanitizeString(null)).toBe('');
    expect(sanitizeString(undefined)).toBe('');
    expect(sanitizeString('')).toBe('');
    expect(sanitizeString(0)).toBe('');
  });

  it('returns trimmed plain text unchanged', () => {
    expect(sanitizeString('hello world')).toBe('hello world');
    expect(sanitizeString('  padded  ')).toBe('padded');
  });

  it('strips simple HTML tags', () => {
    expect(sanitizeString('<b>bold</b>')).toBe('bold');
    expect(sanitizeString('<script>alert(1)</script>')).toBe('alert(1)');
    expect(sanitizeString('<div class="x">hi</div>')).toBe('hi');
  });

  it('strips nested/interleaved tags (bypass prevention)', () => {
    // Classic bypass: inner tag removal reveals an outer tag
    expect(sanitizeString('<scr<script>ipt>alert(1)</scr</script>ipt>')).toBe('ipt>alert(1)ipt>');
    expect(sanitizeString('<im<img>g src=x onerror=alert(1)>')).toBe('g src=x onerror=alert(1)>');
  });

  it('handles deeply nested tag bypass attempts', () => {
    expect(sanitizeString('<<script>script>alert(1)<</script>/script>')).toBe(
      'script>alert(1)/script>',
    );
  });

  it('strips content that looks like tags (angle brackets with content)', () => {
    // The regex treats < ... > as a tag — this is intentional for security
    expect(sanitizeString('a < b and c > d')).toBe('a  d');
    // Standalone < without closing > is preserved
    expect(sanitizeString('3 < 5')).toBe('3 < 5');
  });

  it('strips multiple different tags', () => {
    expect(sanitizeString('<p>Hello</p><script>alert(1)</script><b>world</b>')).toBe(
      'Helloalert(1)world',
    );
  });
});
