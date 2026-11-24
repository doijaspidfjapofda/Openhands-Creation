const state = require('../../utils/state');
const format = require('../../utils/format');

Page({
  data: {
    role: 'parent',
    students: [],
    activeChildId: '',
    childName: '',
    list: []
  },

  onLoad() {
    this.load();
  },

  onShow() {
    this.load();
  },

  load() {
    const s = state.get();
    if (s.role === 'student') {
      wx.reLaunch({ url: '/pages/home/home' });
      return;
    }
    const child = state.child();
    const list = child.history.map(function (session) {
      const graded = session.items.length;
      const stats = session.stats || { correct: 0 };
      return {
        id: session.id,
        title: (session.source || '教材词表') + ' · ' + format.modeLabel(session.mode, session.language),
        dateText: format.formatDateTime(session.finishedAt),
        graded: graded,
        correct: stats.correct,
        wrong: graded - stats.correct,
        pending: Math.max(0, session.planned - graded),
        sample: !!session.sample
      };
    });

    this.setData({
      role: s.role,
      students: state.students(),
      activeChildId: child.id,
      childName: child.name,
      list: list
    });
  },

  onOpen(e) {
    wx.navigateTo({ url: '/pages/result/result?id=' + e.currentTarget.dataset.id });
  },

  onNew() {
    wx.reLaunch({ url: '/pages/setup/setup' });
  }
});
