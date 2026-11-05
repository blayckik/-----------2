import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/config/env.js', () => ({
  env: {
    BOT_TOKEN: '123456:TEST-TOKEN',
    TELEGRAM_INIT_TTL_SECONDS: 86400,
    adminTelegramIds: [],
    isProduction: false,
  },
}));

import { validateInitData } from '../src/lib/telegram.js';

const BOT_TOKEN = '123456:TEST-TOKEN';

function sign(params: Record<string, string>) {
  const dataCheckString = Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
  return createHmac('sha256', secret).update(dataCheckString).digest('hex');
}

function makeInitData(overrides: Record<string, string> = {}) {
  const params: Record<string, string> = {
    auth_date: String(Math.floor(Date.now() / 1000)),
    query_id: 'AAH-test',
    user: JSON.stringify({ id: 900000001, first_name: 'Нова', username: 'nova_fun', language_code: 'ru' }),
    ...overrides,
  };
  return new URLSearchParams({ ...params, hash: sign(params) }).toString();
}

describe('Telegram initData validation', () => {
  it('accepts a correctly signed payload', () => {
    const result = validateInitData(makeInitData({ start_param: 'ref_FB000001' }));
    expect(result.user.id).toBe(900000001);
    expect(result.user.first_name).toBe('Нова');
    expect(result.startParam).toBe('ref_FB000001');
  });

  it('rejects a tampered payload', () => {
    const initData = makeInitData().replace('nova_fun', 'attacker');
    expect(() => validateInitData(initData)).toThrowError(/Подпись Telegram/);
  });

  it('rejects an expired auth_date', () => {
    const expired = String(Math.floor(Date.now() / 1000) - 90000);
    expect(() => validateInitData(makeInitData({ auth_date: expired }))).toThrowError(/устарела/);
  });

  it('rejects missing hash', () => {
    expect(() => validateInitData('user=%7B%7D')).toThrowError(/подпись/);
  });
});
