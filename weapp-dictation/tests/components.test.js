// 组件行为测试：用最小运行时验证顶部栏、弹窗、底栏、空状态的事件与守卫。
const assert = require('assert');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const storage = {};
const nav = [];
const toasts = [];
let compConfig = null;
let passed = 0;

global.wx = {
  getStorageSync: function (k) {
    return storage[k];
  },
  setStorageSync: function (k, v) {
    storage[k] = v;
  },
  removeStorageSync: function (k) {
    delete storage[k];
  },
  showToast: function (o) {
    toasts.push(o.title);
  },
  reLaunch: function (o) {
    nav.push(o.url);
  },
  navigateTo: function () {},
  redirectTo: function () {},
  navigateBack: function () {},
  createInnerAudioContext: function () {
    return {
      play: function () {},
      stop: function () {},
      onEnded: function () {},
      offEnded: function () {},
      onError: function () {},
      offError: function () {}
    };
  }
};

global.Component = function (conf) {
  compConfig = conf;
};
global.Page = function () {};
global.App = function () {};
global.getApp = function () {
  return { globalData: {} };
};
global.getCurrentPages = function () {
  return [{}, {}];
};

function loadComponent(rel) {
  const file = path.join(ROOT, rel);
  delete require.cache[require.resolve(file)];
  compConfig = null;
  require(file);
  assert.ok(compConfig, 'Component() 未被调用: ' + rel);
  return compConfig;
}

function instantiate(conf, props) {
  const inst = { events: [] };
  inst.data = JSON.parse(JSON.stringify(conf.data || {}));
  Object.keys(conf.properties || {}).forEach(function (k) {
    inst.data[k] = conf.properties[k].value;
  });
  Object.assign(inst.data, props || {});
  Object.keys(conf.methods || {}).forEach(function (k) {
    inst[k] = conf.methods[k];
  });
  inst.setData = function (patch) {
    Object.keys(patch).forEach(function (k) {
      inst.data[k] = patch[k];
    });
  };
  inst.triggerEvent = function (name, detail) {
    inst.events.push({ name: name, detail: detail });
  };
  return inst;
}

function test(name, fn) {
  fn();
  passed += 1;
  console.log('  ✓ ' + name);
}

function wait(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

const state = require('../utils/state');

async function main() {
  console.log('组件行为测试');

  state.reset();
  const headerConf = loadComponent('components/app-header/app-header.js');
  const students = state.students();
  const header = instantiate(headerConf, {
    role: 'parent',
    students: students,
    activeId: students[0].id,
    lockSwitch: false
  });
  headerConf.observers['students, activeId'].call(header, students, students[0].id);

  test('顶部栏根据档案显示昵称与头像字', function () {
    assert.strictEqual(header.data.childName, '小禾');
    assert.strictEqual(header.data.childInitial, '禾');
    assert.strictEqual(header.data.studentNames.length, 1);
  });

  test('切换角色会保存角色并回到对应首页', function () {
    header.onRole({ currentTarget: { dataset: { role: 'student' } } });
    assert.strictEqual(state.get().role, 'student');
    assert.strictEqual(nav[nav.length - 1], '/pages/home/home');
    header.setData({ role: 'student' });
    header.onRole({ currentTarget: { dataset: { role: 'parent' } } });
    assert.strictEqual(state.get().role, 'parent');
    assert.strictEqual(nav[nav.length - 1], '/pages/setup/setup');
  });

  test('流程锁定时拒绝切换角色与新增档案', function () {
    const before = state.get().role;
    header.setData({ lockSwitch: true });
    header.onRole({ currentTarget: { dataset: { role: 'student' } } });
    assert.strictEqual(state.get().role, before);
    header.onAdd();
    assert.strictEqual(header.data.modal, '');
    header.setData({ lockSwitch: false });
  });

  test('新增档案会校验重名，成功后写入独立档案', function () {
    header.onAdd();
    assert.strictEqual(header.data.modal, 'add');
    header.onModalInput({ detail: { value: '小禾' } });
    header.onModalAction({ detail: { key: 'save' } });
    assert.ok(header.data.error.indexOf('同名') >= 0);
    assert.strictEqual(state.get().children.length, 1);

    header.onModalInput({ detail: { value: '小满' } });
    header.onModalAction({ detail: { key: 'save' } });
    assert.strictEqual(state.get().children.length, 2);
    assert.strictEqual(state.child().name, '小满');
    assert.strictEqual(header.data.modal, '');
    header.setData({ students: state.students() });
  });

  test('最多三个档案，超出时给出提示', function () {
    header.onAdd();
    header.onModalInput({ detail: { value: '小谷' } });
    header.onModalAction({ detail: { key: 'save' } });
    assert.strictEqual(state.get().children.length, 3);
    header.setData({ students: state.students() });
    header.onAdd();
    assert.ok(toasts[toasts.length - 1].indexOf('最多 3 个') >= 0);
    assert.strictEqual(header.data.modal, '');
  });

  test('原型说明与重置流程', function () {
    header.onMore();
    assert.strictEqual(header.data.modal, 'more');
    header.onModalAction({ detail: { key: 'guide' } });
    assert.strictEqual(header.data.modal, 'guide');
    header.onModalAction({ detail: { key: 'close' } });
    assert.strictEqual(header.data.modal, '');

    header.onMore();
    header.onModalAction({ detail: { key: 'reset-ask' } });
    assert.strictEqual(header.data.modal, 'reset');
    header.onModalAction({ detail: { key: 'reset' } });
    assert.strictEqual(state.get().children.length, 1);
    assert.strictEqual(state.get().role, 'parent');
  });

  const tabConf = loadComponent('components/tab-bar/tab-bar.js');
  const tab = instantiate(tabConf, { role: 'student', current: 'home' });
  tabConf.lifetimes.attached.call(tab);

  test('底部导航按角色切换条目', function () {
    assert.strictEqual(tab.data.items.length, 3);
    assert.strictEqual(tab.data.items[0].key, 'home');
    tabConf.observers.role.call(tab, 'parent');
    assert.strictEqual(tab.data.items[0].key, 'setup');
  });

  test('底部导航跳过当前页并跳转到其他页', function () {
    tab.setData({ current: 'setup' });
    const count = nav.length;
    tab.onTap({ currentTarget: { dataset: { index: 0 } } });
    assert.strictEqual(nav.length, count);
    tab.onTap({ currentTarget: { dataset: { index: 1 } } });
    assert.strictEqual(nav[nav.length - 1], '/pages/bank/bank');
  });

  const modalConf = loadComponent('components/app-modal/app-modal.js');
  const modal = instantiate(modalConf, { visible: 'session', maskClosable: true });

  test('弹窗按钮与遮罩触发 action 事件', function () {
    modal.onAction({ currentTarget: { dataset: { key: 'finish' } } });
    assert.deepStrictEqual(modal.events[0], { name: 'action', detail: { key: 'finish' } });
    modal.onMask();
    assert.deepStrictEqual(modal.events[1], { name: 'action', detail: { key: 'cancel' } });
    modal.setData({ maskClosable: false });
    modal.onMask();
    assert.strictEqual(modal.events.length, 2);
  });

  test('弹窗输入回传当前值', function () {
    modal.onInput({ detail: { value: '小雨' } });
    assert.deepStrictEqual(modal.events[modal.events.length - 1], {
      name: 'input',
      detail: { value: '小雨' }
    });
  });

  const emptyConf = loadComponent('components/empty-state/empty-state.js');
  const empty = instantiate(emptyConf, { action: '去选词' });

  test('空状态按钮触发 action 事件', function () {
    empty.onAction();
    assert.strictEqual(empty.events[0].name, 'action');
  });

  await wait(400);
  assert.strictEqual(nav[nav.length - 1], '/pages/setup/setup');

  console.log('\n共 ' + passed + ' 项组件测试通过。');
}

main().catch(function (e) {
  console.error(e);
  process.exit(1);
});
