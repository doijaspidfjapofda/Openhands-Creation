const state = require('../../utils/state');
const store = require('../../utils/store');
const format = require('../../utils/format');

const PENDING_KEY = 'wordnest-practice-pending';

Page({
  data: {
    role: 'parent',
    students: [],
    activeChildId: '',
    childName: '',
    list: [],
    selectedCount: 0,
    allSelected: false,
    language: 'zh',
    mode: 'manual',
    draft: null,
    modal: '',
    modalTitle: '',
    modalDesc: '',
    modalActions: []
  },

  onLoad() {
    this.selectedMap = {};
  },

  onShow() {
    this.load();
  },

  load() {
    const s = state.get();
    const child = state.child();
    const list = store.wrongList(child).map((record) => {
      const w = record.word;
      return {
        id: w.id,
        en: w.en,
        ipa: w.ipa,
        zh: w.zh,
        unit: w.unit,
        count: record.count,
        practiceCount: record.practiceCount || 0,
        selected: !!this.selectedMap[w.id],
        word: w
      };
    });

    const valid = {};
    list.forEach((item) => {
      if (this.selectedMap[item.id]) valid[item.id] = true;
    });
    this.selectedMap = valid;

    const selectedCount = Object.keys(valid).length;
    const draft = child.draft;

    this.setData({
      role: s.role,
      students: state.students(),
      activeChildId: child.id,
      childName: child.name,
      list: list,
      selectedCount: selectedCount,
      allSelected: list.length > 0 && selectedCount === list.length,
      draft: draft
        ? {
            graded: store.draftStats(draft).graded,
            total: draft.items.length,
            modeText: format.modeLabel(draft.mode, draft.language)
          }
        : null
    });
  },

  onToggle(e) {
    const id = e.currentTarget.dataset.id;
    if (this.selectedMap[id]) delete this.selectedMap[id];
    else this.selectedMap[id] = true;
    this.load();
  },

  onSelectAll() {
    const all = this.data.allSelected;
    const map = {};
    if (!all) {
      this.data.list.forEach((item) => {
        map[item.id] = true;
      });
    }
    this.selectedMap = map;
    this.load();
  },

  onLanguage(e) {
    this.setData({ language: e.currentTarget.dataset.lang });
  },

  onMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode });
  },

  selectedIds() {
    return Object.keys(this.selectedMap);
  },

  onStartDictation() {
    const ids = this.selectedIds();
    if (!ids.length) {
      wx.showToast({ title: '先选择需要再听写的错词', icon: 'none' });
      return;
    }
    const child = state.child();
    if (child.draft) {
      this.openModal({
        title: '还有一份听写未完成',
        desc: '请先继续完成原来的听写，或放弃它之后再开始新的。',
        actions: [
          { key: 'cancel', label: '返回', type: 'secondary' },
          { key: 'resume', label: '继续原听写', type: 'primary' }
        ]
      });
      return;
    }
    const result = store.startDraft(state.get(), {
      childId: child.id,
      wordIds: ids,
      mode: this.data.mode,
      language: this.data.language,
      order: 'ordered',
      source: '错词复听写'
    });
    if (!result.ok) {
      wx.showToast({ title: '暂时无法开始，请稍后再试', icon: 'none' });
      return;
    }
    state.save();
    wx.navigateTo({ url: '/pages/session/session' });
  },

  onStartPractice() {
    const ids = this.selectedIds();
    if (!ids.length) {
      wx.showToast({ title: '先选择需要练习的错词', icon: 'none' });
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

  onEmptyAction() {
    wx.reLaunch({
      url: this.data.role === 'student' ? '/pages/home/home' : '/pages/setup/setup'
    });
  },

  onResumeDraft() {
    this.closeModal();
    wx.navigateTo({ url: '/pages/session/session' });
  },

  openModal(conf) {
    this.setData({
      modal: 'bank',
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
    if (key === 'resume') this.onResumeDraft();
  }
});
