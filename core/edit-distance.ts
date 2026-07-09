/** Bounded string-similarity helpers for typo "did-you-mean" suggestions
 * (e.g. an unknown DOT attribute name vs. the known attribute catalog). */

/** Standard iterative Levenshtein edit distance between `a` and `b`
 * (single-character insertions, deletions, and substitutions). */
export function editDistance(a: string, b: string): number {
  const aLen = a.length;
  const bLen = b.length;
  if (aLen === 0) return bLen;
  if (bLen === 0) return aLen;

  let prevRow = Array.from({ length: bLen + 1 }, (_, j) => j);
  let currRow = new Array<number>(bLen + 1);

  for (let i = 1; i <= aLen; i++) {
    currRow[0] = i;
    for (let j = 1; j <= bLen; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      currRow[j] = Math.min(
        prevRow[j] + 1, // deletion
        currRow[j - 1] + 1, // insertion
        prevRow[j - 1] + cost // substitution
      );
    }
    [prevRow, currRow] = [currRow, prevRow];
  }

  return prevRow[bLen];
}

/** Returns the unique candidate in `candidates` closest to `word` by edit
 * distance, provided that distance is within `maxDistance`. Returns
 * `undefined` when no candidate is within range, or when two or more
 * candidates tie for the minimum distance (an ambiguous suggestion). */
export function nearest(
  word: string,
  candidates: readonly string[],
  maxDistance = 2
): string | undefined {
  let best: string | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  let tied = false;

  for (const candidate of candidates) {
    const distance = editDistance(word, candidate);
    if (distance > maxDistance) continue;
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
      tied = false;
    } else if (distance === bestDistance) {
      tied = true;
    }
  }

  return tied ? undefined : best;
}
