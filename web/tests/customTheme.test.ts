import { describe, expect, it } from 'vitest';
import { isDarkBackground, normalizeHex } from '@/Function/settings/customTheme';

describe('normalizeHex', () => {
  it('accepts six or three digits, with or without #, in either case', () => {
    expect(normalizeHex('3D5FAE')).toBe('#3d5fae');
    expect(normalizeHex(' #9D0E22 ')).toBe('#9d0e22');
    expect(normalizeHex('#3df')).toBe('#33ddff');
  });
  it('refuses what is not a colour', () => {
    expect(normalizeHex('')).toBeNull();
    expect(normalizeHex('#12345')).toBeNull();
    expect(normalizeHex('blue')).toBeNull();
  });
});

describe('isDarkBackground', () => {
  it('reads near-black and saturated deep colours as dark', () => {
    expect(isDarkBackground('#101011')).toBe(true);
    expect(isDarkBackground('#9d0e22')).toBe(true);
  });
  it('reads white and pale tints as light', () => {
    expect(isDarkBackground('#ffffff')).toBe(false);
    expect(isDarkBackground('#ececee')).toBe(false);
  });
});
