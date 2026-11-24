#!/usr/bin/env node
// 静态自检：本环境无法运行微信开发者工具，用脚本检查工程结构、语法和事件绑定。
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const errors = [];
const warnings = [];

function rel(p) {
  return path.relative(ROOT, p);
}

function fail(msg) {
  errors.push(msg);
}

function warn(msg) {
  warnings.push(msg);
}

function read(file) {
  return fs.readFileSync(file, 'utf8');
}

function exists(file) {
  return fs.existsSync(file);
}

function checkJson(file) {
  try {
    JSON.parse(read(file));
  } catch (e) {
    fail('JSON 解析失败: ' + rel(file) + ' -> ' + e.message);
  }
}

function checkJs(file) {
  try {
    new vm.Script(read(file), { filename: file });
  } catch (e) {
    fail('JS 语法错误: ' + rel(file) + ' -> ' + e.message);
  }
}

function checkWxml(file) {
  const src = read(file);
  const label = rel(file);

  const openCount = (src.match(/\{\{/g) || []).length;
  const closeCount = (src.match(/\}\}/g) || []).length;
  if (openCount !== closeCount) {
    fail('WXML 插值括号不匹配: ' + label + ' {{=' + openCount + ' }}=' + closeCount);
  }

  const exprRe = /\{\{([\s\S]*?)\}\}/g;
  let em;
  while ((em = exprRe.exec(src))) {
    const expr = em[1].trim();
    if (!expr) continue;
    try {
      new vm.Script('(' + expr + ')');
    } catch (e) {
      fail('WXML 表达式语法错误: ' + label + ' -> {{' + expr + '}} ' + e.message);
    }
  }

  const stack = [];
  const tagRe = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/g;
  let m;
  while ((m = tagRe.exec(src))) {
    const closing = m[1] === '/';
    const name = m[2];
    const selfClose = m[4] === '/';
    if (closing) {
      const top = stack.pop();
      if (top !== name) {
        fail('WXML 标签闭合错误: ' + label + ' 期望 </' + (top || '?') + '>，实际 </' + name + '>');
        return;
      }
    } else if (!selfClose) {
      stack.push(name);
    }
  }
  if (stack.length) {
    fail('WXML 存在未闭合标签: ' + label + ' -> ' + stack.join(', '));
  }

  const jsFile = file.replace(/\.wxml$/, '.js');
  if (!exists(jsFile)) return;
  const js = read(jsFile);
  const handlerRe = /\b(?:bind|catch)(?::)?([a-zA-Z]+)\s*=\s*"([^"]*)"/g;
  let h;
  while ((h = handlerRe.exec(src))) {
    const handler = h[2].trim();
    if (!handler || handler.indexOf('{{') >= 0) {
      fail('事件绑定不是固定方法名: ' + label + ' -> ' + h[0]);
      continue;
    }
    const re = new RegExp('\\b' + handler + '\\s*[:(]');
    if (!re.test(js)) {
      fail('事件处理函数缺失: ' + label + ' -> ' + handler);
    }
  }
}

function checkWxss(file) {
  const src = read(file);
  const open = (src.match(/\{/g) || []).length;
  const close = (src.match(/\}/g) || []).length;
  if (open !== close) {
    fail('WXSS 花括号不匹配: ' + rel(file) + ' {' + open + ' }' + close);
  }
  const importRe = /@import\s+["']([^"']+)["']/g;
  let m;
  while ((m = importRe.exec(src))) {
    const target = path.resolve(path.dirname(file), m[1]);
    if (!exists(target)) fail('WXSS @import 路径不存在: ' + rel(file) + ' -> ' + m[1]);
  }
}

function checkUnit(dir, kind) {
  const base = path.basename(dir);
  const wxml = path.join(dir, base + '.wxml');
  const js = path.join(dir, base + '.js');
  const json = path.join(dir, base + '.json');
  const wxss = path.join(dir, base + '.wxss');

  [wxml, js, json].forEach(function (f) {
    if (!exists(f)) fail(kind + ' 缺少文件: ' + rel(f));
  });
  if (exists(wxml)) checkWxml(wxml);
  if (exists(js)) checkJs(js);
  if (exists(json)) {
    checkJson(json);
    const conf = JSON.parse(read(json));
    if (kind === '组件' && conf.component !== true) {
      fail('组件 json 缺少 "component": true: ' + rel(json));
    }
  }
  if (exists(wxss)) checkWxss(wxss);
}

function walk(dir, out) {
  if (!exists(dir)) return out;
  fs.readdirSync(dir).forEach(function (name) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  });
  return out;
}

const appJsonPath = path.join(ROOT, 'app.json');
checkJson(appJsonPath);
const appJson = JSON.parse(read(appJsonPath));

appJson.pages.forEach(function (p) {
  checkUnit(path.dirname(path.join(ROOT, p)), '页面');
});

const globalComponents = appJson.usingComponents || {};
Object.keys(globalComponents).forEach(function (key) {
  const target = path.join(ROOT, globalComponents[key]);
  const dir = path.dirname(target);
  if (!exists(dir)) fail('全局组件目录不存在: ' + globalComponents[key]);
  else checkUnit(dir, '组件');
});

const compRoot = path.join(ROOT, 'components');
if (exists(compRoot)) {
  fs.readdirSync(compRoot).forEach(function (name) {
    const dir = path.join(compRoot, name);
    if (fs.statSync(dir).isDirectory()) checkUnit(dir, '组件');
  });
}

const allFiles = walk(ROOT, []);
allFiles.forEach(function (file) {
  if (file.indexOf(path.join(ROOT, 'tests')) === 0) return;
  if (/\.json$/.test(file) && file !== appJsonPath) checkJson(file);
  if (/\.js$/.test(file) && file !== path.join(ROOT, 'scripts', 'check.js')) checkJs(file);
  if (/\.wxss$/.test(file)) checkWxss(file);
});

const knownTags = Object.keys(globalComponents);
allFiles.forEach(function (file) {
  if (!/\.wxml$/.test(file)) return;
  const src = read(file);
  knownTags.forEach(function (tag) {
    if (src.indexOf('<' + tag) >= 0 && !globalComponents[tag]) {
      fail('组件未注册: ' + rel(file) + ' -> ' + tag);
    }
  });
});

allFiles.forEach(function (file) {
  if (!/\.wxml$/.test(file)) return;
  const pagePath = path.relative(ROOT, file).replace(/\.wxml$/, '').replace(/\\/g, '/');
  if (pagePath.indexOf('pages/') === 0 && appJson.pages.indexOf(pagePath) < 0) {
    warn('页面未在 app.json 注册: ' + pagePath);
  }
});

console.log('检查文件数: ' + allFiles.length);
if (warnings.length) {
  console.log('\n警告 (' + warnings.length + '):');
  warnings.forEach(function (w) {
    console.log('  - ' + w);
  });
}
if (errors.length) {
  console.log('\n错误 (' + errors.length + '):');
  errors.forEach(function (e) {
    console.log('  - ' + e);
  });
  process.exit(1);
}
console.log('\n静态检查通过。');

