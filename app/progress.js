import { createEmptyCard, fsrs, Rating } from './vendor/fsrs.mjs';

const schedule = fsrs({
  request_retention: 0.9,
  maximum_interval: 365,
  enable_fuzz: false,
  learning_steps: ['10m'],
  relearning_steps: ['10m'],
});
const idPattern = /^[qw]27-[a-z0-9-]{2,100}$/;
const validDate = (value) => typeof value === 'string' && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value));
const count = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000;
const fields = ['stability', 'difficulty', 'elapsed_days', 'scheduled_days', 'learning_steps', 'reps', 'lapses', 'state'];
const emptyProgress = () => ({ schema: 1, questions: {}, cards: {}, marks: {} });

function asObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw Error('备份格式有误');
  return value;
}

function parseTable(table, prefix, parseRow) {
  const rows = Object.entries(asObject(table));
  if (rows.length > 10_000) throw Error('备份记录过多');
  return Object.fromEntries(rows.map(([id, row]) => {
    if (!idPattern.test(id) || !id.startsWith(prefix)) throw Error('备份条目标识有误');
    return [id, parseRow(asObject(row))];
  }));
}

export function validateProgress(input) {
  const { schema, questions, cards, marks } = asObject(input);
  if (schema !== 1) throw Error('备份版本不匹配');
  return {
    schema: 1,
    questions: parseTable(questions, 'q27-', ({ attempts, correctCount, selected, correct, at }) => {
      if (!count(attempts) || attempts === 0 || !count(correctCount) || correctCount > attempts ||
          ![-1, 0, 1, 2].includes(selected) || typeof correct !== 'boolean' ||
          (correct && (selected < 0 || !correctCount)) || !validDate(at)) throw Error('答题记录有误');
      return { attempts, correctCount, selected, correct, at };
    }),
    cards: parseTable(cards, 'w27-', (card) => {
      if (!validDate(card.due) || !validDate(card.last_review) ||
          !fields.every((key) => Number.isFinite(card[key]) && card[key] >= 0) ||
          !fields.slice(2).every((key) => count(card[key])) || card.state > 3 ||
          card.reps === 0 || card.lapses > card.reps || card.difficulty > 10) throw Error('词卡记录有误');
      return {
        ...Object.fromEntries(fields.map((key) => [key, card[key]])),
        due: card.due,
        last_review: card.last_review,
      };
    }),
    marks: parseTable(marks, 'w27-', ({ saved, at }) => {
      if (typeof saved !== 'boolean' || !validDate(at)) throw Error('收藏记录有误');
      return { saved, at };
    }),
  };
}

export function mergeProgress(current, imported) {
  for (const [name, time] of [['questions', 'at'], ['cards', 'last_review'], ['marks', 'at']]) {
    for (const [id, entry] of Object.entries(imported[name])) {
      const local = current[name][id];
      if (!local || Date.parse(entry[time]) > Date.parse(local[time])) current[name][id] = entry;
    }
  }
  return current;
}

export function recordQuestion(state, question, selected, now = new Date()) {
  const old = state.questions[question.id];
  const correct = selected === question.answer;
  state.questions[question.id] = {
    attempts: (old?.attempts ?? 0) + 1,
    correctCount: (old?.correctCount ?? 0) + Number(correct),
    selected,
    correct,
    at: now.toISOString(),
  };
}

export function wordDue(state, id, now = Date.now()) {
  const card = state.cards[id];
  return !card || Date.parse(card.due) <= now;
}

export function rateWord(state, id, good, now = new Date()) {
  if (!wordDue(state, id, now.getTime())) return;
  const record = state.cards[id] ?? createEmptyCard(now);
  const { card } = schedule.next(record, now, good ? Rating.Good : Rating.Again);
  state.cards[id] = {
    ...card,
    due: card.due.toISOString(),
    last_review: card.last_review.toISOString(),
  };
}

export function openProgress(name) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('study');
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(Error('请关闭本应用的其他窗口后重试'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve({
        read: () => access(db),
        update: (mutate) => access(db, mutate),
      });
    };
  });
}

function access(db, mutate) {
  return new Promise((resolve, reject) => {
    const transaction = db.transaction('study', mutate ? 'readwrite' : 'readonly');
    const store = transaction.objectStore('study');
    const request = store.get('progress');
    let state;
    request.onsuccess = () => {
      state = request.result ?? emptyProgress();
      if (!mutate) return;
      try {
        mutate(state);
        store.put(state, 'progress');
      } catch (error) {
        transaction.abort();
        reject(error);
      }
    };
    transaction.oncomplete = () => resolve(state);
    transaction.onabort = transaction.onerror = () => reject(transaction.error ?? Error('本机进度保存失败'));
  });
}
