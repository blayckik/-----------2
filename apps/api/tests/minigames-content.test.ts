import { describe, expect, it } from 'vitest';
import syllables from '../src/content/minigames/word-bomb.json';
import bluff from '../src/content/minigames/bluff-trivia.json';
import converge from '../src/content/minigames/converge.json';
import auction from '../src/content/minigames/auction.json';
import minefield from '../src/content/minigames/minefield.json';

describe('minigame seed content', () => {
  it('has enough word bomb syllables', () => {
    expect(syllables.length).toBeGreaterThanOrEqual(25);
    expect(new Set(syllables).size).toBe(syllables.length);
  });

  it('has valid bluff facts', () => {
    expect(bluff.length).toBeGreaterThanOrEqual(25);
    for (const fact of bluff) {
      expect(fact.prompt).toContain('___');
      expect(fact.answer.trim().length).toBeGreaterThan(1);
    }
  });

  it('has unique converge pairs', () => {
    expect(converge.length).toBeGreaterThanOrEqual(25);
    for (const [a, b] of converge) {
      expect(a.length).toBeGreaterThan(1);
      expect(b.length).toBeGreaterThan(1);
      expect(a.toLowerCase()).not.toBe(b.toLowerCase());
    }
  });

  it('has numeric auction answers', () => {
    expect(auction.length).toBeGreaterThanOrEqual(25);
    for (const question of auction) {
      expect(question.prompt.length).toBeGreaterThan(5);
      expect(Number.isFinite(question.answer)).toBe(true);
    }
  });

  it('has minefield categories with enough cards', () => {
    expect(minefield.length).toBeGreaterThanOrEqual(25);
    for (const category of minefield) {
      expect(category.category.length).toBeGreaterThan(2);
      expect(category.items.length).toBeGreaterThanOrEqual(16);
      expect(new Set(category.items).size).toBe(category.items.length);
    }
  });
});
