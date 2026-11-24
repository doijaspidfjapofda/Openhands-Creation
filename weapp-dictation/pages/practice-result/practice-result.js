const state = require('../../utils/state');
const store = require('../../utils/store');
const words = require('../../utils/words');
const format = require('../../utils/format');

Page({
  data: {
    role: 'student',
    students: [],
    activeChildId: '',
    missing: false,
    childName: '',
    dateText: '',
    total: 0,
    independent: 0,
    hinted: 0,
    weak: 0,
    items: []
  },

  onLoad(options) {
    const s = state.get();
    if (s.role !== 'student') {
      wx.reLaunch({ url: '/pages/setup/setup' });
      return;
    }
    const child = state.child();
    const practice = store.practiceById(child, options.id);
    if (!practice) {
      this.setData({
        role: s.role,
        students: state.students(),
        activeChildId: child.id,
        missing: true
      });
      return;
    }

    const summary = store.practiceSummary(practice);
    const items = practice.items.map(function (item) {
      const w = words.byId(item.wordId);
      return {
        id: item.wordId,
        en: w ? w.en : item.wordId,
        answer: item.answer,
        correct: item.correct,
        usedHint: item.usedHint,
        label: item.correct ? (item.usedHint ? '提示后正确' : '独立正确') : '再巩固'
      };
    });

    this.setData({
      role: s.role,
      students: state.students(),
      activeChildId: child.id,
      childName: child.name,
      dateText: format.formatDateTime(practice.finishedAt),
      total: summary.total,
      independent: summary.independent,
      hinted: summary.hinted,
      weak: summary.weak,
      items: items
    });
  },

  onHome() {
    wx.reLaunch({ url: '/pages/home/home' });
  },

  onBank() {
    wx.reLaunch({ url: '/pages/bank/bank' });
  }
});
