// 页面流程测试：用最小 wx/Page 运行时模拟小程序环境，跑通核心闭环。
const assert = require('assert');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const storage = {};
const nav = [];
let pageConfig = null;
let passed = 0;

global.wx = {
  getStorageSync: function (k) {
    return storage[k];
  },
  setStorageSync: function (k, v) {
    storage[k] = v;
  },
  removeStorageSync: function (k) {
    delete storage[k];
  },
  showToast: function () {},
  pageScrollTo: function () {},
  navigateTo: function (o) {
    nav.push({ type: 'navigateTo', url: o.url });
  },
  redirectTo: function (o) {
    nav.push({ type: 'redirectTo', url: o.url });
  },
  reLaunch: function (o) {
    nav.push({ type: 'reLaunch', url: o.url });
  },
  navigateBack: function () {
    nav.push({ type: 'navigateBack' });
  },
  createInnerAudioContext: function () {
    return {
      src: '',
      obeyMuteSwitch: false,
      play: function () {},
      stop: function () {},
      onEnded: function (fn) {
        this._ended = fn;
      },
      offEnded: function () {
        this._ended = null;
      },
      onError: function (fn) {
        this._err = fn;
      },
      offError: function () {
        this._err = null;
      }
    };
  },
  request: function () {},
  getWindowInfo: function () {
    return { statusBarHeight: 20, windowWidth: 390 };
  },
  getSystemInfoSync: function () {
    return { statusBarHeight: 20, windowWidth: 390 };
  }
};

global.Page = function (conf) {
  pageConfig = conf;
};
global.Component = function (conf) {
  pageConfig = conf;
};
global.App = function () {};
global.getApp = function () {
  return { globalData: { statusBarHeight: 20 } };
};
global.getCurrentPages = function () {
  return [{}, {}];
};

function loadPage(rel) {
  const file = path.join(ROOT, rel);
  delete require.cache[require.resolve(file)];
  pageConfig = null;
  require(file);
  assert.ok(pageConfig, 'Page() 未被调用: ' + rel);
  return pageConfig;
}

function instantiate(conf) {
  const page = {};
  Object.keys(conf).forEach(function (k) {
    if (k !== 'data') page[k] = conf[k];
  });
  page.data = JSON.parse(JSON.stringify(conf.data || {}));
  page.setData = function (patch) {
    Object.keys(patch).forEach(function (k) {
      page.data[k] = patch[k];
    });
  };
  return page;
}

function test(name, fn) {
  fn();
  passed += 1;
  console.log('  ✓ ' + name);
}

function lastUrl() {
  return nav[nav.length - 1].url;
}

function idFrom(url) {
  return url.split('id=')[1];
}

const state = require('../utils/state');
const store = require('../utils/store');

console.log('页面流程测试');

let setup;
let session;
let resultId;

test('选词页默认按学生档案预选 Unit 2 的 6 个词', function () {
  setup = instantiate(loadPage('pages/setup/setup.js'));
  setup.onLoad();
  assert.strictEqual(setup.data.grade, '七年级');
  assert.strictEqual(setup.data.term, '上册');
  assert.strictEqual(setup.data.version, '人教');
  assert.strictEqual(setup.data.unit, 2);
  assert.strictEqual(setup.data.list.length, 6);
  assert.strictEqual(setup.data.selectedCount, 6);
});

test('切换单元与全选后选中数量正确', function () {
  setup.onUnit({ currentTarget: { dataset: { value: 0 } } });
  assert.strictEqual(setup.data.list.length, 18);
  assert.strictEqual(setup.data.selectedCount, 6);
  setup.onSelectAll();
  assert.strictEqual(setup.data.selectedCount, 18);
  assert.strictEqual(setup.data.allSelected, true);
  setup.onClear();
  assert.strictEqual(setup.data.selectedCount, 0);
  setup.onSelectAll();
  assert.strictEqual(setup.data.selectedCount, 18);
});

test('选择自动听写与英文播报后创建草稿并进入听写页', function () {
  setup.onMode({ currentTarget: { dataset: { mode: 'auto' } } });
  setup.onLanguage({ currentTarget: { dataset: { lang: 'en' } } });
  setup.onOrder({ detail: { value: 0 } });
  setup.onStart();
  assert.strictEqual(nav[nav.length - 1].type, 'navigateTo');
  assert.strictEqual(lastUrl(), '/pages/session/session');
  const draft = state.child().draft;
  assert.strictEqual(draft.mode, 'auto');
  assert.strictEqual(draft.language, 'en');
  assert.strictEqual(draft.phase, 'ready');
  assert.strictEqual(draft.items.length, 18);
});

test('自动听写页默认隐藏答案，可调整间隔并开始', function () {
  session = instantiate(loadPage('pages/session/session.js'));
  session.onLoad();
  assert.strictEqual(session.data.isAuto, true);
  assert.strictEqual(session.data.phase, 'ready');
  assert.strictEqual(session.data.reveal, false);
  assert.strictEqual(session.data.total, 18);

  session.onInterval({ detail: { value: 8 } });
  assert.strictEqual(session.data.intervalSec, 8);
  assert.strictEqual(state.child().draft.intervalSec, 8);

  session.onStartAuto();
  assert.strictEqual(session.data.phase, 'playing');
  assert.strictEqual(session.data.playing, true);
  assert.strictEqual(session.data.reveal, false);

  session.onPause();
  assert.strictEqual(session.data.paused, true);

  session.onEndEarly();
  assert.strictEqual(session.data.phase, 'finished');
  assert.strictEqual(session.data.playing, false);
  assert.strictEqual(state.child().draft.phase, 'finished');
});

test('播放结束后进入集中批改，标记后自动前进', function () {
  session.onStartGrade();
  assert.strictEqual(session.data.phase, 'grade');
  assert.strictEqual(session.data.index, 0);
  assert.strictEqual(session.data.reveal, true);

  session.onMark({ currentTarget: { dataset: { result: 'correct' } } });
  assert.strictEqual(session.data.index, 1);
  assert.strictEqual(session.data.marked, 1);
  assert.strictEqual(session.data.correct, 1);
});

test('可返回已批改词改标，以最后一次标记为准', function () {
  session.onPrev();
  assert.strictEqual(session.data.index, 0);
  assert.strictEqual(session.data.currentState, 'correct');
  session.onMark({ currentTarget: { dataset: { result: 'wrong' } } });
  assert.strictEqual(session.data.index, 1);
  assert.strictEqual(session.data.correct, 0);
  assert.strictEqual(session.data.wrong, 1);
});

test('完成全部批改后按最终结果保存并进入结果页', function () {
  while (session.data.marked < session.data.total) {
    const index = session.data.index;
    const result = index === 0 ? 'correct' : index % 2 === 0 ? 'correct' : 'wrong';
    session.onMark({ currentTarget: { dataset: { result: result } } });
    if (session.data.modal) break;
  }
  assert.strictEqual(session.data.marked, 18);
  assert.ok(session.data.modal, '最后一个词批改后应出现确认弹窗');

  session.onModalAction({ detail: { key: 'finish' } });
  assert.strictEqual(nav[nav.length - 1].type, 'redirectTo');
  assert.ok(lastUrl().indexOf('/pages/result/result?id=') === 0);
  resultId = idFrom(lastUrl());
  assert.ok(resultId);
  assert.strictEqual(state.child().draft, null);
});

test('结果页统计与错词库变更符合规则', function () {
  const page = instantiate(loadPage('pages/result/result.js'));
  page.onLoad({ id: resultId });
  assert.strictEqual(page.data.missing, false);
  assert.strictEqual(page.data.graded, 18);
  assert.strictEqual(page.data.pending, 0);
  // 第 1 个词先标正确、返回后改标错误，所以最终是 8 对 10 错
  assert.strictEqual(page.data.correct, 8);
  assert.strictEqual(page.data.wrong, 10);
  assert.strictEqual(page.data.accuracy, '44.4');
  assert.strictEqual(page.data.added, 8);
  assert.strictEqual(page.data.removed, 1);
  assert.strictEqual(page.data.wrongTotal, 10);
  assert.strictEqual(page.data.items.length, 18);
});

test('错词库展示 10 个待复习词，并可发起再次听写', function () {
  const page = instantiate(loadPage('pages/bank/bank.js'));
  page.onLoad();
  page.onShow();
  assert.strictEqual(page.data.role, 'parent');
  assert.strictEqual(page.data.list.length, 10);
  page.onSelectAll();
  assert.strictEqual(page.data.selectedCount, 10);
  page.onStartDictation();
  assert.strictEqual(lastUrl(), '/pages/session/session');
  assert.strictEqual(state.child().draft.items.length, 10);
  store.discardDraft(state.get());
  state.save();
});

test('听写记录页保留历史会话', function () {
  const page = instantiate(loadPage('pages/history/history.js'));
  page.onLoad();
  assert.strictEqual(page.data.list.length, 2);
  assert.strictEqual(page.data.list[0].graded, 18);
  assert.strictEqual(page.data.list[1].sample, true);
});

test('学生自主练习：输入、提示、反馈与保存', function () {
  state.setRole('student');
  storage['wordnest-practice-pending'] = ['r7a-u2-cousin', 'r7a-u2-uncle'];

  const page = instantiate(loadPage('pages/practice/practice.js'));
  page.onLoad();
  assert.strictEqual(page.data.role, 'student');
  assert.strictEqual(page.data.total, 2);
  assert.strictEqual(page.data.word.en, 'cousin');

  page.onInput({ detail: { value: 'cousin' } });
  page.onSubmit();
  assert.strictEqual(page.data.feedback.correct, true);
  assert.strictEqual(page.data.feedback.answer, 'cousin');

  page.onNext();
  assert.strictEqual(page.data.index, 1);
  assert.strictEqual(page.data.word.en, 'uncle');
  assert.strictEqual(page.data.usedHint, false);

  page.onHint();
  assert.strictEqual(page.data.usedHint, true);
  assert.strictEqual(page.data.hintText, 'u _ _ _ _');

  page.onInput({ detail: { value: 'uncle' } });
  page.onSubmit();
  assert.strictEqual(page.data.feedback.correct, true);

  page.onNext();
  assert.strictEqual(nav[nav.length - 1].type, 'redirectTo');
  assert.ok(lastUrl().indexOf('/pages/practice-result/practice-result?id=') === 0);

  const practiceId = idFrom(lastUrl());
  const saved = store.practiceById(state.child(), practiceId);
  assert.ok(saved);
  assert.strictEqual(saved.items.length, 2);
  assert.strictEqual(saved.items[0].usedHint, false);
  assert.strictEqual(saved.items[1].usedHint, true);
});

test('自主练习不会移除家长听写错词', function () {
  assert.ok(state.child().wrong['r7a-u2-cousin']);
  assert.ok(state.child().wrong['r7a-u2-uncle']);
  assert.strictEqual(state.child().wrong['r7a-u2-cousin'].practiceCount, 2);
});

test('练习结果页区分独立写对与提示后写对', function () {
  const practiceId = idFrom(lastUrl());
  const page = instantiate(loadPage('pages/practice-result/practice-result.js'));
  page.onLoad({ id: practiceId });
  assert.strictEqual(page.data.missing, false);
  assert.strictEqual(page.data.total, 2);
  assert.strictEqual(page.data.independent, 1);
  assert.strictEqual(page.data.hinted, 1);
  assert.strictEqual(page.data.weak, 0);
  assert.strictEqual(page.data.items[1].label, '提示后正确');
});

test('学生首页统计与错词标签同步', function () {
  const page = instantiate(loadPage('pages/home/home.js'));
  page.onLoad();
  assert.strictEqual(page.data.role, 'student');
  assert.strictEqual(page.data.wrongCount, 10);
  assert.strictEqual(page.data.practiceCount, 2);
  assert.strictEqual(page.data.totalWords, 5);
  assert.strictEqual(page.data.tags.length, 6);
});

test('学生视图错词库只读同一份数据，可练习所选错词', function () {
  const page = instantiate(loadPage('pages/bank/bank.js'));
  page.onLoad();
  page.onShow();
  assert.strictEqual(page.data.role, 'student');
  assert.strictEqual(page.data.list.length, 10);
  page.onToggle({ currentTarget: { dataset: { id: 'r7a-u2-cousin' } } });
  assert.strictEqual(page.data.selectedCount, 1);
  page.onStartPractice();
  assert.strictEqual(lastUrl(), '/pages/practice/practice');
  assert.deepStrictEqual(storage['wordnest-practice-pending'], ['r7a-u2-cousin']);
});

test('练习记录页列出两次练习', function () {
  const page = instantiate(loadPage('pages/practice-history/practice-history.js'));
  page.onLoad();
  assert.strictEqual(page.data.list.length, 2);
  assert.strictEqual(page.data.list[1].sample, true);
});

test('缺失的记录显示空状态而不是报错', function () {
  state.setRole('parent');
  const page = instantiate(loadPage('pages/result/result.js'));
  page.onLoad({ id: 'not-exist' });
  assert.strictEqual(page.data.missing, true);
});

console.log('\n共 ' + passed + ' 项流程测试通过。');
