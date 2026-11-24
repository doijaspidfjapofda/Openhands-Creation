const store = require('./store');

const KEY = 'wordnest-mini-v1';

let state = null;

function isValid(value) {
  return (
    value &&
    value.version === 1 &&
    Array.isArray(value.children) &&
    value.children.length > 0 &&
    value.children.length <= 3 &&
    value.children.some((c) => c.id === value.activeChildId)
  );
}

function save() {
  try {
    wx.setStorageSync(KEY, state);
  } catch (e) {
    // 本地存储不可用时仍允许体验，仅无法保留记录。
  }
  return state;
}

function get() {
  if (state) return state;
  let raw = null;
  try {
    raw = wx.getStorageSync(KEY);
  } catch (e) {
    raw = null;
  }
  if (isValid(raw)) {
    state = raw;
  } else {
    state = store.createSeedState();
    save();
  }
  return state;
}

function reset() {
  state = store.createSeedState();
  save();
  return state;
}

function child() {
  return store.currentChild(get());
}

function setRole(role) {
  const s = get();
  s.role = role === 'student' ? 'student' : 'parent';
  save();
  return s.role;
}

function setChild(id) {
  const s = get();
  if (!s.children.some((c) => c.id === id)) return s.activeChildId;
  s.activeChildId = id;
  save();
  return s.activeChildId;
}

function students() {
  return get().children.map((c) => ({ id: c.id, name: c.name }));
}

function roleHome(role) {
  return role === 'student' ? '/pages/home/home' : '/pages/setup/setup';
}

module.exports = {
  KEY,
  get,
  save,
  reset,
  child,
  setRole,
  setChild,
  students,
  roleHome
};
