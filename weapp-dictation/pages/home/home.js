const state = require('../../utils/state');
const store = require('../../utils/store');

const PENDING_KEY = 'wordnest-practice-pending';

Page({
  data: {
    role: 'student',
    students: [],
    activeChildId: '',
    childName: '',
    wrongCount: 0,
    practiceCount: 0,
    totalWords: 0,
    tags: []
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
    const wrong = store.wrongList(child);
    const total = child.practice.reduce(function (n, p) {
      return n + p.items.length;
    }, 0);

    this.setData({
      role: s.role,
      students: state.students(),
      activeChildId: child.id,
      childName: child.name,
      wrongCount: wrong.length,
      practiceCount: child.practice.length,
      totalWords: total,
      tags: wrong.slice(0, 6).map(function (r) {
        return r.word.en;
      })
    });
  },

  onPracticeAll() {
    const ids = store.wrongList(state.child()).map(function (r) {
      return r.word.id;
    });
    if (!ids.length) {
      wx.reLaunch({ url: '/pages/bank/bank' });
      return;
    }
    try {
      wx.setStorageSync(PENDING_KEY, ids);
    } catch (e) {
      wx.showToast({ title: '本地存储不可用，无法开始练习', icon: 'none' });
      return;
    }
    wx.navigateTo({ url: '/pages/practice/practice' });
  },

  onMainAction() {
    if (this.data.wrongCount) this.onPracticeAll();
    else this.onGoBank();
  },

  onGoBank() {
    wx.reLaunch({ url: '/pages/bank/bank' });
  }
});
