import {
  mergeProgress, openProgress, rateWord, recordQuestion, validateProgress, wordDue,
} from './progress.js';

const screen = document.querySelector('#screen');
const offline = document.querySelector('#offline-state');
const dialog = document.querySelector('#term-dialog');
const notice = document.querySelector('#notice');
const letters = ['A', 'B', 'C'];
const views = ['practice', 'cards', 'lexicon', 'settings'];
const answerModes = [['new', '未做题'], ['wrong', '错题回看'], ['done', '已做题回看']];
const wordModes = [['all', '待学与到期'], ['due', '仅到期复习'], ['saved', '已收藏']];
const escape = (value) => String(value).replace(/[&<>"']/g, (character) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
const normalized = (value) => value.normalize('NFKC').toLowerCase().trim();
const regexEscape = (value) => value.replace(/[.*+?^\x24{}()|[\]\\]/g, '\\\x24&');
const label = (name, value, options, title) => '<div class="field"><label for="' + name + '">' + title +
  '</label><select id="' + name + '">' + options.map(([key, text]) => '<option value="' + escape(key) +
    '"' + (key === value ? ' selected' : '') + '>' + escape(text) + '</option>').join('') + '</select></div>';

let bank;
let repository;
let progress;
let topicNames;
let termMap;
let activeView;
let topic = 'all';
let answerMode = 'new';
let questionId = null;
let retry = false;
let revealedQuestion = null;
let wordTopic = 'all';
let wordMode = 'all';
let wordId = null;
let wordRevealed = false;
let ratedWord = null;
let lexTopic = 'all';
let lexSearch = '';
let savedOnly = false;
let saving = false;
let noticeTimer;

function note(text) {
  clearTimeout(noticeTimer);
  notice.textContent = text;
  notice.hidden = false;
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 4200);
}

function heading(title, description = '') {
  return '<div class="heading"><h1 id="screen-title" tabindex="-1">' + title + '</h1>' +
    (description ? '<p>' + description + '</p>' : '') + '</div>';
}

function topicOptions(allLabel = '全部科目') {
  return [['all', allLabel], ...bank.topics.map(({ id, name }) => [id, name])];
}

function progressBar(done, total, title) {
  return '<progress value="' + done + '" max="' + Math.max(total, 1) + '" aria-label="' + title + '"></progress>';
}

function forTopic(items, key) {
  return key === 'all' ? items : items.filter(({ topic: itemTopic }) => itemTopic === key);
}

function isSaved(id) {
  return progress.marks[id]?.saved === true;
}

function linkTerms(question) {
  const terms = forTopic(bank.terms, question.topic)
    .flatMap((term) => [term.title, ...term.aliases].map((word) => [word, term.id]))
    .sort(([a], [b]) => b.length - a.length);
  const byTerm = new Map(terms.map(([word, id]) => [normalized(word), id]));
  const pattern = new RegExp('(^|[^A-Za-z0-9])(' + terms.map(([word]) => regexEscape(word)).join('|') +
    ')(?=$|[^A-Za-z0-9])', 'gi');
  let end = 0;
  let html = '';
  for (const match of question.prompt.matchAll(pattern)) {
    const [, before, word] = match;
    const start = match.index + before.length;
    html += escape(question.prompt.slice(end, start));
    html += '<button type="button" class="term-link" data-term="' + byTerm.get(normalized(word)) + '">' + escape(word) + '</button>';
    end = start + word.length;
  }
  return html + escape(question.prompt.slice(end));
}

function practiceQueue() {
  return forTopic(bank.questions, topic).filter(({ id }) => {
    const mark = progress.questions[id];
    if (answerMode === 'new') return !mark;
    if (answerMode === 'wrong') return mark && !mark.correct;
    return Boolean(mark);
  });
}

function practice() {
  const scoped = forTopic(bank.questions, topic);
  const done = scoped.filter(({ id }) => progress.questions[id]).length;
  const correct = scoped.filter(({ id }) => progress.questions[id]?.correct).length;
  const queue = practiceQueue();
  const question = scoped.find(({ id }) => id === questionId) ?? queue[0];
  const filters = '<div class="filters">' + label('question-topic', topic, topicOptions(), '科目') +
    label('answer-mode', answerMode, answerModes, '模式') + '</div>';
  const side = '<aside class="side" aria-label="答题进度"><div><div class="side-head"><h2>答题进度</h2><span>' +
    done + ' / ' + scoped.length + '</span></div>' + progressBar(done, scoped.length, '已做题目') +
    '<p>最近答对 ' + correct + ' 题 · 错题 ' + (done - correct) + ' 题</p></div>' +
    (topic !== 'all' ? '<p>官方考试权重 ' + bank.topics.find(({ id }) => id === topic).weight + '</p>' : '') + '</aside>';
  if (!question) {
    const empty = answerMode === 'new' ? '当前范围的题已做完' : '当前范围暂无记录';
    screen.innerHTML = heading('练习', '英文三选一 · 中文解析') + '<div class="layout"><section class="paper">' +
      filters + '<div class="empty"><h2>' + empty + '</h2><p class="help">切换科目或练习模式继续。</p></div></section>' + side + '</div>';
    return;
  }

  questionId = question.id;
  const review = answerMode !== 'new' && !retry;
  const record = revealedQuestion ?? (review ? progress.questions[question.id] : null);
  const cards = question.choices.map((choice, index) => {
    let mark = '';
    if (record && index === question.answer) mark = ' correct';
    if (record && index === record.selected && !record.correct) mark = ' incorrect';
    const text = '<b>' + letters[index] + '</b><span lang="en">' + escape(choice) + '</span>';
    return record ? '<div class="choice' + mark + '">' + text + '</div>' :
      '<label class="choice"><input type="radio" name="answer" value="' + index + '">' + text + '</label>';
  }).join('');

  const outcome = record ? '<section class="explanation' + (record.correct ? '' : ' missed') +
    '" tabindex="-1" id="answer-result"><h3>' + (record.correct ? '答对了' :
      record.selected < 0 ? '未选答案 · 已计入错题' : '答错了') + ' · 正确答案 ' + letters[question.answer] +
    '</h3><p>' + escape(question.detail) + '</p><p class="help">考点 · ' + escape(question.concept) + '</p></section>' : '';
  const queueHasNext = queue.some(({ id }) => id !== question.id);
  const practiceMore = answerMode === 'new' || queueHasNext;
  let buttons = '<button type="submit" class="primary">看答案</button>';
  if (record) {
    buttons = '<button type="button" class="primary" data-action="next-question">' + (practiceMore ? '下一题' : '结束回看') + '</button>' +
      (review ? '<button type="button" class="secondary" data-action="retry-question">重做</button>' : '');
  }
  screen.innerHTML = heading('练习', '英文三选一 · 中文解析') + '<div class="layout"><section class="paper">' +
    filters + '<div class="context"><span>' + escape(topicNames.get(question.topic)) + '</span></div><h2 class="prompt" lang="en" id="question-prompt" tabindex="-1">' +
    linkTerms(question) + '</h2><form id="answer-form"><fieldset class="choices"><legend>选一个答案</legend>' +
    cards + '</fieldset>' + outcome + '<div class="actions">' + buttons + '</div></form></section>' + side + '</div>';
}

function wordQueue() {
  const list = forTopic(bank.terms, wordTopic).filter(({ id }) => wordDue(progress, id));
  if (wordMode === 'due') return list.filter(({ id }) => progress.cards[id]);
  if (wordMode === 'saved') return list.filter(({ id }) => isSaved(id));
  return [...list.filter(({ id }) => progress.cards[id]), ...list.filter(({ id }) => !progress.cards[id])];
}

function wordStudy() {
  const scoped = forTopic(bank.terms, wordTopic);
  const done = scoped.filter(({ id }) => progress.cards[id]).length;
  const due = scoped.filter(({ id }) => progress.cards[id] && wordDue(progress, id)).length;
  const term = termMap.get(wordId) ?? wordQueue()[0];
  const filters = '<div class="filters">' + label('word-topic', wordTopic, topicOptions(), '科目') +
    label('word-mode', wordMode, wordModes, '范围') + '</div>';
  const side = '<aside class="side" aria-label="背词进度"><div><div class="side-head"><h2>已学词卡</h2><span>' +
    done + ' / ' + scoped.length + '</span></div>' + progressBar(done, scoped.length, '已学词卡') +
    '<p>到期待复习 ' + due + ' 个</p></div></aside>';
  let body = '<div class="empty"><h2>当前范围暂无待学词卡</h2><p class="help">可切换科目，或去词库查词与收藏。</p>' +
    '<div class="actions"><a class="secondary" href="#lexicon">打开词库</a></div></div>';
  if (term) {
    wordId = term.id;
    let buttons = '<button class="primary" data-action="reveal-word">显示释义</button>';
    let detail = '';
    if (wordRevealed) {
      detail = '<section id="word-result" class="card-detail" tabindex="-1"><h3>' + escape(term.translation) +
        '</h3><p>' + escape(term.detail) + '</p></section>';
      buttons = ratedWord ? '<button class="primary" data-action="next-word">下一词</button><span class="help">' +
        (ratedWord === 'good' ? '已记为认识' : '已安排复习') + '</span>' :
        '<button class="secondary" data-action="again-word">不认识</button>' +
        '<button class="primary" data-action="good-word">认识</button>';
    }
    body = '<div class="context"><span>' + escape(topicNames.get(term.topic)) + '</span><span>' +
      (progress.cards[term.id] ? '复习' : '新词') + '</span></div><h2 class="term-heading" lang="en" id="word-prompt" tabindex="-1">' +
      escape(term.title) + '</h2>' + detail + '<div class="actions">' + buttons + '</div>';
  }
  screen.innerHTML = heading('词卡', '先回想词义，再揭示释义') + '<div class="layout"><section class="paper">' +
    filters + body + '</section>' + side + '</div>';
}

function termResults() {
  const key = normalized(lexSearch);
  const results = forTopic(bank.terms, lexTopic).filter((term) => (!savedOnly || isSaved(term.id)) &&
    (!key || [term.title, term.translation, ...term.aliases].some((value) => normalized(value).includes(key))));
  screen.querySelector('#term-total').textContent = '找到 ' + results.length + ' 个词条';
  screen.querySelector('#term-list').innerHTML = results.map((term) => '<li><button class="term-row" data-term="' + term.id +
    '"><span><strong lang="en">' + escape(term.title) + '</strong><small>' + escape(topicNames.get(term.topic)) +
    (isSaved(term.id) ? ' · 已收藏' : '') + '</small></span><span>' + escape(term.translation) + '</span></button></li>').join('');
}

function lexicon() {
  screen.innerHTML = heading('词库', '支持英文、中文和常用缩写') + '<section class="paper"><div class="filters">' +
    '<div class="field field-wide"><label for="term-search">搜索词条</label><input id="term-search" type="search" value="' +
    escape(lexSearch) + '" maxlength="120" placeholder="例如 WACC 或 净现值"></div>' +
    label('lex-topic', lexTopic, topicOptions(), '科目') + '</div><label><input type="checkbox" id="saved-only"' +
    (savedOnly ? ' checked' : '') + '> 仅看收藏</label><p id="term-total" class="help" role="status"></p><ul id="term-list" class="term-list"></ul></section>';
  termResults();
}

function settings() {
  screen.innerHTML = heading('资料与备份') + '<div class="settings">' +
    '<section class="paper"><h2>本机进度</h2><p>进度保存在当前浏览器或独立网页 App。换机或切换入口时，先导出 JSON，再在新入口导入。导入按每道题、每张卡和每项收藏保留较新的记录。</p>' +
    '<div class="actions"><button class="primary" data-action="export">导出备份</button>' +
    '<button class="secondary" data-action="import">导入备份</button><input id="backup-input" type="file" accept=".json,application/json" hidden></div></section>' +
    '<section class="paper"><h2>安装与离线</h2><ul><li>iPhone 或 iPad 用 Safari 分享菜单的「添加到主屏幕」，开启「作为网页 App 打开」。</li>' +
    '<li>macOS Sonoma 14 或更新版用 Safari「文件 → 添加到程序坞」。</li><li>Android 可用 Chrome 菜单安装网页应用。</li></ul>' +
    '<p>从新图标联网打开一次，待页脚显示「可离线使用」后即可断网学习。</p></section>' +
    '<section class="paper"><h2>2027 一级资料</h2><p>项目自编 ' + bank.questions.length + ' 道练习、' + bank.terms.length + ' 个词条，覆盖十科。' +
    '考点范围和科目权重参照 2027 一级考纲。</p><ul>' +
    '<li><a href="https://www.cfainstitute.org/programs/cfa-program/candidate-resources/level-i-exam" target="_blank" rel="noopener">CFA Institute 一级考纲与权重</a></li>' +
    '<li><a href="https://www.cfainstitute.org/programs/cfa-program/cfa-program-level-i-sample-questions" target="_blank" rel="noopener">CFA Institute 样题</a></li>' +
    '<li><a href="https://www.cfainstitute.org/programs/cfa-program/candidate-resources/glossary-terms" target="_blank" rel="noopener">CFA Institute 术语表</a></li>' +
    '<li><a href="https://github.com/renyue-xiao/investment-study" target="_blank" rel="noopener">GitHub 源码与勘误</a></li></ul></section></div>';
}

function render() {
  document.querySelectorAll('[data-view]').forEach((link) => {
    if (link.dataset.view === activeView) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  ({ practice, cards: wordStudy, lexicon, settings })[activeView]();
}

function route(focus = false) {
  const hash = location.hash.slice(1);
  if (hash === 'screen-title' && activeView) return;
  activeView = views.includes(hash) ? hash : 'practice';
  if (dialog.open) dialog.close();
  render();
  if (focus) screen.querySelector('h1').focus();
}

function resetQuestion(id = null) {
  questionId = id;
  retry = false;
  revealedQuestion = null;
}

function resetWord() {
  wordId = null;
  wordRevealed = false;
  ratedWord = null;
}

function showTerm(id) {
  const term = termMap.get(id);
  if (!term) return;
  const content = dialog.querySelector('#term-content');
  const wasOpen = dialog.open;
  content.innerHTML = '<div class="context"><span>' + escape(topicNames.get(term.topic)) + '</span></div>' +
    '<h2 id="term-title" lang="en" tabindex="-1">' + escape(term.title) + '</h2><h3>' + escape(term.translation) +
    '</h3><p>' + escape(term.detail) + '</p><div class="actions"><button class="secondary" data-action="close-term">关闭</button>' +
    '<button class="primary" data-save="' + term.id + '">' + (isSaved(id) ? '取消收藏' : '收藏词条') + '</button></div>';
  if (!wasOpen) dialog.showModal();
  content.querySelector(wasOpen ? '[data-save]' : 'h2').focus();
}

async function persist(mutate) {
  if (saving) return false;
  saving = true;
  try {
    progress = await repository.update(mutate);
    return true;
  } catch (error) {
    console.error(error);
    note('保存失败。请检查浏览器存储权限后重试。');
    return false;
  } finally {
    saving = false;
  }
}

screen.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (event.target.id !== 'answer-form' || revealedQuestion || (answerMode !== 'new' && !retry)) return;
  const form = event.target;
  const selected = new FormData(form).get('answer');
  const question = bank.questions.find(({ id }) => id === questionId);
  if (!question || !(await persist((state) => recordQuestion(state, question, selected === null ? -1 : Number(selected))))) return;
  if (activeView !== 'practice' || questionId !== question.id || !form.isConnected) return;
  revealedQuestion = progress.questions[question.id];
  render();
  screen.querySelector('#answer-result').focus();
});

screen.addEventListener('change', (event) => {
  const { id, value, checked, files } = event.target;
  switch (id) {
    case 'question-topic': topic = value; resetQuestion(); break;
    case 'answer-mode': answerMode = value; resetQuestion(); break;
    case 'word-topic': wordTopic = value; resetWord(); break;
    case 'word-mode': wordMode = value; resetWord(); break;
    case 'lex-topic': lexTopic = value; termResults(); return;
    case 'saved-only': savedOnly = checked; termResults(); return;
    case 'backup-input':
      if (files[0]) void importBackup(files[0]);
      event.target.value = '';
      return;
    default: return;
  }
  render();
  screen.querySelector('#' + id)?.focus({ preventScroll: true });
});

screen.addEventListener('input', ({ target }) => {
  if (target.id !== 'term-search') return;
  lexSearch = target.value;
  termResults();
});

async function exportBackup() {
  try {
    const state = await repository.read();
    const backup = { app: 'investment-study', progress: state };
    const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'investment-study-progress-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30_000);
  } catch (error) {
    console.error(error);
    note('无法导出本机进度');
  }
}

async function importBackup(file) {
  try {
    if (file.size > 2_000_000) throw Error('备份文件过大');
    const backup = JSON.parse(await file.text());
    if (backup?.app !== 'investment-study') throw Error('请选择词研导出的备份');
    const incoming = validateProgress(backup.progress);
    if (await persist((state) => mergeProgress(state, incoming))) {
      resetQuestion();
      resetWord();
      render();
      note('备份已导入，已保留较新的记录');
    }
  } catch (error) {
    note(error instanceof SyntaxError ? '备份不是有效的 JSON 文件' : error.message);
  }
}

document.addEventListener('click', async (event) => {
  if (!(event.target instanceof Element)) return;
  if (event.target.closest('.skip')) {
    event.preventDefault();
    screen.querySelector('h1').focus();
    return;
  }
  const target = event.target.closest('button[data-action], button[data-term], button[data-save]');
  if (!target || !bank || saving) return;
  const { action, term, save } = target.dataset;
  if (term) {
    showTerm(term);
    return;
  }
  if (save) {
    if (await persist((state) => {
      state.marks[save] = { saved: !state.marks[save]?.saved, at: new Date().toISOString() };
    })) {
      if (dialog.open) showTerm(save);
      if (activeView === 'lexicon') termResults();
    }
    return;
  }

  let focus;
  switch (action) {
    case 'next-question': {
      const queue = practiceQueue();
      const index = queue.findIndex(({ id }) => id === questionId);
      const next = queue[index + 1];
      if (!next && answerMode !== 'new') answerMode = 'new';
      resetQuestion(next?.id);
      focus = '#question-prompt';
      break;
    }
    case 'retry-question':
      retry = true;
      revealedQuestion = null;
      focus = '#question-prompt';
      break;
    case 'reveal-word':
      wordRevealed = true;
      focus = '#word-result';
      break;
    case 'again-word':
    case 'good-word': {
      if (!wordId || !wordRevealed || ratedWord) return;
      const current = wordId;
      const good = action === 'good-word';
      if (!(await persist((state) => rateWord(state, current, good))) || activeView !== 'cards' || current !== wordId) return;
      ratedWord = good ? 'good' : 'again';
      focus = '[data-action="next-word"]';
      break;
    }
    case 'next-word':
      resetWord();
      focus = '#word-prompt';
      break;
    case 'close-term': dialog.close(); return;
    case 'export': void exportBackup(); return;
    case 'import': screen.querySelector('#backup-input').click(); return;
    default: return;
  }
  render();
  (screen.querySelector(focus) ?? screen.querySelector('h1')).focus();
});

async function prepareOffline() {
  if (!('serviceWorker' in navigator)) {
    offline.textContent = '当前浏览器不支持离线安装';
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register('./sw.js');
    const markReady = () => {
      if (navigator.serviceWorker.controller) offline.textContent = '可离线使用';
    };
    navigator.serviceWorker.addEventListener('controllerchange', markReady);
    markReady();
    const installing = registration.installing;
    installing?.addEventListener('statechange', () => {
      if (!registration.active && installing.state === 'redundant') offline.textContent = '离线准备失败，联网刷新可重试';
    });
    await navigator.serviceWorker.ready;
    markReady();
  } catch (error) {
    console.error(error);
    offline.textContent = '离线准备失败，联网刷新可重试';
  }
}

async function initialize() {
  try {
    [bank, repository] = await Promise.all([
      fetch('./bank.json').then((response) => {
        if (!response.ok) throw Error('题库加载失败');
        return response.json();
      }),
      openProgress('investment-study:' + new URL('./', location.href).pathname),
    ]);
    progress = await repository.read();
    termMap = new Map(bank.terms.map((term) => [term.id, term]));
    topicNames = new Map(bank.topics.map(({ id, name }) => [id, name]));
    route();
    window.addEventListener('hashchange', () => route(true));
    void prepareOffline();
  } catch (error) {
    console.error(error);
    screen.innerHTML = '<section class="boot-error"><h1 id="screen-title" tabindex="-1">无法启动词研</h1>' +
      '<p>请联网并启用浏览器的本机存储后刷新。</p><a href="./" class="primary">重新加载</a></section>';
    offline.textContent = '离线内容尚未准备';
  }
}

void initialize();
