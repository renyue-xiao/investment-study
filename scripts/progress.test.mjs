import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { mergeProgress, rateWord, recordQuestion, validateProgress, wordDue } from '../app/progress.js';

const bank = JSON.parse(await readFile(new URL('../dist/bank.json', import.meta.url)));
const empty = () => ({ schema: 1, questions: {}, cards: {}, marks: {} });
const date = new Date('2027-01-01T00:00:00Z');

test('every subject has distinct terms and practice, and answers are mixed', () => {
  for (const { id } of bank.topics) {
    const questions = bank.questions.filter((row) => row.topic === id);
    const terms = bank.terms.filter((row) => row.topic === id);
    assert.ok(questions.length >= 12);
    assert.ok(terms.length >= 30);
    assert.deepEqual(new Set(questions.map((row) => row.answer)), new Set([0, 1, 2]));
  }
});

test('an unanswered submission becomes a wrong answer and can be retried', () => {
  const state = empty();
  const question = bank.questions[0];
  recordQuestion(state, question, -1, date);
  assert.equal(state.questions[question.id].selected, -1);
  assert.equal(state.questions[question.id].correct, false);
  recordQuestion(state, question, question.answer, date);
  assert.equal(state.questions[question.id].attempts, 2);
  assert.equal(state.questions[question.id].correctCount, 1);
});

test('FSRS schedules review and round-trips the backup without rating a card twice', () => {
  const state = empty();
  const [{ id }, other] = bank.terms;
  rateWord(state, id, false, date);
  assert.equal(Date.parse(state.cards[id].due) - date, 10 * 60 * 1000);
  assert.equal(wordDue(state, id, date.getTime() + 10 * 60 * 1000), true);
  rateWord(state, id, true, date);
  assert.equal(state.cards[id].reps, 1);
  rateWord(state, other.id, true, date);
  assert.deepEqual(validateProgress(JSON.parse(JSON.stringify(state))), state);
});

test('merge preserves newer local records and accepts valid records for older content', () => {
  const local = empty();
  const incoming = empty();
  const question = bank.questions[0];
  recordQuestion(incoming, question, question.answer, date);
  recordQuestion(local, question, -1, new Date(date.getTime() + 10));
  incoming.marks['w27-removed-term'] = { saved: true, at: date.toISOString() };
  const merged = mergeProgress(local, validateProgress(incoming));
  assert.equal(merged.questions[question.id].selected, -1);
  assert.equal(merged.marks['w27-removed-term'].saved, true);
  assert.throws(() => validateProgress({ ...incoming, cards: { ['w27-invalid']: { reps: 1 } } }));
});
