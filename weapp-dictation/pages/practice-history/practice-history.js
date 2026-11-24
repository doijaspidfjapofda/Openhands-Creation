const state = require('../../utils/state');
const store = require('../../utils/store');
const format = require('../../utils/format');

Page({
  data: {
    role: 'student',
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
    if (s.role !== 'student') {
      wx.reLaunch({ url: '/pages/setup/setup' });
      return;
    }
    const child = state.child();
    const list = child.practice.map(function (practice) {
      const summary = store.practiceSummary(practice);
      return {
        id: practice.id,
        dateText: format.formatDateTime(practice.finishedAt),
        total: summary.total,
        independent: summary.independent,
        sample: practice.id.indexOf('demo-') === 0
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
    wx.navigateTo({ url: '/pages/practice-result/practice-result?id=' + e.currentTarget.dataset.id });
  },

  onBank() {
    wx.reLaunch({ url: '/pages/bank/bank' });
  }
});
