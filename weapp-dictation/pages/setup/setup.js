const state = require('../../utils/state');
const store = require('../../utils/store');
const words = require('../../utils/words');
const format = require('../../utils/format');

const MODALS = {
  draft: {
    title: '还有一份听写未完成',
    desc: '可以先继续原来的听写，或放弃它再开始新的。已保存的历史记录不会受影响。',
    actions: [
      { key: 'cancel', label: '返回', type: 'secondary' },
      { key: 'resume', label: '继续原听写', type: 'primary' }
    ]
  },
  discard: {
    title: '放弃这次未完成的听写？',
    desc: '本次尚未保存的批改会被清除，历史听写记录和已有错词库保持原样。',
    actions: [
      { key: 'cancel', label: '继续保留', type: 'secondary' },
      { key: 'confirm-discard', label: '放弃本次听写', type: 'danger' }
    ]
  }
};

Page({
  data: {
    role: 'parent',
    students: [],
    activeChildId: '',
    childName: '',
    grade: '七年级',
    term: '上册',
    version: '人教',
    unit: 0,
    gradeOptions: [],
    termOptions: [],
    versionOptions: [],
    unitOptions: [],
    gradeIndex: 0,
    termIndex: 0,
    versionIndex: 0,
    query: '',
    list: [],
    selectedCount: 0,
    allSelected: false,
    mode: 'manual',
    language: 'zh',
    orderOptions: ['按教材顺序', '随机打乱'],
    orderIndex: 0,
    draft: null,
    modal: '',
    modalTitle: '',
    modalDesc: '',
    modalActions: []
  },

  onLoad() {
    const child = state.child();
    this.selectedMap = {};
    this.setData({
      grade: child.grade,
      term: child.term,
      version: child.version,
      unit: child.currentUnit || 0
    });
    this.buildOptions();

    const initial = words.filterWords({
      version: child.version,
      grade: child.grade,
      term: child.term,
      unit: child.currentUnit || 0
    });
    initial.forEach((w) => {
      this.selectedMap[w.id] = true;
    });

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
    const draft = child.draft;
    this.setData({
      role: s.role,
      students: state.students(),
      activeChildId: child.id,
      childName: child.name,
      draft: draft
        ? {
            graded: store.draftStats(draft).graded,
            total: draft.items.length,
            modeText: format.modeLabel(draft.mode, draft.language)
          }
        : null
    });
    this.refreshList();
  },

  currentFilters() {
    return {
      version: this.data.version,
      grade: this.data.grade,
      term: this.data.term,
      unit: this.data.unit,
      query: this.data.query
    };
  },

  buildOptions() {
    const grades = words.grades();
    let grade = this.data.grade;
    if (grades.indexOf(grade) < 0) grade = grades[0];

    const terms = words.termsFor(grade);
    let term = this.data.term;
    if (terms.indexOf(term) < 0) term = terms[0];

    const versions = words.versionsFor(grade, term);
    let version = this.data.version;
    if (versions.indexOf(version) < 0) version = versions[0];

    const units = words.unitsFor(version, grade, term);
    let unit = this.data.unit;
    if (units.indexOf(unit) < 0) unit = 0;

    this.setData({
      grade: grade,
      term: term,
      version: version,
      unit: unit,
      gradeOptions: grades,
      termOptions: terms,
      versionOptions: versions,
      unitOptions: [{ value: 0, label: '全部单元' }].concat(
        units.map(function (u) {
          return { value: u, label: 'Unit ' + u };
        })
      ),
      gradeIndex: grades.indexOf(grade),
      termIndex: terms.indexOf(term),
      versionIndex: versions.indexOf(version)
    });
  },

  refreshList() {
    const child = state.child();
    const filters = this.currentFilters();
    const list = words.filterWords(filters).map((w) => {
      return {
        id: w.id,
        en: w.en,
        ipa: w.ipa,
        zh: w.zh,
        unit: w.unit,
        selected: !!this.selectedMap[w.id],
        isWrong: !!child.wrong[w.id],
        word: w
      };
    });

    const selectedIds = Object.keys(this.selectedMap).filter(function (id) {
      return !!words.byId(id);
    });
    const allSelected = list.length > 0 && list.every((item) => item.selected);

    this.setData({
      list: list,
      selectedCount: selectedIds.length,
      allSelected: allSelected
    });
  },

  saveFilters() {
    const child = state.child();
    child.grade = this.data.grade;
    child.term = this.data.term;
    child.version = this.data.version;
    child.currentUnit = this.data.unit;
    state.save();
  },

  onGrade(e) {
    const grade = this.data.gradeOptions[Number(e.detail.value)];
    this.setData({ grade: grade, term: '', version: '', unit: 0 });
    this.buildOptions();
    this.saveFilters();
    this.refreshList();
  },

  onTerm(e) {
    const term = this.data.termOptions[Number(e.detail.value)];
    this.setData({ term: term, version: '', unit: 0 });
    this.buildOptions();
    this.saveFilters();
    this.refreshList();
  },

  onVersion(e) {
    const version = this.data.versionOptions[Number(e.detail.value)];
    this.setData({ version: version, unit: 0 });
    this.buildOptions();
    this.saveFilters();
    this.refreshList();
  },

  onUnit(e) {
    this.setData({ unit: Number(e.currentTarget.dataset.value) });
    this.saveFilters();
    this.refreshList();
  },

  onSearch(e) {
    this.setData({ query: e.detail.value });
    this.refreshList();
  },

  onToggleWord(e) {
    const id = e.currentTarget.dataset.id;
    if (this.selectedMap[id]) delete this.selectedMap[id];
    else this.selectedMap[id] = true;
    this.refreshList();
  },

  onSelectAll() {
    const list = words.filterWords(this.currentFilters());
    const all = list.length > 0 && list.every((w) => !!this.selectedMap[w.id]);
    const map = this.selectedMap;
    list.forEach((w) => {
      if (all) delete map[w.id];
      else map[w.id] = true;
    });
    this.refreshList();
  },

  onClear() {
    this.selectedMap = {};
    this.refreshList();
  },

  onMode(e) {
    this.setData({ mode: e.currentTarget.dataset.mode });
  },

  onLanguage(e) {
    this.setData({ language: e.currentTarget.dataset.lang });
  },

  onOrder(e) {
    this.setData({ orderIndex: Number(e.detail.value) });
  },

  onStart() {
    const ids = Object.keys(this.selectedMap).filter(function (id) {
      return !!words.byId(id);
    });
    if (!ids.length) {
      wx.showToast({ title: '先选择至少一个单词', icon: 'none' });
      return;
    }
    const child = state.child();
    if (child.draft) {
      this.openModal('draft');
      return;
    }
    const result = store.startDraft(state.get(), {
      childId: child.id,
      wordIds: ids,
      mode: this.data.mode,
      language: this.data.language,
      order: this.data.orderIndex === 1 ? 'random' : 'ordered',
      source: '教材词表'
    });
    if (!result.ok) {
      wx.showToast({ title: '暂时无法开始，请稍后再试', icon: 'none' });
      return;
    }
    state.save();
    wx.navigateTo({ url: '/pages/session/session' });
  },

  onResume() {
    this.closeModal();
    wx.navigateTo({ url: '/pages/session/session' });
  },

  onAskDiscard() {
    this.openModal('discard');
  },

  openModal(type) {
    const conf = MODALS[type];
    if (!conf) return;
    this.setData({
      modal: type,
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
    if (key === 'resume') {
      this.onResume();
      return;
    }
    if (key === 'confirm-discard') {
      store.discardDraft(state.get());
      state.save();
      this.closeModal();
      this.load();
      wx.showToast({ title: '已放弃这次听写', icon: 'none' });
    }
  }
});
