const state = require('../../utils/state');
const store = require('../../utils/store');
const words = require('../../utils/words');
const format = require('../../utils/format');

Page({
  data: {
    role: 'parent',
    students: [],
    activeChildId: '',
    missing: false,
    childName: '',
    dateText: '',
    modeText: '',
    sourceText: '',
    planned: 0,
    graded: 0,
    pending: 0,
    correct: 0,
    wrong: 0,
    accuracy: '0.0',
    added: 0,
    removed: 0,
    wrongTotal: 0,
    items: [],
    sample: false
  },

  onLoad(options) {
    const s = state.get();
    if (s.role !== 'parent') {
      wx.reLaunch({ url: '/pages/home/home' });
      return;
    }
    const child = state.child();
    const session = store.sessionById(child, options.id);
    if (!session) {
      this.setData({
        role: s.role,
        students: state.students(),
        activeChildId: child.id,
        missing: true
      });
      return;
    }

    const items = session.items.map(function (item) {
      const w = words.byId(item.wordId);
      return {
        id: item.wordId,
        en: w ? w.en : item.wordId,
        ipa: w ? w.ipa : '',
        zh: w ? w.zh : '',
        ok: item.result === 'correct'
      };
    });

    const graded = session.items.length;
    const stats = session.stats || { correct: 0, wrong: 0, added: 0, removed: 0 };

    this.setData({
      role: s.role,
      students: state.students(),
      activeChildId: child.id,
      childName: child.name,
      dateText: format.formatDateTime(session.finishedAt),
      modeText: format.modeLabel(session.mode, session.language),
      sourceText: session.source || '教材词表',
      planned: session.planned,
      graded: graded,
      pending: Math.max(0, session.planned - graded),
      correct: stats.correct,
      wrong: stats.wrong,
      accuracy: format.pct(stats.correct, graded),
      added: stats.added,
      removed: stats.removed,
      wrongTotal: Object.keys(child.wrong).length,
      items: items,
      sample: !!session.sample
    });
  },

  onStudentBank() {
    state.setRole('student');
    wx.reLaunch({ url: '/pages/bank/bank' });
  },

  onGoBank() {
    wx.reLaunch({ url: '/pages/bank/bank' });
  },

  onNewSetup() {
    wx.reLaunch({ url: '/pages/setup/setup' });
  },

  onHistory() {
    wx.reLaunch({ url: '/pages/history/history' });
  },

  onBack() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.reLaunch({ url: '/pages/history/history' });
  }
});
