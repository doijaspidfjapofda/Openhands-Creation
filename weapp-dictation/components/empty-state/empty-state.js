Component({
  options: {
    styleIsolation: 'apply-shared'
  },

  properties: {
    mark: { type: String, value: '✦' },
    title: { type: String, value: '' },
    desc: { type: String, value: '' },
    action: { type: String, value: '' },
    actionType: { type: String, value: 'secondary' }
  },

  methods: {
    onAction() {
      this.triggerEvent('action');
    }
  }
});
