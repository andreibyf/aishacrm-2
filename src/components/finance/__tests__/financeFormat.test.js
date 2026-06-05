import { describe, it, expect } from 'vitest';
import { formatCentsAmount } from '../financeFormat';

describe('formatCentsAmount', () => {
  it('places the decimal two digits from the right and groups thousands', () => {
    expect(formatCentsAmount(250000)).toBe('2,500.00'); // the $2,500 deal from the UI
    expect(formatCentsAmount(100000)).toBe('1,000.00');
    expect(formatCentsAmount(500000)).toBe('5,000.00');
  });

  it('keeps sub-dollar and odd-cent amounts exact', () => {
    expect(formatCentsAmount(5)).toBe('0.05');
    expect(formatCentsAmount(99)).toBe('0.99');
    expect(formatCentsAmount(627550)).toBe('6,275.50');
    expect(formatCentsAmount(0)).toBe('0.00');
  });

  it('handles negatives (e.g. credit-side / reversals)', () => {
    expect(formatCentsAmount(-250000)).toBe('-2,500.00');
  });

  it('accepts a numeric string (some read APIs serialize cents as strings)', () => {
    expect(formatCentsAmount('250000')).toBe('2,500.00');
  });

  it('returns null for missing / non-finite input so the table renders the — glyph', () => {
    expect(formatCentsAmount(null)).toBeNull();
    expect(formatCentsAmount(undefined)).toBeNull();
    expect(formatCentsAmount('')).toBeNull();
    expect(formatCentsAmount('abc')).toBeNull();
    expect(formatCentsAmount(NaN)).toBeNull();
  });
});
