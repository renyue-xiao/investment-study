import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const hash = (value) => createHash('sha256').update(value).digest('hex');
const source = JSON.parse(await read('content/topics.json'));
const topics = source.map(([id, name, english, weight]) => ({ id, name, english, weight }));
const topicIds = new Set(topics.map(({ id }) => id));
const seen = new Set();
const titles = new Set();
const rows = (name) => read('content/' + name + '.txt').then((data) => data
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line && !line.startsWith('#'))
  .map((line) => line.split('|').map((value) => value.trim())));
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const terms = (await rows('terms')).map(([topic, title, translation, detail, alias = '', ...extra]) => {
  const id = 'w27-' + topic + '-' + slug(title);
  assert(topicIds.has(topic) && title && translation && detail && !extra.length, 'Malformed term ' + id);
  assert(!seen.has(id) && !titles.has(title.toLowerCase()), 'Duplicate term ' + id);
  seen.add(id);
  titles.add(title.toLowerCase());
  return { id, topic, title, translation, detail, aliases: alias.split(',').map((word) => word.trim()).filter(Boolean) };
});

const questions = (await rows('questions')).map(([topic, key, concept, prompt, right, first, second, detail, ...extra]) => {
  const id = 'q27-' + topic + '-' + key;
  assert(topicIds.has(topic) && /^[a-z0-9-]+$/.test(key) && concept && prompt && detail && !extra.length, 'Malformed question ' + id);
  assert(right && first && second && new Set([right, first, second]).size === 3, 'Invalid options ' + id);
  assert(!seen.has(id) && !titles.has(prompt), 'Duplicate question ' + id);
  seen.add(id);
  titles.add(prompt);
  const original = [right, first, second];
  const order = [0, 1, 2].sort((a, b) => hash(id + a).localeCompare(hash(id + b)));
  return { id, topic, concept, prompt, choices: order.map((index) => original[index]), answer: order.indexOf(0), detail };
});

for (const { id } of topics) {
  assert(questions.some((question) => question.topic === id), 'Missing questions for ' + id);
  assert(terms.some((term) => term.topic === id), 'Missing terms for ' + id);
}
const fsrsHash = hash(await read('app/vendor/fsrs.mjs'));
assert.equal(fsrsHash, 'ad4a4b3b7e259fcbf02764454c8f9db4ea3bf5aae2f473198129ecb7728f1a19', 'FSRS upstream hash mismatch');
assert.equal(hash(await read('app/vendor/FSRS-LICENSE.txt')), '8b83a73dd2894ff553d6de6113064b3ad9dfad3f839837b61f3b183881131d01');

const target = new URL('dist/', root);
await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await cp(new URL('app/', root), target, { recursive: true });
await writeFile(new URL('bank.json', target), JSON.stringify({ year: 2027, topics, questions, terms }) + '\n');
const files = (await readdir(target, { recursive: true, withFileTypes: true }))
  .filter((entry) => entry.isFile() && !entry.name.endsWith('.txt') && entry.name !== 'sw.js')
  .map((entry) => relative(fileURLToPath(target), resolve(entry.parentPath, entry.name)).replaceAll('\\', '/'))
  .sort();
const version = createHash('sha256');
version.update(await read('app/sw.js'));
for (const file of files) version.update(file).update(await readFile(new URL(file, target)));
const manifest = await read('app/sw.js');
await writeFile(new URL('sw.js', target), manifest
  .replace('BUILD_CACHE_KEY', version.digest('hex').slice(0, 14))
  .replace('BUILD_FILES', JSON.stringify(['./', ...files.map((file) => './' + file)])));
await cp(new URL('LICENSE', root), new URL('LICENSE.txt', target));
await cp(new URL('content/LICENSE.md', root), new URL('CONTENT-LICENSE.md', target));
await writeFile(new URL('.nojekyll', target), '');
console.log(questions.length + ' questions, ' + terms.length + ' terms, ' + topics.length + ' topics');
