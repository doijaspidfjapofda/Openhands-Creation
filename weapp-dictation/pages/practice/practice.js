const state = require('../../utils/state');
const store = require('../../utils/store');
const words = require('../../utils/words');

const PENDING_KEY = 'wordnest-practice-pending';

Page({
  data: {
    role: 'student',
    students: [],
    activeChildId: '',
    childName: '',
    index: 0,
    total: 0,
    word: null,
    hintText: '',
    usedHint: false,
    answer: '',
    feedback: null,
    progressPct: 0,
    focus: false,
    modal: '',
    modalTitle: '',
    modalDesc: '',
    modalActions: []
  },

  onLoad() {
    const s = state.get();
    if (s.role !== 'student') {
      wx.reLaunch({ url: '/pages/setup/setup' });
      return;
    }

    let ids = [];
    try {
      ids = wx.getStorageSync(PENDING_KEY) || [];
      wx.removeStorageSync(PENDING_KEY);
    } catch (e) {
      ids = [];
    }
    ids = (ids || []).filter(function (id) {
      return !!words.byId(id);
    });
    if (!ids.length) {
      wx.reLaunch({ url: '/pages/bank/bank' });
      return;
    }

    const child = state.child();
    this.ids = ids;
    this.items = [];
    this.startedAt = Date.now();

    this.setData({
      role: s.role,
      students: state.students(),
      activeChildId: child.id,
      childName: child.name,
      total: ids.length
    });
    this.renderWord(0);
  },

  onUnload() {
    if (!this._saved && this.items && this.items.length) {
      this.persist();
    }
  },

  renderWord(index) {
    const w = words.byId(this.ids[index]);
    this.setData({
      index: index,
      word: w,
      hintText: '',
      usedHint: false,
      answer: '',
      feedback: null,
      focus: false,
      progressPct: Math.round((index / this.ids.length) * 100)
    });
  },

  onInput(e) {
    this.setData({ answer: e.detail.value });
  },

  onHint() {
    const w = this.data.word;
    if (!w) return;
    const rest = [];
    for (let i = 1; i < w.en.length; i += 1) rest.push('_');
    this.setData({
      usedHint: true,
      hintText: w.en[0] + ' ' + rest.join(' '),
      focus: true
    });
  },

  onSubmit() {
    if (this.data.feedback) return;
    const value = String(this.data.answer || '').trim();
    if (!value) {
      wx.showToast({ title: '先写下你想到的英文单词', icon: 'none' });
      return;
    }
    const w = this.data.word;
    const correct = value.toLowerCase().replace(/\s+/g, ' ') === w.en.toLowerCase();
    this.items.push({
      wordId: w.id,
      answer: value,
      correct: correct,
      usedHint: this.data.usedHint
    });
    const title = correct
      ? this.data.usedHint
        ? '借助提示，想起来了'
        : '这次独立写对了！'
      : '再看一眼，把它记牢一点。';
    this.setData({ feedback: { correct: correct, answer: value, title: title } });
  },

  onNext() {
    if (!this.data.feedback) return;
    if (this.data.index >= this.ids.length - 1) {
      this.finish();
      return;
    }
    this.renderWord(this.data.index + 1);
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },

  buildPractice() {
    return {
      id: 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      childId: state.child().id,
      startedAt: this.startedAt,
      finishedAt: Date.now(),
      items: this.items.slice()
    };
  },

  persist() {
    if (this._saved || !this.items.length) return null;
    const practice = this.buildPractice();
    store.recordPractice(state.get(), practice);
    state.save();
    this._saved = true;
    return practice;
  },

  finish() {
    const practice = this.persist();
    if (!practice) return;
    wx.redirectTo({ url: '/pages/practice-result/practice-result?id=' + practice.id });
  },

  onExit() {
    if (!this.items.length) {
      this.leave();
      return;
    }
    this.openModal({
      title: '先结束这次练习？',
      desc: '已检查的答案会保存为练习记录。没有作答的词不计入结果，错词库不会因此移除单词。',
      actions: [
        { key: 'cancel', label: '继续练习', type: 'secondary' },
        { key: 'leave', label: '保存并离开', type: 'primary' }
      ]
    });
  },

  leave() {
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.reLaunch({ url: '/pages/home/home' });
  },

  openModal(conf) {
    this.setData({
      modal: 'practice',
      modalTitle: conf.title,
      modalDesc: conf.desc,
      modalActions: conf.actions
    });
  },

  closeModal() {
    this.setData({ modal: '' });
  },

  onModalAction(e) {
    const key = e.detail.key;
    if (key === 'cancel') {
      this.closeModal();
      return;
    }
    if (key === 'leave') {
      this.persist();
      this.closeModal();
      this.leave();
    }
  }
});
