Component({
  properties: {
    visible: { type: null, value: false },
    title: { type: String, value: '' },
    desc: { type: String, value: '' },
    actions: { type: Array, value: [] },
    input: { type: Boolean, value: false },
    inputValue: { type: String, value: '' },
    placeholder: { type: String, value: '' },
    error: { type: String, value: '' },
    maskClosable: { type: Boolean, value: true }
  },

  methods: {
    onAction(e) {
      this.triggerEvent('action', { key: e.currentTarget.dataset.key });
    },

    onInput(e) {
      this.triggerEvent('input', { value: e.detail.value });
    },

    onMask() {
      if (this.data.maskClosable) this.triggerEvent('action', { key: 'cancel' });
    },

    noop() {}
  }
});
