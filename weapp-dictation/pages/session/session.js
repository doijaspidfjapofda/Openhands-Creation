const state = require('../../utils/state');
const store = require('../../utils/store');
const words = require('../../utils/words');
const audio = require('../../utils/audio');
const format = require('../../utils/format');

Page({
  data: {
    role: 'parent',
    students: [],
    activeChildId: '',
    childName: '',
    isAuto: false,
    modeText: '',
    languageLabel: '中文提示 → 英文拼写',
    phase: 'grade',
    index: 0,
    total: 0,
    word: null,
    reveal: false,
    results: [],
    marked: 0,
    correct: 0,
    wrong: 0,
    currentState: '',
    progressPct: 0,
    intervalSec: 5,
    playing: false,
    paused: false,
    waitLeft: 0,
    audioStatus: '点击播放，等孩子写完',
    audioDemo: false,
    isLast: false,
    modal: '',
    modalTitle: '',
    modalDesc: '',
    modalActions: []
  },

  onLoad() {
    const s = state.get();
    if (s.role !== 'parent') {
      wx.reLaunch({ url: '/pages/home/home' });
      return;
    }
    const child = state.child();
    const draft = child.draft;
    if (!draft) {
      wx.reLaunch({ url: '/pages/setup/setup' });
      return;
    }
    this.setData({
      role: s.role,
      students: state.students(),
      activeChildId: child.id,
      childName: child.name,
      isAuto: draft.mode === 'auto',
      modeText: format.modeLabel(draft.mode, draft.language),
      languageLabel: draft.language === 'en' ? '英文发音 → 英文拼写' : '中文提示 → 英文拼写',
      intervalSec: draft.intervalSec,
      phase: draft.phase,
      reveal: draft.mode !== 'auto',
      audioStatus:
        draft.phase === 'playing'
          ? '正在播报…'
          : draft.phase === 'grade'
            ? '对照纸面答案，标记这一词'
            : '等待开始'
    });
    this.refresh();
  },

  onShow() {
    if (this.data.total) this.refresh();
  },

  onHide() {
    if (this.data.phase === 'playing') {
      this.onPause();
    }
  },

  onUnload() {
    this.cleanupAudio();
    const child = state.child();
    const draft = child && child.draft;
    if (draft && draft.phase === 'playing') {
      draft.phase = 'ready';
      state.save();
    }
  },

  cleanupAudio() {
    audio.stop();
    this.clearCountdown();
  },

  refresh() {
    const child = state.child();
    const draft = child && child.draft;
    if (!draft) return;
    const item = draft.items[draft.index];
    const word = words.byId(item.wordId);
    const stats = store.draftStats(draft);
    const results = draft.items.map(function (it, i) {
      return {
        no: i + 1,
        state: it.result || '',
        current: i === draft.index
      };
    });

    this.setData({
      index: draft.index,
      total: draft.items.length,
      word: word,
      phase: draft.phase,
      results: results,
      marked: stats.graded,
      correct: stats.correct,
      wrong: stats.wrong,
      currentState: item.result || '',
      progressPct: draft.items.length
        ? Math.round((stats.graded / draft.items.length) * 100)
        : 0,
      isLast: draft.index === draft.items.length - 1
    });
  },

  /* ---------- 手动 / 集中批改 ---------- */

  onPlay() {
    const draft = state.child().draft;
    if (!draft || !this.data.word) return;
    const that = this;
    audio.playWord(this.data.word, draft.language, {
      onStart(mode, ms) {
        that.setData({
          audioDemo: mode === 'demo',
          audioStatus:
            mode === 'demo'
              ? '演示占位 · 无真实语音（约 ' + (ms / 1000).toFixed(1) + ' 秒）'
              : '正在播报 · 可点击重播'
        });
      },
      onEnd() {
        that.setData({
          audioStatus: that.data.isAuto ? '播报结束 · 对照纸面答案批改' : '播报结束 · 等孩子写好后标记'
        });
      }
    });
  },

  onToggleAnswer() {
    this.setData({ reveal: !this.data.reveal });
  },

  onMark(e) {
    const result = e.currentTarget.dataset.result;
    const draft = store.markDraft(state.get(), result);
    if (!draft) return;
    state.save();
    const stats = store.draftStats(draft);

    if (draft.index >= draft.items.length - 1) {
      this.refresh();
      this.afterLastMark(stats);
      return;
    }

    draft.index += 1;
    state.save();
    this.cleanupAudio();
    this.setData({
      reveal: true,
      audioStatus: '对照纸面答案，标记这一词'
    });
    this.refresh();
  },

  onClearMark() {
    store.markDraft(state.get(), null, this.data.index);
    state.save();
    this.refresh();
  },

  onGridTap(e) {
    if (this.data.phase !== 'grade') {
      wx.showToast({ title: '先结束自动播报，再逐词批改', icon: 'none' });
      return;
    }
    const index = Number(e.currentTarget.dataset.index);
    this.jumpTo(index);
  },

  jumpTo(index) {
    const draft = store.goTo(state.get(), index);
    if (!draft) return;
    state.save();
    this.cleanupAudio();
    this.setData({
      reveal: true,
      audioStatus: '对照纸面答案，标记这一词'
    });
    this.refresh();
  },

  onPrev() {
    if (this.data.index > 0) this.jumpTo(this.data.index - 1);
  },

  onNext() {
    if (this.data.index < this.data.total - 1) this.jumpTo(this.data.index + 1);
    else this.onFinishTap();
  },

  afterLastMark(stats) {
    if (stats.pending > 0) {
      this.openPending(stats);
      return;
    }
    this.openModal({
      title: '最后一个词也批改完了',
      desc: '现在完成并查看结果吗？完成后会保存本次批改，并按最终标记更新错词库。',
      actions: [
        { key: 'cancel', label: '再检查一下', type: 'secondary' },
        { key: 'finish', label: '完成并查看结果', type: 'primary' }
      ]
    });
  },

  openPending(stats) {
    const pending = stats.pending;
    const graded = stats.graded;
    this.openModal({
      title: '还有 ' + pending + ' 个词未批改',
      desc:
        '未批改的词不能默认算对。可以返回补齐；如果本次提前结束，只保存已经批改的 ' +
        graded +
        ' 个词，其他词不改变错词库。',
      actions: [
        { key: 'cancel', label: '继续批改', type: 'secondary' },
        {
          key: 'finish-partial',
          label: graded ? '仅保存已批改的 ' + graded + ' 个' : '没有可保存的批改',
          type: 'primary'
        }
      ]
    });
  },

  onFinishTap() {
    if (this.data.phase !== 'grade') {
      wx.showToast({ title: '先结束自动播报，再完成批改', icon: 'none' });
      return;
    }
    const draft = state.child().draft;
    if (!draft) return;
    const stats = store.draftStats(draft);
    if (stats.pending > 0) {
      this.openPending(stats);
      return;
    }
    this.finish(false);
  },

  finish(partial) {
    const result = store.finishDraft(state.get(), { partial: partial });
    if (!result.ok) {
      if (result.error === 'PENDING') {
        this.openPending({ pending: result.pending, graded: result.graded });
        return;
      }
      wx.showToast({ title: '还没有批改任何单词', icon: 'none' });
      return;
    }
    state.save();
    this.cleanupAudio();
    wx.redirectTo({ url: '/pages/result/result?id=' + result.session.id });
  },

  /* ---------- 自动听写 ---------- */

  onInterval(e) {
    const value = Number(e.detail.value);
    const draft = state.child().draft;
    if (!draft) return;
    draft.intervalSec = value;
    state.save();
    this.setData({ intervalSec: value });
  },

  onStartAuto() {
    const draft = state.child().draft;
    if (!draft) return;
    draft.phase = 'playing';
    state.save();
    this.setData({
      phase: 'playing',
      playing: true,
      paused: false,
      waitLeft: 0,
      reveal: false
    });
    this.refresh();
    this.playAuto();
  },

  playAuto() {
    if (!this.data.playing || this.data.paused) return;
    const draft = state.child().draft;
    if (!draft) return;
    const item = draft.items[draft.index];
    const word = words.byId(item.wordId);
    const that = this;

    this.setData({ audioStatus: '正在播报…' });
    audio.playWord(word, draft.language, {
      onStart(mode, ms) {
        that.setData({
          audioDemo: mode === 'demo',
          audioStatus:
            mode === 'demo'
              ? '演示占位 · 无真实语音（约 ' + (ms / 1000).toFixed(1) + ' 秒）'
              : '正在播报…'
        });
      },
      onEnd() {
        if (!that.data.playing || that.data.paused) return;
        that.afterSpeak();
      }
    });
  },

  afterSpeak() {
    const draft = state.child().draft;
    if (!draft) return;
    if (draft.index >= draft.items.length - 1) {
      this.finishPlayback();
      return;
    }
    this.startCountdown(draft.intervalSec);
  },

  startCountdown(seconds) {
    const that = this;
    this.clearCountdown();
    this.setData({ waitLeft: seconds, audioStatus: '间隔 ' + seconds + ' 秒后播放下一个词' });

    this._countdown = setInterval(function () {
      const left = that.data.waitLeft - 1;
      if (left > 0) {
        that.setData({ waitLeft: left, audioStatus: '间隔 ' + left + ' 秒后播放下一个词' });
        return;
      }
      that.clearCountdown();
      const draft = state.child().draft;
      if (!draft || !that.data.playing || that.data.paused) return;
      if (draft.index < draft.items.length - 1) {
        draft.index += 1;
        state.save();
        that.setData({ waitLeft: 0 });
        that.refresh();
        that.playAuto();
      }
    }, 1000);
  },

  clearCountdown() {
    if (this._countdown) {
      clearInterval(this._countdown);
      this._countdown = null;
    }
  },

  onPause() {
    if (!this.data.playing) return;
    audio.stop();
    this.clearCountdown();
    this.setData({ paused: true, waitLeft: 0, audioStatus: '已暂停 · 继续时会重播当前词' });
  },

  onResumePlay() {
    if (!this.data.playing) return;
    this.setData({ paused: false, audioStatus: '继续播报…' });
    this.playAuto();
  },

  onPulse() {
    if (this.data.paused) this.onResumePlay();
    else this.onPause();
  },

  onSkip() {
    const draft = state.child().draft;
    if (!draft) return;
    audio.stop();
    this.clearCountdown();
    if (draft.index >= draft.items.length - 1) {
      this.finishPlayback();
      return;
    }
    draft.index += 1;
    state.save();
    this.setData({ paused: false, waitLeft: 0 });
    this.refresh();
    this.playAuto();
  },

  onEndEarly() {
    this.finishPlayback();
  },

  finishPlayback() {
    audio.stop();
    this.clearCountdown();
    const draft = state.child().draft;
    if (!draft) return;
    draft.phase = 'finished';
    state.save();
    this.setData({
      phase: 'finished',
      playing: false,
      paused: false,
      waitLeft: 0,
      audioStatus: '播报结束'
    });
    this.refresh();
  },

  onStartGrade() {
    const draft = state.child().draft;
    if (!draft) return;
    draft.phase = 'grade';
    draft.index = 0;
    state.save();
    this.setData({
      phase: 'grade',
      reveal: true,
      audioStatus: '对照纸面答案，标记这一词'
    });
    this.refresh();
  },

  /* ---------- 通用 ---------- */

  onBack() {
    this.cleanupAudio();
    const child = state.child();
    const draft = child && child.draft;
    if (draft && draft.phase === 'playing') {
      draft.phase = 'ready';
      state.save();
    }
    const pages = getCurrentPages();
    if (pages.length > 1) wx.navigateBack();
    else wx.reLaunch({ url: '/pages/setup/setup' });
  },

  openModal(conf) {
    this.setData({
      modal: 'session',
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
    if (key === 'finish') {
      this.closeModal();
      this.finish(false);
      return;
    }
    if (key === 'finish-partial') {
      this.closeModal();
      this.finish(true);
    }
  }
});
