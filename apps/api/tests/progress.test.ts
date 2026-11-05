import { describe, expect, it } from 'vitest';
import { levelFromXp, periodKey, dateKey, yesterdayKey, xpForLevel, levelProgress } from '../src/services/progress.js';
import { canBuildWord } from '../src/data/words.js';

describe('progression math', () => {
  it('calculates levels from XP consistently', () => {
    expect(levelFromXp(0)).toBe(1);
    expect(levelFromXp(49)).toBe(1);
    expect(levelFromXp(50)).toBe(2);
    expect(levelFromXp(450)).toBe(4);
    expect(levelFromXp(5450)).toBe(11);
    expect(xpForLevel(11)).toBe(5000);
  });

  it('returns bounded progress data', () => {
    const progress = levelProgress(5450);
    expect(progress.level).toBe(11);
    expect(progress.current).toBe(450);
    expect(progress.needed).toBe(1050);
    expect(progress.percent).toBeGreaterThan(0);
    expect(progress.percent).toBeLessThanOrEqual(100);
  });

  it('builds deterministic quest period keys', () => {
    const date = new Date('2026-05-11T12:00:00.000Z');
    expect(dateKey(date)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(periodKey('DAILY', date)).toBe(`daily:${dateKey(date)}`);
    expect(periodKey('WEEKLY', date)).toMatch(/^weekly:\d{4}-W\d{2}$/);
    expect(periodKey('ONBOARDING', date)).toBe('once');
    expect(periodKey('SPECIAL', date)).toBe('global');
    expect(yesterdayKey(new Date('2026-05-12T12:00:00.000Z'))).toBe(dateKey(date));
  });
});

describe('word duel dictionary rules', () => {
  it('uses letters with frequency constraints', () => {
    expect(canBuildWord('кот', ['к', 'о', 'т', 'а'])).toBe(true);
    expect(canBuildWord('молоко', ['м', 'о', 'л', 'о', 'к', 'о'])).toBe(true);
    expect(canBuildWord('молоко', ['м', 'о', 'л', 'к'])).toBe(false);
    expect(canBuildWord('дом', ['д', 'о', 'м'])).toBe(true);
  });
});
