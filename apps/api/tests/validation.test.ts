import { describe, expect, it } from 'vitest';

import {
  imageUrlSchema,
  isAllowedImageUrl,
  queryBooleanSchema,
} from '../src/lib/validation.js';

describe('image URL policy', () => {
  it('accepts local assets and HTTPS URLs', () => {
    expect(isAllowedImageUrl('/uploads/photo.jpg')).toBe(true);
    expect(isAllowedImageUrl('/images/guess/pizza.jpg')).toBe(true);
    expect(isAllowedImageUrl('/avatars/nova_fun.svg')).toBe(true);
    expect(isAllowedImageUrl('https://cdn.example.com/photo.webp')).toBe(true);
  });

  it('rejects unsafe or unsupported schemes', () => {
    for (const value of [
      'javascript:alert(1)',
      'data:image/svg+xml;base64,PHN2Zz4=',
      'file:///etc/passwd',
      'http://insecure.example.com/a.jpg',
      '/etc/passwd.png',
      'relative-image.jpg',
      '',
    ]) {
      expect(isAllowedImageUrl(value), value).toBe(false);
    }
  });

  it('validates imageUrlSchema', () => {
    expect(imageUrlSchema.parse('/uploads/a.png')).toBe('/uploads/a.png');
    expect(() => imageUrlSchema.parse('javascript:alert(1)')).toThrow();
    expect(imageUrlSchema.safeParse('http://example.com/a.jpg').success).toBe(false);
  });
});

describe('query boolean parsing', () => {
  it('does not treat "false" as true', () => {
    expect(queryBooleanSchema.parse('false')).toBe(false);
    expect(queryBooleanSchema.parse('true')).toBe(true);
    expect(queryBooleanSchema.parse('0')).toBe(false);
    expect(queryBooleanSchema.parse('1')).toBe(true);
    expect(queryBooleanSchema.parse(undefined)).toBe(false);
    expect(queryBooleanSchema.parse(true)).toBe(true);
  });
});
