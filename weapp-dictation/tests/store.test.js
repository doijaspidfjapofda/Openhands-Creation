const assert = require('assert');
const store = require('../utils/store');
const words = require('../utils/words');

let passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log('  ✓ ' + name);
}

function child(state) {
  return state.children[0];
}

function draftOf(state) {
  return child(state).draft;
}

console.log('store 数据规则测试');

test('初始演示数据包含一个学生、3 个错词、1 条听写和 1 条练习记录', function () {
  const s = store.createSeedState();
  assert.strictEqual(s.children.length, 1);
  assert.strictEqual(s.activeChildId, 'child-1');
  assert.strictEqual(Object.keys(child(s).wrong).length, 3);
  assert.strictEqual(child(s).history.length, 1);
  assert.strictEqual(child(s).practice.length, 1);
  assert.strictEqual(child(s).history[0].stats.correct, 3);
  assert.strictEqual(child(s).history[0].stats.wrong, 3);
});

test('词表筛选支持版本、年级、册别、单元与搜索', function () {
  assert.strictEqual(words.filterWords({ version: '人教', grade: '七年级', term: '上册', unit: 2 }).length, 6);
  assert.strictEqual(words.filterWords({ version: '人教', grade: '七年级', term: '上册', unit: 0 }).length, 18);
  assert.strictEqual(words.filterWords({ version: '北师大', grade: '七年级', term: '上册' }).length, 4);
  assert.strictEqual(words.filterWords({ query: '图书' }).length, 1);
  assert.deepStrictEqual(words.unitsFor('人教', '七年级', '上册'), [1, 2, 3]);
});

test('开始听写会去重并按顺序生成草稿', function () {
  const s = store.createSeedState();
  const res = store.startDraft(s, {
    wordIds: ['r7a-u2-family', 'r7a-u2-cousin', 'r7a-u2-family', 'not-exist'],
    mode: 'manual',
    language: 'zh',
    order: 'ordered'
  });
  assert.strictEqual(res.ok, true);
  const d = draftOf(s);
  assert.strictEqual(d.items.length, 2);
  assert.strictEqual(d.items[0].wordId, 'r7a-u2-family');
  assert.strictEqual(d.phase, 'grade');
  assert.strictEqual(store.draftStats(d).pending, 2);
});

test('自动听写草稿从 ready 阶段开始，间隔限制在 2-15 秒', function () {
  const s = store.createSeedState();
  store.startDraft(s, { wordIds: ['r7a-u2-family'], mode: 'auto', intervalSec: 99 });
  assert.strictEqual(draftOf(s).phase, 'ready');
  assert.strictEqual(draftOf(s).intervalSec, 15);
  const s2 = store.createSeedState();
  store.startDraft(s2, { wordIds: ['r7a-u2-family'], mode: 'auto', intervalSec: 1 });
  assert.strictEqual(draftOf(s2).intervalSec, 2);
});

test('随机顺序不改变词集合', function () {
  const s = store.createSeedState();
  const ids = ['r7a-u1-name', 'r7a-u1-country', 'r7a-u1-hobby', 'r7a-u1-quiet'];
  store.startDraft(s, { wordIds: ids, order: 'random' });
  const got = draftOf(s).items.map(function (i) { return i.wordId; }).sort();
  assert.deepStrictEqual(got, ids.slice().sort());
});

test('重复标记以最后一次为准，且不重复计数', function () {
  const s = store.createSeedState();
  store.startDraft(s, { wordIds: ['r7a-u2-family', 'r7a-u2-cousin'] });
  store.markDraft(s, 'wrong', 0);
  store.markDraft(s, 'correct', 0);
  const stats = store.draftStats(draftOf(s));
  assert.strictEqual(stats.graded, 1);
  assert.strictEqual(stats.correct, 1);
  assert.strictEqual(stats.wrong, 0);
});

test('未批改时完成会返回 PENDING，草稿保留', function () {
  const s = store.createSeedState();
  store.startDraft(s, { wordIds: ['r7a-u2-family', 'r7a-u2-cousin'] });
  store.markDraft(s, 'correct', 0);
  const res = store.finishDraft(s, {});
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'PENDING');
  assert.strictEqual(res.pending, 1);
  assert.ok(draftOf(s));
});

test('提前结束只保存已批改项，未批改不改变错词库', function () {
  const s = store.createSeedState();
  const before = Object.keys(child(s).wrong).length;
  store.startDraft(s, {
    wordIds: ['r7a-u2-family', 'r7a-u1-name', 'r7a-u2-cousin']
  });
  store.markDraft(s, 'correct', 0);
  store.markDraft(s, 'wrong', 1);
  const res = store.finishDraft(s, { partial: true });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.session.items.length, 2);
  assert.strictEqual(res.session.planned, 3);
  assert.strictEqual(res.stats.graded, 2);
  assert.strictEqual(res.stats.added, 1);
  assert.strictEqual(Object.keys(child(s).wrong).length, before + 1);
  assert.ok(child(s).wrong['r7a-u1-name']);
  assert.strictEqual(child(s).draft, null);
});

test('同一错词再次写错只更新次数，不重复建条目', function () {
  const s = store.createSeedState();
  const before = Object.keys(child(s).wrong).length;
  const record = child(s).wrong['r7a-u2-cousin'];
  const count = record.count;
  store.startDraft(s, { wordIds: ['r7a-u2-cousin'] });
  store.markDraft(s, 'wrong', 0);
  const res = store.finishDraft(s, {});
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.stats.added, 0);
  assert.strictEqual(Object.keys(child(s).wrong).length, before);
  assert.strictEqual(child(s).wrong['r7a-u2-cousin'].count, count + 1);
});

test('写对后移出当前错词库，但历史记录保留', function () {
  const s = store.createSeedState();
  const historyBefore = child(s).history.length;
  store.startDraft(s, { wordIds: ['r7a-u2-cousin'] });
  store.markDraft(s, 'correct', 0);
  const res = store.finishDraft(s, {});
  assert.strictEqual(res.stats.removed, 1);
  assert.strictEqual(child(s).wrong['r7a-u2-cousin'], undefined);
  assert.strictEqual(child(s).history.length, historyBefore + 1);
  assert.strictEqual(child(s).history[0].items[0].result, 'correct');
  assert.strictEqual(child(s).history[1].id, 'demo-session-1');
});

test('移出后再次写错会重新进入错词库', function () {
  const s = store.createSeedState();
  store.startDraft(s, { wordIds: ['r7a-u2-cousin'] });
  store.markDraft(s, 'correct', 0);
  store.finishDraft(s, {});
  assert.strictEqual(child(s).wrong['r7a-u2-cousin'], undefined);

  store.startDraft(s, { wordIds: ['r7a-u2-cousin'] });
  store.markDraft(s, 'wrong', 0);
  store.finishDraft(s, {});
  assert.ok(child(s).wrong['r7a-u2-cousin']);
  assert.strictEqual(child(s).wrong['r7a-u2-cousin'].count, 1);
});

test('学生自主练习不会移除错词，只增加练习次数', function () {
  const s = store.createSeedState();
  const before = child(s).wrong['r7a-u2-parent'].practiceCount;
  const ok = store.recordPractice(s, {
    id: 'p-test-1',
    childId: 'child-1',
    startedAt: Date.now(),
    finishedAt: Date.now(),
    items: [
      { wordId: 'r7a-u2-parent', answer: 'parent', correct: true, usedHint: false },
      { wordId: 'r7a-u2-cousin', answer: 'cosin', correct: false, usedHint: false }
    ]
  });
  assert.strictEqual(ok, true);
  assert.ok(child(s).wrong['r7a-u2-parent']);
  assert.strictEqual(child(s).wrong['r7a-u2-parent'].practiceCount, before + 1);
  assert.strictEqual(store.practiceSummary(child(s).practice[0]).independent, 1);
});

test('练习结果区分独立写对、提示后写对、仍需巩固', function () {
  const p = {
    items: [
      { correct: true, usedHint: false },
      { correct: true, usedHint: true },
      { correct: false, usedHint: true }
    ]
  };
  const summary = store.practiceSummary(p);
  assert.strictEqual(summary.total, 3);
  assert.strictEqual(summary.independent, 1);
  assert.strictEqual(summary.hinted, 1);
  assert.strictEqual(summary.weak, 1);
});

test('学生档案最多 3 个，昵称不能重复', function () {
  const s = store.createSeedState();
  assert.strictEqual(store.addChild(s, '小满').ok, true);
  assert.strictEqual(store.addChild(s, '小满').ok, false);
  assert.strictEqual(store.addChild(s, '小谷').ok, true);
  assert.strictEqual(store.addChild(s, '小川').ok, false);
  assert.strictEqual(s.children.length, 3);
  assert.strictEqual(s.activeChildId, s.children[2].id);
});

test('不同学生档案的错词互不影响', function () {
  const s = store.createSeedState();
  store.addChild(s, '小满');
  const second = s.children[1];
  assert.strictEqual(Object.keys(second.wrong).length, 0);
  assert.strictEqual(Object.keys(child(s).wrong).length, 3);
});

test('已有草稿时不允许再开新听写', function () {
  const s = store.createSeedState();
  store.startDraft(s, { wordIds: ['r7a-u2-family'] });
  const res = store.startDraft(s, { wordIds: ['r7a-u2-cousin'] });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error, 'DRAFT_EXISTS');
});

test('放弃草稿不改变历史与错词库', function () {
  const s = store.createSeedState();
  const history = child(s).history.length;
  const wrong = Object.keys(child(s).wrong).length;
  store.startDraft(s, { wordIds: ['r7a-u2-family'] });
  store.markDraft(s, 'wrong', 0);
  assert.strictEqual(store.discardDraft(s), true);
  assert.strictEqual(child(s).draft, null);
  assert.strictEqual(child(s).history.length, history);
  assert.strictEqual(Object.keys(child(s).wrong).length, wrong);
});

console.log('\n共 ' + passed + ' 项测试通过。');
