// 纯数据层：不依赖 wx，可在 Node 中直接测试。
const words = require('./words');

const DAY = 24 * 60 * 60 * 1000;

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function newChild(id, name, extra) {
  return Object.assign(
    {
      id,
      name,
      grade: '七年级',
      term: '上册',
      version: '人教',
      currentUnit: 2,
      wrong: {},
      history: [],
      practice: [],
      draft: null
    },
    extra || {}
  );
}

function createSeedState() {
  const now = Date.now();
  const yesterday = now - DAY;
  const twoDaysAgo = now - 2 * DAY;

  const child = newChild('child-1', '小禾');

  const wrongIds = ['r7a-u2-cousin', 'r7a-u2-parent', 'r7a-u2-grandfather'];
  const sessionWordIds = [
    'r7a-u2-family',
    'r7a-u2-cousin',
    'r7a-u2-parent',
    'r7a-u2-uncle',
    'r7a-u2-aunt',
    'r7a-u2-grandfather'
  ];

  child.history.push({
    id: 'demo-session-1',
    childId: child.id,
    createdAt: yesterday - 12 * 60 * 1000,
    finishedAt: yesterday,
    mode: 'manual',
    language: 'zh',
    order: 'ordered',
    source: '教材词表',
    planned: sessionWordIds.length,
    items: sessionWordIds.map(function (id) {
      return {
        wordId: id,
        result: wrongIds.indexOf(id) >= 0 ? 'wrong' : 'correct'
      };
    }),
    stats: { graded: 6, correct: 3, wrong: 3, added: 3, removed: 0 },
    sample: true
  });

  wrongIds.forEach(function (id, i) {
    child.wrong[id] = {
      id: id,
      count: 1,
      firstAt: yesterday,
      lastAt: yesterday,
      practiceCount: 1,
      lastPracticeAt: twoDaysAgo + i * 60 * 1000
    };
  });

  child.practice.push({
    id: 'demo-practice-1',
    childId: child.id,
    startedAt: twoDaysAgo,
    finishedAt: twoDaysAgo + 3 * 60 * 1000,
    items: [
      { wordId: 'r7a-u2-cousin', answer: 'cousin', correct: true, usedHint: false },
      { wordId: 'r7a-u2-parent', answer: 'parent', correct: true, usedHint: true },
      { wordId: 'r7a-u2-grandfather', answer: 'grandfater', correct: false, usedHint: false }
    ]
  });

  return {
    version: 1,
    activeChildId: child.id,
    role: 'parent',
    children: [child]
  };
}

function findChild(state, id) {
  return state.children.filter(function (c) { return c.id === id; })[0] || null;
}

function currentChild(state) {
  return findChild(state, state.activeChildId) || state.children[0];
}

function wrongList(child) {
  return Object.keys(child.wrong)
    .filter(function (id) { return words.byId(id); })
    .map(function (id) {
      return Object.assign({ word: words.byId(id) }, child.wrong[id]);
    })
    .sort(function (a, b) {
      return a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0;
    });
}

function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function startDraft(state, opts) {
  const o = opts || {};
  const child = findChild(state, o.childId || state.activeChildId);
  if (!child) return { ok: false, error: '找不到学生档案' };
  if (child.draft) return { ok: false, error: 'DRAFT_EXISTS' };

  const ids = [];
  (o.wordIds || []).forEach(function (id) {
    if (words.byId(id) && ids.indexOf(id) === -1) ids.push(id);
  });
  if (!ids.length) return { ok: false, error: 'EMPTY' };

  const random = o.order === 'random';
  const ordered = random ? shuffle(ids) : ids;

  const draft = {
    id: 'd-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
    childId: child.id,
    createdAt: Date.now(),
    mode: o.mode === 'auto' ? 'auto' : 'manual',
    language: o.language === 'en' ? 'en' : 'zh',
    order: random ? 'random' : 'ordered',
    source: o.source || '教材词表',
    intervalSec: clamp(Number(o.intervalSec) || 5, 2, 15),
    phase: o.mode === 'auto' ? 'ready' : 'grade',
    index: 0,
    items: ordered.map(function (id) {
      return { wordId: id, result: null };
    })
  };

  child.draft = draft;
  return { ok: true, draft: draft };
}

function draftStats(draft) {
  const stats = { planned: draft.items.length, graded: 0, correct: 0, wrong: 0, pending: 0 };
  draft.items.forEach(function (item) {
    if (item.result === 'correct') {
      stats.graded += 1;
      stats.correct += 1;
    } else if (item.result === 'wrong') {
      stats.graded += 1;
      stats.wrong += 1;
    }
  });
  stats.pending = stats.planned - stats.graded;
  return stats;
}

function markDraft(state, result, index) {
  const child = currentChild(state);
  const draft = child && child.draft;
  if (!draft) return null;
  const i = typeof index === 'number' ? index : draft.index;
  if (!draft.items[i]) return null;
  draft.items[i].result = result === 'correct' || result === 'wrong' ? result : null;
  return draft;
}

function goTo(state, index) {
  const child = currentChild(state);
  const draft = child && child.draft;
  if (!draft) return null;
  if (index >= 0 && index < draft.items.length) draft.index = index;
  return draft;
}

function finishDraft(state, opts) {
  const o = opts || {};
  const now = o.now || Date.now();
  const child = currentChild(state);
  const draft = child && child.draft;
  if (!draft) return { ok: false, error: 'NO_DRAFT' };

  const stats = draftStats(draft);
  if (stats.pending > 0 && !o.partial) {
    return { ok: false, error: 'PENDING', pending: stats.pending, graded: stats.graded };
  }
  if (!stats.graded) return { ok: false, error: 'EMPTY' };

  const summary = { graded: stats.graded, correct: 0, wrong: 0, added: 0, removed: 0 };
  const gradedItems = [];

  draft.items.forEach(function (item) {
    if (!item.result) return;
    gradedItems.push({ wordId: item.wordId, result: item.result });

    if (item.result === 'correct') {
      summary.correct += 1;
      if (child.wrong[item.wordId]) {
        delete child.wrong[item.wordId];
        summary.removed += 1;
      }
      return;
    }

    summary.wrong += 1;
    const record = child.wrong[item.wordId];
    if (record) {
      record.count += 1;
      record.lastAt = now;
    } else {
      child.wrong[item.wordId] = {
        id: item.wordId,
        count: 1,
        firstAt: now,
        lastAt: now,
        practiceCount: 0,
        lastPracticeAt: null
      };
      summary.added += 1;
    }
  });

  const session = {
    id: draft.id,
    childId: child.id,
    createdAt: draft.createdAt,
    finishedAt: now,
    mode: draft.mode,
    language: draft.language,
    order: draft.order,
    source: draft.source,
    planned: draft.items.length,
    items: gradedItems,
    stats: summary,
    sample: false
  };

  child.history.unshift(session);
  child.draft = null;

  return { ok: true, session: session, stats: summary };
}

function discardDraft(state) {
  const child = currentChild(state);
  if (!child || !child.draft) return false;
  child.draft = null;
  return true;
}

function addChild(state, name) {
  const nickname = String(name || '').trim();
  if (!nickname) return { ok: false, error: '请填写孩子的昵称' };
  if (nickname.length > 12) return { ok: false, error: '昵称最多 12 个字' };
  if (state.children.length >= 3) return { ok: false, error: '一个家庭最多添加 3 个学生档案' };
  if (state.children.some(function (c) { return c.name === nickname; })) {
    return { ok: false, error: '已有同名档案，请换个昵称方便区分' };
  }
  const child = newChild('child-' + Date.now(), nickname);
  state.children.push(child);
  state.activeChildId = child.id;
  return { ok: true, child: child };
}

function recordPractice(state, practice) {
  const child = findChild(state, practice.childId);
  if (!child) return false;
  if (child.practice.some(function (p) { return p.id === practice.id; })) return false;
  child.practice.unshift(practice);
  practice.items.forEach(function (item) {
    const record = child.wrong[item.wordId];
    if (record) {
      record.practiceCount = (record.practiceCount || 0) + 1;
      record.lastPracticeAt = practice.finishedAt;
    }
  });
  return true;
}

function sessionById(child, id) {
  return child.history.filter(function (s) { return s.id === id; })[0] || null;
}

function practiceById(child, id) {
  return child.practice.filter(function (p) { return p.id === id; })[0] || null;
}

function practiceSummary(practice) {
  let independent = 0;
  let hinted = 0;
  practice.items.forEach(function (item) {
    if (item.correct && !item.usedHint) independent += 1;
    else if (item.correct) hinted += 1;
  });
  return {
    total: practice.items.length,
    independent: independent,
    hinted: hinted,
    weak: practice.items.length - independent - hinted
  };
}

module.exports = {
  newChild: newChild,
  createSeedState: createSeedState,
  findChild: findChild,
  currentChild: currentChild,
  wrongList: wrongList,
  startDraft: startDraft,
  draftStats: draftStats,
  markDraft: markDraft,
  goTo: goTo,
  finishDraft: finishDraft,
  discardDraft: discardDraft,
  addChild: addChild,
  recordPractice: recordPractice,
  sessionById: sessionById,
  practiceById: practiceById,
  practiceSummary: practiceSummary
};
