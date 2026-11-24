const store = require('../../utils/store');
const state = require('../../utils/state');

const MODALS = {
  more: {
    title: '原型选项',
    desc: '这是本地交互原型：数据只保存在当前设备，不连接真实账号与云端。',
    actions: [
      { key: 'guide', label: '原型体验说明', type: 'secondary' },
      { key: 'reset-ask', label: '重置演示数据', type: 'danger' },
      { key: 'cancel', label: '关闭', type: 'ghost' }
    ]
  },
  guide: {
    title: '从选词到错词复习',
    desc:
      '① 家长视图选择教材与单词，开始听写。\n' +
      '② 手动模式逐词播报并批改；自动模式先连续播报，再集中批改。\n' +
      '③ 切换学生视图，在“我的错词”里做自主拼写练习。\n' +
      '④ 下次家长听写写对后，词才会移出错词库。\n\n' +
      '演示词表、语音与数据均为原型内容，不代表正式教材与正式能力。',
    actions: [{ key: 'close', label: '知道了', type: 'primary' }]
  },
  reset: {
    title: '重置全部演示数据？',
    desc: '将清除本机原型中的听写、练习和新增学生档案，恢复“小禾”的初始演示记录。',
    actions: [
      { key: 'cancel', label: '取消', type: 'secondary' },
      { key: 'reset', label: '确认重置', type: 'danger' }
    ]
  },
  add: {
    title: '添加学生档案',
    desc: '每个孩子的听写记录和错词库分别保存，最多添加 3 个。',
    actions: [
      { key: 'cancel', label: '取消', type: 'secondary' },
      { key: 'save', label: '创建档案', type: 'primary' }
    ],
    input: true
  }
};

Component({
  properties: {
    role: { type: String, value: 'parent' },
    students: { type: Array, value: [] },
    activeId: { type: String, value: '' },
    lockSwitch: { type: Boolean, value: false }
  },

  data: {
    childName: '',
    childInitial: '禾',
    childIndex: 0,
    studentNames: [],
    modal: '',
    modalTitle: '',
    modalDesc: '',
    modalActions: [],
    modalInput: false,
    newName: '',
    error: ''
  },

  observers: {
    'students, activeId': function (students, activeId) {
      const list = students || [];
      let index = 0;
      list.forEach(function (s, i) {
        if (s.id === activeId) index = i;
      });
      const current = list[index] || { name: '' };
      this.setData({
        studentNames: list.map(function (s) { return s.name; }),
        childIndex: index,
        childName: current.name,
        childInitial: current.name ? current.name.slice(-1) : '禾'
      });
    }
  },

  methods: {
    guard() {
      if (this.data.lockSwitch) {
        wx.showToast({ title: '当前流程进行中，请先完成或返回', icon: 'none' });
        return false;
      }
      return true;
    },

    onRole(e) {
      const role = e.currentTarget.dataset.role;
      if (role === this.data.role) return;
      if (!this.guard()) return;
      state.setRole(role);
      wx.reLaunch({ url: state.roleHome(role) });
    },

    onBrand() {
      if (!this.guard()) return;
      wx.reLaunch({ url: state.roleHome(this.data.role) });
    },

    onChild(e) {
      if (!this.guard()) return;
      const item = this.data.students[Number(e.detail.value)];
      if (!item || item.id === this.data.activeId) return;
      state.setChild(item.id);
      wx.reLaunch({ url: state.roleHome(this.data.role) });
    },

    onAdd() {
      if (!this.guard()) return;
      if (this.data.students.length >= 3) {
        wx.showToast({ title: '最多 3 个学生档案', icon: 'none' });
        return;
      }
      this.openModal('add');
    },

    onMore() {
      if (!this.guard()) return;
      this.openModal('more');
    },

    openModal(type) {
      const conf = MODALS[type];
      if (!conf) return;
      this.setData({
        modal: type,
        modalTitle: conf.title,
        modalDesc: conf.desc,
        modalActions: conf.actions,
        modalInput: !!conf.input,
        newName: '',
        error: ''
      });
    },

    closeModal() {
      this.setData({ modal: '', error: '' });
    },

    onModalInput(e) {
      this.setData({ newName: e.detail.value, error: '' });
    },

    onModalAction(e) {
      const key = e.detail.key;

      if (key === 'cancel' || key === 'close') {
        this.closeModal();
        return;
      }

      if (this.data.modal === 'add') {
        if (key !== 'save') return;
        const result = store.addChild(state.get(), this.data.newName);
        if (!result.ok) {
          this.setData({ error: result.error });
          return;
        }
        state.save();
        this.closeModal();
        wx.showToast({ title: '已创建独立档案', icon: 'none' });
        setTimeout(function () {
          wx.reLaunch({ url: state.roleHome(state.get().role) });
        }, 300);
        return;
      }

      if (key === 'guide') {
        this.openModal('guide');
        return;
      }

      if (key === 'reset-ask') {
        this.openModal('reset');
        return;
      }

      if (key === 'reset') {
        state.reset();
        this.closeModal();
        wx.showToast({ title: '已恢复初始演示数据', icon: 'none' });
        setTimeout(function () {
          wx.reLaunch({ url: '/pages/setup/setup' });
        }, 300);
      }
    }
  }
});
