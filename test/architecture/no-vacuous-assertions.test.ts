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
 * when it finds one.
 *
 * A third shape is a step that runs only `if (await locator.isVisible())`. When the
 * locator is not there, the step is skipped and the test still passes. A test must wait
 * for the element with `expect(locator).toBeVisible()`, so that a missing element fails.
 * The scan flags an `if` whose condition awaits `isVisible`, `isHidden`, `isEnabled`,
 * `isDisabled`, `isChecked`, `isEditable` or `count`, also inside a `&&` or `||` condition.
 * It does not flag a query that the test stores first, as in
 * `const shown = await x.isVisible(); if (shown) {`. It does not scan helper files, which
 * can query state for a purpose.
 * This test does not look for a test with no assertion at all.
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

/**
 * The patterns that match a step that a missing element skips: an `if` whose condition awaits
 * a state query of a locator, as in `if (await locator.isVisible()) {`. The query can follow
 * `!`, `(`, `&&` or `||`. `[^;{]` stops the match at the end of the condition.
 */
const CONDITIONAL_GUARD_PATTERNS: RegExp[] = [
  /\bif\s*\([^;{]*?\bawait\s+[^;{]*?\.(?:isVisible|isHidden|isEnabled|isDisabled|isChecked|isEditable|count)\(/g,
];

/** `indexOf(...) >= 0` is a real test: the call returns -1 for a missing value. */
const SEARCH_CALL = /\b(?:indexOf|lastIndexOf|findIndex|findLastIndex|search)\(/;

/** The 1-based number of the line where a match starts. */
function lineOf(source: string, index: number | undefined): number {
  return source.slice(0, index).split('\n').length;
}

/** The 1-based numbers of the lines where a vacuous assertion or a skipped step starts. */
function vacuousAssertionLines(source: string): number[] {
  const lines = new Set<number>();
  for (const pattern of VACUOUS_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      if (SEARCH_CALL.test(match[0])) continue;
      lines.add(lineOf(source, match.index));
    }
  }
  for (const pattern of CONDITIONAL_GUARD_PATTERNS) {
    for (const match of source.matchAll(pattern)) {
      lines.add(lineOf(source, match.index));
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
      'if (await zoomIn.isVisible()) {',
      "if (await page.locator('#x').isEnabled()) {",
      'if (!(await menu.isHidden())) {',
      'if (ready && (await zoomIn.isVisible())) {',
      'if (ready || await zoomIn.isVisible()) {',
      'if ((await items.count()) > 0) {',
      '} else if (await menu.isEnabled()) {',
    ].join('\n');
    expect(vacuousAssertionLines(source)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 16, 17,
    ]);
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
      'await expect(zoomIn).toBeVisible();',
      'const shown = await zoomIn.isVisible();',
      'const n = await items.count();',
      'if (await store.has(key)) {',
      'if (count > 0) {',
      'if (ready) await zoomIn.click();',
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
