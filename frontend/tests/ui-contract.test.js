import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const app = readFileSync(new URL('../src/App.jsx', import.meta.url), 'utf8');
const css = [
  readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8'),
  readFileSync(new URL('../src/theme.css', import.meta.url), 'utf8'),
].join('\n');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');

test('keeps all three analysis workspaces and accessible active navigation', () => {
  assert.match(app, /Daily Analysis/);
  assert.match(app, /January Overview/);
  assert.match(app, /Cutoff Comparison/);
  assert.match(app, /aria-label="Analysis views"/);
  assert.match(app, /aria-current=\{viewMode === 'daily' \? 'page' : undefined\}/);
  assert.match(app, /aria-current=\{viewMode === 'monthly' \? 'page' : undefined\}/);
  assert.match(app, /aria-current=\{viewMode === 'comparison' \? 'page' : undefined\}/);
});

test('preserves data controls, report exports, print and source provenance', () => {
  for (const required of [
    'Refresh data',
    'Daily summary CSV',
    'exportCsv',
    'exportMonthlyCsv',
    'exportComparisonCsv',
    'Print report',
    'FUELHH',
    'WINDFOR',
    'Forecast published:',
    'Data provenance',
    'No substitute data is displayed.',
  ]) assert.ok(app.includes(required), `Expected interface contract: ${required}`);
});

test('keeps scope and timezone explicit and provides a keyboard skip link', () => {
  assert.match(app, /Skip to analysis/);
  assert.match(app, /id="main-content" tabIndex=\{-1\}/);
  assert.match(app, /01 to 31 January 2026/);
  assert.match(app, /30-minute delivery intervals/);
  assert.match(app, /Europe\/London/);
});

test('retains narrow-screen layouts, visible focus and reduced-motion handling', () => {
  assert.match(css, /@media \(max-width: 780px\)/);
  assert.match(css, /@media \(max-width: 440px\)/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /\.table-scroll\s*\{\s*overflow:\s*auto/);
});

test('keeps the deliberate non-template design without external decorative assets', () => {
  assert.match(css, /\.editorial-intro/);
  assert.match(css, /#123649/);
  assert.match(css, /#91ddcf/);
  assert.doesNotMatch(`${app}\n${css}\n${html}`, /linear-gradient|radial-gradient|Made with AI|\u2014|cursor:\s*(url|none)|fonts\.googleapis|<img\b|background-image:\s*url\(\s*https?:/i);
  assert.match(html, /name="description"/);
  assert.match(html, /rel="icon"/);
  assert.match(main, /import '\.\/styles\.css';\s*import '\.\/theme\.css';/);
});

