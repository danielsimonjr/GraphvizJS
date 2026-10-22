import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * No always-true assertions.
 *
 * An assertion that cannot fail makes a test pass whatever the app does. Two shapes
 * of it appeared in the end-to-end tests: `expect(x || true).toBe(true)` is always
 * true, and `expect(count >= 0).toBe(true)` is true for every count. This test scans
 * every `*.test.ts` and `*.spec.ts` file under `test/` for these shapes and fails
 * when it finds one. It does not look for a test that guards its assertion with an
 * `if`, or for a test with no assertion at all.
 */

const TEST_ROOT = path.resolve(__dirname, '..');
const THIS_FILE = 'architecture/no-vacuous-assertions.test.ts';

/** A matcher that passes for `true`. */
const TRUE_MATCHER = String.raw`\.(?:toBe\(true\)|toEqual\(true\)|toStrictEqual\(true\)|toBeTruthy\(\))`;

/**
 * The patterns that match one assertion that cannot fail. `[^;]` lets a match span lines,
 * because the formatter wraps a long `expect(` call.
 */
const VACUOUS_PATTERNS: RegExp[] = [
  // `expect(a || true)`, `expect(true || a)` and `expect(true)`: the expression is always true.
  new RegExp(
    String.raw`\bexpect\(\s*(?:[^;]*\|\|\s*)?true(?:\s*\|\|[^;]*)?\s*\)${TRUE_MATCHER}`,
    'g'
  ),
  // `expect(count >= 0).toBe(true)`: a count is never negative.
  new RegExp(String.raw`\bexpect\([^;]*?>=\s*0\s*\)${TRUE_MATCHER}`, 'g'),
  // `expect(count).toBeGreaterThanOrEqual(0)`.
  /\bexpect\([^;]*?\)\.toBeGreaterThanOrEqual\(0\)/g,
];

/** `indexOf(...) >= 0` is a real test: the call returns -1 for a missing value. */
const SEARCH_CALL = /\b(?:indexOf|lastIndexOf|findIndex|findLastIndex|search)\(/;

/** The 1-based numbers of the lines where an assertion that cannot fail starts. */
function vacuousAssertionLines(source: string): number[] {
  const lines = new Set<number>();
  for (const pattern of VACUOUS_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      if (SEARCH_CALL.test(match[0])) continue;
      lines.add(source.slice(0, match.index).split('\n').length);
    }
  }
  return [...lines].sort((a, b) => a - b);
}

function testFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const abs = path.join(dir, entry);
    if (statSync(abs).isDirectory()) {
      out.push(...testFiles(abs));
    } else if (/\.(test|spec)\.ts$/.test(entry)) {
      out.push(abs);
    }
  }
  return out;
}

const files = testFiles(TEST_ROOT)
  .map((abs) => path.relative(TEST_ROOT, abs).split(path.sep).join('/'))
  .filter((rel) => rel !== THIS_FILE);

describe('no always-true assertions', () => {
  it('finds the shapes it looks for (control)', () => {
    const source = [
      'expect(visible || true).toBe(true);',
      'expect(svgVisible || hasError || true).toBe(true);',
      'expect(true || visible).toBe(true);',
      'expect(hasFocus >= 0).toBe(true);',
      'expect(n >= 0).toBeTruthy();',
      'expect(n).toBeGreaterThanOrEqual(0);',
      'expect(true).toBe(true);',
      'expect(',
      '  a || b || true',
      ').toBe(true);',
    ].join('\n');
    expect(vacuousAssertionLines(source)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('leaves a real assertion alone (control)', () => {
    const source = [
      'expect(count >= 1).toBe(true);',
      'expect(flag).toBe(true);',
      'expect(a || b).toBe(true);',
      "expect(value).toBe('true');",
      "expect(text.indexOf('x') >= 0).toBe(true);",
      'expect(Boolean(a)).toBe(true);',
      'expect(trueValue).toBe(true);',
      'expect(n).toBeGreaterThanOrEqual(1);',
    ].join('\n');
    expect(vacuousAssertionLines(source)).toEqual([]);
  });

  it('scans the unit tests and the end-to-end tests', () => {
    expect(files.some((rel) => rel.startsWith('core/'))).toBe(true);
    expect(files.some((rel) => rel.startsWith('e2e/'))).toBe(true);
  });

  it('finds no test file with an assertion that cannot fail', () => {
    const offenders = files.flatMap((rel) =>
      vacuousAssertionLines(readFileSync(path.join(TEST_ROOT, rel), 'utf-8')).map(
        (line) => `${rel}:${line}`
      )
    );
    expect(offenders).toEqual([]);
  });
});
