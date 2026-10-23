import test from 'node:test';
import assert from 'node:assert/strict';
import { serializeCsv } from '../src/services/csv.js';

test('CSV serialization quotes commas, quotes, and embedded newlines', () => {
  const csv = serializeCsv(['name', 'note'], [['Wind, UK', 'said "ready"\nnext line']]);
  assert.equal(csv, '\uFEFF"name","note"\r\n"Wind, UK","said ""ready""\nnext line"');
});

test('CSV serialization preserves missing values as empty fields', () => {
  const csv = serializeCsv(['forecast_mw', 'actual_mw'], [[null, undefined]]);
  assert.equal(csv, '\uFEFF"forecast_mw","actual_mw"\r\n"",""');
});

test('CSV serialization prefixes formula-like untrusted text', () => {
  const csv = serializeCsv(['status', 'generation_mw'], [['=HYPERLINK("bad")', -21.5]]);
  assert.equal(csv, '\uFEFF"status","generation_mw"\r\n"\'=HYPERLINK(""bad"")","-21.5"');
});
