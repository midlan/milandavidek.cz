import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getBestLang } from '../lang-redirect.js';

const cases = [
  // [description, Accept-Language header, expected result]

  // Simple cases
  ['English only',                    'en',                           'en'],
  ['Czech only',                      'cs',                           'cs'],
  ['Czech with region',               'cs-CZ',                        'cs'],
  ['English with region',             'en-US',                        'en'],

  // Quality values — concern #1: non-English primary, English secondary
  ['English preferred over Czech',    'en,cs;q=0.9',                  'en'],
  ['Czech preferred over English',    'cs,en;q=0.9',                  'cs'],
  ['Russian primary, English secondary (ru,en;q=0.9)',
                                      'ru,en;q=0.9',                  'en'],
  ['Russian primary, Czech secondary','ru,cs;q=0.9',                  'cs'],
  ['Russian only — no match',         'ru',                           null],
  ['German primary, Czech secondary', 'de,cs;q=0.8,en;q=0.7',        'cs'],
  ['French, English highest q',       'fr;q=0.5,en;q=0.9,de;q=0.7',  'en'],
  ['Czech higher q than English',     'en;q=0.3,cs;q=0.9',           'cs'],
  ['Multiple unknown, English last',  'zh,ja,ko,en;q=0.1',           'en'],
  ['Multiple unknown, no match',      'zh,ja,ko',                     null],

  // Edge cases
  ['Empty header',                    '',                             null],
  ['Wildcard',                        '*',                            null],
  ['Whitespace around tags',          ' en , cs;q=0.5 ',             'en'],
];

for (const [desc, input, expected] of cases) {
  test(desc, () => {
    assert.equal(getBestLang(input), expected);
  });
}
