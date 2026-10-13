import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { checkMarkdown } from './check-docs.mjs';

test('resolves relative inline, image and reference targets including encoded spaces', () => {
  const targets = new Set(['docs/read me.md', 'docs/image.png', 'README.md'].map(p => resolve(p)));
  assert.deepEqual(checkMarkdown('docs/index.md', '[a](<read me.md>) ![b](image.png)\n[c](read%20me.md#title)\n[ref]: ../README.md', p => targets.has(p)), []);
  assert.equal(checkMarkdown('docs/index.md', '[bad](missing.md)', () => false).length, 1);
});
test('ignores remote targets, anchors and fenced examples while checking conflict markers', () => {
  assert.deepEqual(checkMarkdown('README.md', '[a](https://example.invalid) [b](#heading)\n```md\n[x](absent.md)\n```\n~~~\n[y](absent.md)\n~~~', () => false), []);
  assert.equal(checkMarkdown('README.md', '<<<<<<< HEAD\n=======\n>>>>>>> other').length, 3);
});
test('reports malformed percent encoding and broken reference links', () => {
  assert.equal(checkMarkdown('README.md', '[a](bad%zz.md)\n[ref]: absent.md', () => false).length, 2);
});
