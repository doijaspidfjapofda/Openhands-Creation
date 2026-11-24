const audio = require('../../utils/audio');

Component({
  properties: {
    word: { type: Object, value: null },
    language: { type: String, value: 'en' },
    label: { type: String, value: '♪' }
  },

  data: {
    playing: false
  },

  lifetimes: {
    detached() {
      if (this._timer) clearTimeout(this._timer);
    }
  },

  methods: {
    onTap() {
      const word = this.data.word;
      if (!word || !word.id) return;
      const that = this;
      if (this._timer) clearTimeout(this._timer);

      audio.playWord(word, this.data.language, {
        onStart(mode, ms) {
          that.setData({ playing: true });
          if (mode === 'demo' && !that._hintShown) {
            that._hintShown = true;
            wx.showToast({ title: '演示占位：未接入真实语音', icon: 'none', duration: 1500 });
          }
          that._timer = setTimeout(function () {
            that.setData({ playing: false });
          }, ms || 1200);
        },
        onEnd() {
          that.setData({ playing: false });
        }
      });
    }
  }
});
