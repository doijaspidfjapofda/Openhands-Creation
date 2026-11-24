const PARENT_ITEMS = [
  { key: 'setup', label: '教材听写', url: '/pages/setup/setup' },
  { key: 'bank', label: '错词库', url: '/pages/bank/bank' },
  { key: 'history', label: '听写记录', url: '/pages/history/history' }
];

const STUDENT_ITEMS = [
  { key: 'home', label: '今日复习', url: '/pages/home/home' },
  { key: 'bank', label: '我的错词', url: '/pages/bank/bank' },
  { key: 'practice-history', label: '练习记录', url: '/pages/practice-history/practice-history' }
];

Component({
  properties: {
    role: { type: String, value: 'parent' },
    current: { type: String, value: '' }
  },

  data: {
    items: PARENT_ITEMS
  },

  observers: {
    role: function (role) {
      this.setData({ items: role === 'student' ? STUDENT_ITEMS : PARENT_ITEMS });
    }
  },

  lifetimes: {
    attached() {
      this.setData({ items: this.data.role === 'student' ? STUDENT_ITEMS : PARENT_ITEMS });
    }
  },

  methods: {
    onTap(e) {
      const item = this.data.items[Number(e.currentTarget.dataset.index)];
      if (!item || item.key === this.data.current) return;
      wx.reLaunch({ url: item.url });
    }
  }
});
