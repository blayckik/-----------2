import rawWords from 'russian-words';

/**
 * 106k Russian words from the russian-words package. Normalised to lowercase,
 * ё → е, only Cyrillic 3–9 letters. Used for server-side validation of Word Duel.
 */
export const DICTIONARY: Set<string> = new Set(
  (rawWords as unknown as string[])
    .map((word) => word.toLowerCase().replace(/ё/g, 'е').trim())
    .filter((word) => /^[а-я]{3,9}$/.test(word)),
);

export const DICTIONARY_WORDS: string[] = [...DICTIONARY];

export function canBuildWord(word: string, letters: string[]): boolean {
  const pool = [...letters];
  for (const letter of word) {
    const index = pool.indexOf(letter);
    if (index === -1) return false;
    pool.splice(index, 1);
  }
  return true;
}
