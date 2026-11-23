/* ============================================================
   纸间 PDF · 交互层
   界面逻辑与处理逻辑严格分层：
   - 界面：视图路由、页面模型、面板、状态
   - 处理：通过本地 PDF.js 与 pdf-lib 读取、预览和写入 PDF
   - PDF 数据只在当前浏览器标签页内处理，不会上传。
   ============================================================ */
(function () {
  'use strict';

  /* ============================================================
     0. 小工具
     ============================================================ */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  function icon(name, size) {
    return '<svg viewBox="0 0 24 24"' + (size ? ' width="' + size + '" height="' + size + '"' : '') +
      ' fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<use href="#i-' + name + '"/></svg>';
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function kb(n) {
    if (!n) return '—';
    if (n > 1048576) return (n / 1048576).toFixed(1) + ' MB';
    return Math.max(1, Math.round(n / 1024)) + ' KB';
  }

  /* ============================================================
     1. 工具元数据
     ============================================================ */
  var TOOLS = {
    organize: { name: '页面整理', short: '页面整理', desc: '拖动排序、旋转、复制或删除页面', need: '1 个文件', icon: 'layers', tint: 'lilac', run: '保存为新文件' },
    merge: { name: '合并 PDF', short: '合并', desc: '多个文件按顺序合成一个，可先预览', need: '2 个以上文件', icon: 'merge', tint: 'sky', run: '合并并另存' },
    split: { name: '拆分与提取', short: '拆分', desc: '按页码范围拆开，或提取选中页', need: '1 个文件', icon: 'split', tint: 'peach', run: '拆分并另存' },
    compress: { name: '压缩', short: '压缩', desc: '标准压缩，显示处理前后大小', need: '1 个文件', icon: 'compress', tint: 'mint', run: '开始压缩' },
    convert: { name: '转换', short: '转换', desc: 'PDF 与图片互转、PDF 转文本', need: '1 个文件', icon: 'convert', tint: 'sky', run: '转换并另存' },
    edit: { name: '页面编辑', short: '页面编辑', desc: '添加文本、图片、页码、水印、印章', need: '1 个文件', icon: 'edit', tint: 'peach', run: '应用编辑' },
    annotate: { name: '批注与签名', short: '批注与签名', desc: '高亮、便笺、手写签名与图片签名', need: '1 个文件', icon: 'comment', tint: 'lilac', run: '应用到副本' },
    form: { name: '表单填写', short: '表单填写', desc: '填写 PDF 表单，显示每个字段状态', need: '1 个文件', icon: 'form', tint: 'sand', run: '保存填写结果' },
    compare: { name: '对比差异', short: '对比差异', desc: '并排比较两个版本的文字变化', need: '2 个文件', icon: 'compare', tint: 'sky', run: '开始比较' },
    protect: { name: '保护与文档信息', short: '保护与脱敏', desc: '打开密码、权限、元数据与书签', need: '1 个文件', icon: 'shield', tint: 'sage', run: '应用到副本' },
    redact: { name: '脱敏与清理', short: '脱敏', desc: '永久移除敏感内容，清理脚本与隐藏对象', need: '1 个文件', icon: 'eye-off', tint: 'danger', run: '确认脱敏并另存' }
  };

  var TINTS = {
    lilac: ['var(--lilac-soft)', 'var(--lilac)'],
    sky: ['var(--sky-soft)', 'var(--sky)'],
    peach: ['var(--peach-soft)', 'var(--peach)'],
    mint: ['var(--mint-soft)', 'var(--mint)'],
    sand: ['var(--sand-soft)', 'var(--sand)'],
    sage: ['var(--sage-soft)', 'var(--sage)'],
    danger: ['var(--danger-soft)', 'var(--danger)']
  };
  function tintStyle(t) {
    var p = TINTS[t] || TINTS.sky;
    return 'background:' + p[0] + ';color:' + p[1];
  }

  var UNSUPPORTED = [
    { name: 'OCR 扫描件识字', desc: '需要额外的本机文字识别模型，当前版本未包含', icon: 'scan' },
    { name: 'Office / 网页转 PDF', desc: '需要本机 Office 或排版转换组件，当前版本未包含', icon: 'file' },
    { name: '修复损坏 PDF', desc: '需要专用的本机修复引擎，当前版本未包含', icon: 'alert-triangle' }
  ];

  /* ============================================================
     2. 状态
     ============================================================ */
  var S = {
    view: 'home',
    tool: 'organize',
    doc: null,
    pages: [],
    sel: [],
    current: 0,
    zoom: 1,
    hist: null,
    busy: false,
    loading: false,
    recent: [],
    recentOn: true,
    mergeFiles: [
      { name: '产品设计复盘_2026.pdf', pages: 12, size: 3984000, demo: true },
      { name: '附件A_数据图表.pdf', pages: 8, size: 2140000, demo: true },
      { name: '附件B_调研记录.pdf', pages: 11, size: 1620000, demo: true }
    ],
    objects: [],
    objSeq: 0,
    redMarks: [],
    convImages: []
  };

  var runToken = 0;
  var pdfHintShown = false;
  var loadCancelled = false;
  var dirty = false;

  var RECENT_KEY = 'zj.recent.v1';
  var RECENT_ON_KEY = 'zj.recentOn.v1';

  /* 最近文件只保存文件名、页数、大小、时间和（桌面版）路径，不保存文件内容 */
  function loadRecentStore() {
    try {
      var raw = localStorage.getItem(RECENT_KEY);
      if (!raw) return [];
      var list = JSON.parse(raw);
      if (!Array.isArray(list)) return [];
      return list.filter(function (r) {
        return r && typeof r.name === 'string' && r.name;
      }).slice(0, 6).map(function (r) {
        return {
          name: r.name,
          path: typeof r.path === 'string' ? r.path : '',
          pages: Number(r.pages) || 0,
          size: typeof r.size === 'string' ? r.size : '',
          when: typeof r.when === 'string' ? r.when : '',
          file: null,
          demo: false,
          restored: true
        };
      });
    } catch (e) { return []; }
  }

  function saveRecentStore() {
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(S.recent.map(function (r) {
        return { name: r.name, path: r.path || '', pages: r.pages, size: r.size, when: r.when };
      })));
    } catch (e) {}
  }

  function loadRecentOn() {
    try {
      var v = localStorage.getItem(RECENT_ON_KEY);
      return v === null ? true : v === '1';
    } catch (e) { return true; }
  }

  function saveRecentOn() {
    try { localStorage.setItem(RECENT_ON_KEY, S.recentOn ? '1' : '0'); } catch (e) {}
  }

  /* 桌面版可以通过 Electron 拿到真实路径，浏览器版返回空字符串 */
  function desktopPath(file) {
    try {
      if (file && window.zjDesktop && typeof window.zjDesktop.filePath === 'function') {
        return window.zjDesktop.filePath(file) || '';
      }
    } catch (e) {}
    return '';
  }

  /* ============================================================
     3. 视图路由
     ============================================================ */
  var VIEWS = ['home', 'recent', 'workspace', 'settings'];

  function switchView(name) {
    S.view = name;
    VIEWS.forEach(function (v) {
      var el = $('#view' + v.charAt(0).toUpperCase() + v.slice(1));
      if (el) el.hidden = (v !== name);
    });
    $$('.nav-item').forEach(function (b) {
      var isView = b.dataset.view === name;
      var isTool = b.dataset.tool && name === 'workspace' && navToolMatch(b.dataset.tool);
      b.classList.toggle('is-active', isView || !!isTool);
    });
    if (name !== 'home') closeDevPop();
    if (name === 'recent') renderRecent();
    if (name === 'settings') syncSettings();
  }

  function navToolMatch(navTool) {
    if (navTool === 'protect') return S.tool === 'protect' || S.tool === 'redact';
    return S.tool === navTool;
  }

  /* ============================================================
     4. 首页
     ============================================================ */
  function renderHome() {
    renderRecent();
    var groups = [
      { title: '常用工具', desc: '处理一个文件就够', keys: ['organize', 'merge', 'split', 'compress', 'convert', 'edit'] },
      { title: '编辑与标注', desc: '在页面上留下内容', keys: ['annotate', 'form', 'compare'] },
      { title: '安全与信息', desc: '密码、元数据与不可逆操作', keys: ['protect', 'redact'] }
    ];
    var html = '';
    groups.forEach(function (g) {
      html += '<div class="section-head"><h2>' + g.title + '</h2>' +
        '<span class="count">' + g.desc + '</span></div>';
      html += '<div class="tool-grid">';
      g.keys.forEach(function (k) {
        var t = TOOLS[k];
        var ready = !!(IMPLEMENTED_TOOLS && IMPLEMENTED_TOOLS[k]);
        html += '<button class="tool-card" data-open-tool="' + k + '">' +
          (ready ? '' : '<span class="corner-flag">尚未接入</span>') +
          '<div class="tool-card-top">' +
            '<span class="tool-icon" style="' + tintStyle(t.tint) + '">' + icon(t.icon) + '</span>' +
            '<div style="min-width:0"><div class="tool-name">' + t.name + '</div></div>' +
          '</div>' +
          '<p class="tool-desc">' + t.desc + '</p>' +
          '<div class="tool-card-foot"><span class="req">' + icon(ready ? 'check-circle' : 'slash', 12) + (ready ? '本机可用 · ' : '暂不可用 · ') + t.need + '</span></div>' +
        '</button>';
      });
      html += '</div>';
    });

    html += '<div class="section-head"><h2>其他暂未接入的工具</h2>' +
      '<span class="count">这些功能还没有本机处理模块，文件不会改走云端</span></div>';
    html += '<div class="tool-grid">';
    UNSUPPORTED.forEach(function (u) {
      html += '<button class="tool-card" data-offline="1" data-unsupported="' + esc(u.name) + '">' +
        '<span class="corner-flag">未接入</span>' +
        '<div class="tool-card-top">' +
          '<span class="tool-icon" style="background:var(--surface-sunk);color:var(--ink-4)">' + icon(u.icon) + '</span>' +
          '<div style="min-width:0"><div class="tool-name">' + u.name + '</div></div>' +
        '</div>' +
        '<p class="tool-desc">' + u.desc + '</p>' +
        '<div class="tool-card-foot"><span class="req">' + icon('slash', 12) + '本地不可用</span></div>' +
      '</button>';
    });
    html += '</div>';

    $('#toolGroups').innerHTML = html;
  }

  function recentRow(r, i) {
    return '<div class="rec-row" data-recent-idx="' + i + '" tabindex="0" role="button" aria-label="打开 ' + esc(r.name) + '">' +
      '<span class="rec-file-icon">' + icon('file-pdf') + '</span>' +
      '<div class="rec-main">' +
        '<div class="rec-name">' + esc(r.name) + '</div>' +
        '<div class="rec-path">' + esc(r.path || (r.restored ? '重启后记录 · 需要重新选择文件' : '本机文件 · 路径不保存')) + '</div>' +
      '</div>' +
      '<span class="rec-meta">' + r.pages + ' 页 · ' + r.size + ' · ' + r.when + '</span>' +
      '<div class="row-actions">' +
        '<button class="btn btn-ghost btn-sm" data-recent-open="' + i + '">打开</button>' +
        '<button class="icon-btn" data-tip="在文件夹中显示（未接入）" data-tip-pos="bottom" aria-label="在文件夹中显示" disabled>' + icon('folder-open') + '</button>' +
      '</div>' +
    '</div>';
  }

  function renderRecent() {
    var list = S.recent;
    var empty = '<div class="empty">' +
      '<span class="empty-art">' + icon('clock') + '</span>' +
      '<h3>还没有最近文件</h3>' +
      '<p>打开过的 PDF 会出现在这里。记录只保存文件名、页数、大小和时间，不保存文件内容。</p>' +
      '<button class="btn btn-secondary btn-sm" data-open-file>选择 PDF</button>' +
    '</div>';

    var html = list.length ? list.map(recentRow).join('') : empty;
    $('#recentList').innerHTML = html;
    $('#recentListFull').innerHTML = html;

    var cnt = list.length;
    $('#navRecentCount').textContent = cnt;
    $('#navRecentCount').hidden = cnt === 0;
    $('#recentCountText').textContent = cnt ? '最近打开过 ' + cnt + ' 个文件' : '暂无记录';
    var n3 = $('#setRecentNum');
    if (n3) n3.textContent = cnt;
  }

  function addRecent(doc) {
    if (!S.recentOn || doc.kind === 'demo') return;
    S.recent = S.recent.filter(function (r) { return r.name !== doc.name; });
    S.recent.unshift({
      name: doc.name,
      path: desktopPath(doc.file),
      file: doc.file,
      pages: doc.pages.length,
      size: kb(doc.size),
      when: '刚刚',
      demo: false,
      restored: false
    });
    S.recent = S.recent.slice(0, 6);
    saveRecentStore();
    renderRecent();
  }

  /* ============================================================
     5. 打开文件
     ============================================================ */
  function pickFiles() {
    var inp = $('#fileInput');
    inp.value = '';
    inp.click();
  }

  function onFilesPicked(files) {
    var arr = Array.prototype.slice.call(files || []);
    if (!arr.length) return;
    if (S.tool === 'convert' && convertDir() === 'img2pdf') {
      var imgs = arr.filter(function (f) {
        return /^image\/(png|jpeg)$/.test(f.type || '') || /\.(png|jpe?g)$/i.test(f.name || '');
      });
      var skipped = arr.length - imgs.length;
      if (!imgs.length) { showToast('请选择 PNG 或 JPG 图片', 'warn'); return; }
      imgs.forEach(function (f) { S.convImages.push({ name: f.name, size: f.size || 0, file: f }); });
      renderConvImages();
      updatePanelStateForTool();
      showToast('已加入 ' + imgs.length + ' 张图片' + (skipped ? '，忽略了 ' + skipped + ' 个不支持的文件' : ''), 'ok');
      return;
    }
    if (S.tool === 'merge') {
      var pdfs = arr.filter(function (f) { return f.type === 'application/pdf' || /\.pdf$/i.test(f.name); });
      var skipped = arr.length - pdfs.length;
      if (!pdfs.length) { showToast('请选择 PDF 文件', 'warn'); return; }
      S.mergeFiles = S.mergeFiles.filter(function (f) { return !!f.file; });
      var added = 0;
      var chain = Promise.resolve();
      pdfs.forEach(function (f) {
        chain = chain.then(function () {
          return ZJEngine.pageCount(f).then(function (pages) {
            S.mergeFiles.push({ name: f.name, pages: pages, size: f.size || 0, file: f });
            added++;
            markDirty(true);
            renderMergeList(); renderMergePreview(); updateStatus();
          }).catch(function (err) {
            showToast((f.name || '文件') + '：' + friendlyError(err), 'warn');
          });
        });
      });
      chain.then(function () {
        if (added) {
          var firstReal = S.mergeFiles.filter(function (f) { return !!f.file; })[0];
          var out = $('#mergeOutName');
          if (firstReal && out) out.value = baseName(firstReal.name) + '_合并.pdf';
          showToast('已从本机加入 ' + added + ' 个 PDF' + (skipped ? '，忽略了 ' + skipped + ' 个非 PDF 文件' : ''), 'ok');
        }
      });
      return;
    }
    var pdf = arr.filter(function (f) { return f.type === 'application/pdf' || /\.pdf$/i.test(f.name); })[0];
    if (!pdf) { showToast('请选择 PDF 文件', 'warn'); return; }
    openLocalPdf(pdf);
  }

  function setLoading(on, text) {
    if (on) {
      setStatus('loading', text || '正在读取文件…');
    }
  }

  function openLocalPdf(file) {
    S.loading = true;
    loadCancelled = false;
    setLoading(true);
    return ZJRender.loadPdf(file, {
      onProgress: function (done, total) {
        setStatus('loading', done ? '正在读取文件… ' + done + ' / ' + total + ' 页' : '正在读取文件… 共 ' + total + ' 页');
      },
      shouldAbort: function () { return loadCancelled; }
    }).then(function (doc) {
      activateDoc(doc);
      showToast('已在本机打开：' + doc.name, 'ok');
    }).catch(function (err) {
      if (err && err.code === 'cancelled') {
        showToast('已取消读取，原文件没有被修改', 'info');
        return;
      }
      return handleOpenError(err, file);
    }).then(function () {
      S.loading = false;
      setStatus('ready', '就绪');
    });
  }

  /* 有未保存改动时关窗要确认：桌面版走主进程对话框，浏览器版走 beforeunload */
  function markDirty(on) {
    dirty = !!on;
    if (window.zjDesktop && typeof window.zjDesktop.setDirty === 'function') {
      window.zjDesktop.setDirty(dirty);
    }
  }

  function requestSave() {
    if (S.loading) { showToast('文件正在打开，请稍候', 'warn'); return; }
    startRun(S.tool === 'convert' ? 'convert' : S.tool);
  }

  /* 打开文件期间页面仍显示上一份文档，此时的操作会被载入结果覆盖，直接拒绝 */
  function blockWhileLoading() {
    if (!S.loading) return false;
    showToast('文件正在打开，请稍候', 'warn');
    return true;
  }

  function handleOpenError(err, file) {
    var code = err && err.code;
    if (code === 'need-password') {
      openDialog({
        title: '暂不支持加密 PDF',
        desc: '当前版本不能解锁带打开密码的 PDF。请在本机 PDF 阅读器中解锁后另存一份，再重新打开；文件不会上传。',
        icon: 'lock',
        cancelText: '关闭',
        confirmText: '重新选择',
        onConfirm: function () { pickFiles(); }
      });
      return;
    }
    if (code === 'bad-password') {
      openDialog({ title: '暂不支持加密 PDF', desc: '当前版本不能解锁此 PDF。请先在本机 PDF 阅读器中解锁并另存一份。', icon: 'lock', confirmText: '重新选择', onConfirm: function () { pickFiles(); } });
      return;
    }
    if (code === 'invalid') {
      openDialog({
        title: '这个文件无法打开',
        desc: '它可能不是有效的 PDF，或者文件已损坏。本机没有修复能力，也不会把文件发到云端尝试修复。',
        icon: 'alert-triangle',
        cancelText: '关闭',
        confirmText: '换一个文件',
        onConfirm: function () { pickFiles(); }
      });
      return;
    }
    /* pdf.js 未能在当前环境启动（多为 file:// 直接双击打开导致 Worker 被阻止） */
    openDialog({
      title: '本地渲染组件没能启动',
      desc: '浏览器在 file:// 下会阻止 PDF 渲染线程。用附带的「启动预览.bat」以本地 http 方式打开即可渲染真实文件；也可以先用演示文档查看完整界面。',
      icon: 'alert-triangle',
      extra: '已尝试：pdf.js 本地 Worker · 未发生任何网络请求',
      cancelText: '继续用演示文档',
      confirmText: '重新选择文件',
      onConfirm: function () { pickFiles(); },
      onCancel: function () { openDemo(); }
    });
  }

  function openDemo() {
    var doc = ZJRender.makeDemo();
    activateDoc(doc);
    showToast('已载入演示文档：12 页样张，由程序绘制', 'info');
  }

  function baseName(name) {
    return String(name || '').replace(/\.pdf$/i, '').trim() || '输出';
  }

  /* 输出文件名跟随当前打开的文件，避免沿用示例文件名 */
  function syncOutputNames(doc) {
    var base = baseName(doc && doc.name);
    var org = $('#orgOutName');
    if (org) org.value = base + '_已整理.pdf';
    var split = $('#splitPrefix');
    if (split) split.value = base;
    var cmp = $('#cmpOutName');
    if (cmp) cmp.value = base + '_压缩.pdf';
    updateSplitPreview();
  }

  function activateDoc(doc) {
    S.doc = doc;
    S.pages = doc.pages.map(function (p, i) {
      return { id: 'pg' + i + '_' + Math.random().toString(36).slice(2, 7), index: i, rot: 0, blank: false, w: p.w, h: p.h };
    });
    S.sel = [];
    S.current = 0;
    S.zoom = 1;
    S.objects = [];
    S.objSeq = 0;
    S.redMarks = [];
    S.hist = ZJPages.createHistory(40);
    pushHistory();
    markDirty(false);
    syncOutputNames(doc);
    addRecent(doc);
    switchView('workspace');
    $('#wsDemoChip').hidden = doc.kind !== 'demo';
    $('#wsDemoChip').innerHTML = icon('sparkle') + (doc.kind === 'demo' ? '演示渲染' : '真实文件 · 本机');
    $('#wsDemoChip').className = 'chip ' + (doc.kind === 'demo' ? 'chip-demo' : 'chip-local');
    /* 先切换工具面板与中栏，再生成缩略图，保证三栏都进入正确状态 */
    openTool(S.tool, true);
    renderWorkspace();
    if (location.protocol === 'file:' && !pdfHintShown && ZJRender.pdfReady) {
      pdfHintShown = true;
      showToast('提示：双击打开时浏览器会阻止 PDF 渲染线程，建议用「启动预览.bat」', 'warn');
    }
  }

  function renderWorkspace() {
    $('#wsFileName').textContent = S.doc ? S.doc.name : '未打开文件';
    $('#wsFileSub').textContent = S.doc
      ? S.pages.length + ' 页 · ' + kb(S.doc.size) + ' · ' + (S.doc.kind === 'demo' ? '演示样张' : '本机文件')
      : '选择一个 PDF 开始';
    buildThumbs();
    renderMain();
    updateNav();
    updateSel();
    updateStatus();
    updateRailVisibility();
  }

  /* ============================================================
     6. 缩略图栏
     ============================================================ */
  function pageSize(p) {
    if (p && p.blank && p.w && p.h) {
      var blankRot = (p.rot || 0) % 360;
      return blankRot % 180 !== 0 ? { w: p.h, h: p.w } : { w: p.w, h: p.h };
    }
    if (!S.doc) return { w: 595, h: 842 };
    var base = S.doc.pages[p.index] || { w: 595, h: 842 };
    var rot = (p.rot || 0) % 360;
    return rot % 180 !== 0 ? { w: base.h, h: base.w } : { w: base.w, h: base.h };
  }

  var thumbObserver = null;
  var paintQueue = [];
  var painting = false;

  function buildThumbs() {
    var list = $('#thumbList');
    if (!S.doc) {
      list.innerHTML = '';
      if (thumbObserver) { thumbObserver.disconnect(); thumbObserver = null; }
      return;
    }
    var html = '';
    S.pages.forEach(function (p, i) {
      var sel = S.sel.indexOf(i) > -1;
      var dims = pageSize(p);
      var w = 96;
      var h = Math.max(24, Math.round(w * dims.h / dims.w));
      html += '<div class="thumb' + (sel ? ' is-selected' : '') + '" data-idx="' + i + '" draggable="true" ' +
        'role="option" aria-selected="' + sel + '" tabindex="0" aria-label="第 ' + (i + 1) + ' 页">' +
        '<button class="thumb-pick" tabindex="-1" aria-label="选择第 ' + (i + 1) + ' 页">' + icon('check', 10) + '</button>' +
        '<div class="thumb-figure' + (p.blank ? ' is-blank' : '') + '">' +
          '<canvas data-thumb="' + i + '" style="width:' + w + 'px;height:' + h + 'px"></canvas>' +
          '<span class="thumb-badge">' + (i + 1) + '</span>' +
          (p.rot ? '<span class="thumb-rot">' + p.rot + '°</span>' : '') +
          '<div class="thumb-tools">' +
            '<button class="thumb-tool" data-thumbact="rot" data-idx="' + i + '" aria-label="旋转第 ' + (i + 1) + ' 页">' + icon('rotate', 11) + '</button>' +
            '<button class="thumb-tool" data-thumbact="dup" data-idx="' + i + '" aria-label="复制第 ' + (i + 1) + ' 页">' + icon('copy', 11) + '</button>' +
            '<button class="thumb-tool" data-thumbact="del" data-idx="' + i + '" aria-label="删除第 ' + (i + 1) + ' 页">' + icon('trash', 11) + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    });
    list.innerHTML = html;
    paintQueue = [];
    painting = false;
    watchThumbs();
  }

  /* 只为可视区域的缩略图绘制位图，离开视野后释放画布内存；DOM 节点始终保留，拖动排序对全部页面有效 */
  function watchThumbs() {
    var list = $('#thumbList');
    if (thumbObserver) { thumbObserver.disconnect(); thumbObserver = null; }
    if (typeof window.IntersectionObserver !== 'function') { paintAllThumbs(); return; }
    thumbObserver = new window.IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var cv = entry.target.querySelector('canvas[data-thumb]');
        if (!cv) return;
        if (entry.isIntersecting) scheduleThumb(cv);
        else releaseThumb(cv);
      });
    }, { root: list, rootMargin: '320px 0px' });
    $$('.thumb', list).forEach(function (el) { thumbObserver.observe(el); });
  }

  function paintAllThumbs() {
    $$('[data-thumb]', $('#thumbList')).forEach(function (cv) { scheduleThumb(cv); });
  }

  function scheduleThumb(cv) {
    if (cv.dataset.painted === '1' || cv.dataset.queued === '1') return;
    cv.dataset.queued = '1';
    paintQueue.push(cv);
    if (!painting) nextThumb();
  }

  function releaseThumb(cv) {
    if (cv.dataset.painted !== '1') return;
    cv.width = 0;
    cv.height = 0;
    cv.removeAttribute('data-painted');
    cv.style.transform = '';
  }

  function nextThumb() {
    var cv = paintQueue.shift();
    if (!cv) { painting = false; return; }
    painting = true;
    var idx = parseInt(cv.dataset.thumb, 10);
    var page = S.pages[idx];
    if (!page) { delete cv.dataset.queued; nextThumb(); return; }
    var w = 96;
    var finish = function () {
      cv.dataset.painted = '1';
      delete cv.dataset.queued;
      nextThumb();
    };
    if (page.blank) {
      var blankDims = pageSize(page);
      var h = Math.round(w * blankDims.h / blankDims.w);
      cv.width = Math.round(w * 2); cv.height = Math.round(h * 2);
      cv.style.width = w + 'px'; cv.style.height = h + 'px';
      var c = cv.getContext('2d');
      c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
      finish();
      return;
    }
    ZJRender.render(S.doc, page.index, cv, w, Math.min(2, window.devicePixelRatio || 1))
      .then(function () { applyRot(cv, page.rot, w, w * 1.414); finish(); })
      .catch(function () { delete cv.dataset.queued; nextThumb(); });
  }

  function applyRot(cv, rot, w, h) {
    if (!rot) { cv.style.transform = ''; return; }
    var swap = rot % 180 !== 0;
    cv.style.transformOrigin = 'center center';
    cv.style.transform = 'rotate(' + rot + 'deg)' + (swap ? ' scale(' + (Math.min(w, h) / Math.max(w, h)) + ')' : '');
  }

  /* 选择 / 当前页 */
  function selectOnly(i) {
    S.sel = [i];
    S.current = i;
    syncSelUI();
    renderMain();
  }
  function toggleSel(i) {
    var k = S.sel.indexOf(i);
    if (k > -1) S.sel.splice(k, 1); else S.sel.push(i);
    S.current = i;
    syncSelUI();
    renderMain();
  }
  function extendSel(i) {
    var a = Math.min(S.current, i), b = Math.max(S.current, i);
    S.sel = [];
    for (var x = a; x <= b; x++) S.sel.push(x);
    syncSelUI();
  }
  function syncSelUI() {
    $$('.thumb').forEach(function (t) {
      var i = parseInt(t.dataset.idx, 10);
      var on = S.sel.indexOf(i) > -1;
      t.classList.toggle('is-selected', on);
      t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    updateSel();
  }

  function updateSel() {
    var n = S.sel.length;
    $('#footSel').textContent = n;
    $('#footTotal').textContent = S.pages.length;
    $('#thumbCount').textContent = S.pages.length;
    $('#pageTotal').textContent = S.pages.length;
    $('#splitTotal').textContent = S.pages.length;
    var chip = $('#orgSelChip');
    if (chip) chip.textContent = '已选 ' + n + ' 页';
    $('#sbSelInfo').textContent = n ? ('已选 ' + n + ' 页') : '未选择页面';
    $('#pageInput').value = S.pages.length ? (S.current + 1) : 0;
    $$('[data-pageact]').forEach(function (b) { b.disabled = !S.doc; });
    updateUndoRedo();
  }

  /* ============================================================
     7. 中栏渲染
     ============================================================ */
  var mainSeq = 0;

  function renderMain() {
    if (!S.doc) return;
    var page = S.pages[S.current];
    if (!page) return;
    var seq = ++mainSeq;
    $('#stageSkeleton').hidden = false;

    var vp = $('#stageViewport');
    var availW = Math.max(300, vp.clientWidth - 56);
    var availH = Math.max(300, vp.clientHeight - 56);
    var rot = page.rot || 0;
    var swap = rot % 180 !== 0;
    var natural = (page.blank && page.w && page.h) ? { w: page.w, h: page.h } : ((S.doc && S.doc.pages[page.index]) || { w: 595, h: 842 });
    /* 按显示方向计算缩放，保证旋转后也完整可见 */
    var shownW = swap ? natural.h : natural.w;
    var shownH = swap ? natural.w : natural.h;
    var fit = Math.min(availW / shownW, availH / shownH);
    var cssW = Math.round(natural.w * fit * S.zoom);   /* 画布旋转前的宽度 */
    var cssH = Math.round(natural.h * fit * S.zoom);
    var dispW = swap ? cssH : cssW;
    var dispH = swap ? cssW : cssH;

    var cv = $('#docCanvas');
    var container = $('#stageCanvas');
    container.style.width = dispW + 'px';
    container.style.height = dispH + 'px';
    cv.style.position = 'absolute';
    cv.style.left = '50%'; cv.style.top = '50%';
    cv.style.transformOrigin = 'center center';
    cv.style.transform = 'translate(-50%,-50%)' + (rot ? ' rotate(' + rot + 'deg)' : '');

    var target = cssW;

    if (page.blank) {
      cv.width = Math.round(cssW * 2); cv.height = Math.round(cssH * 2);
      cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px';
      var c = cv.getContext('2d');
      c.fillStyle = '#fff'; c.fillRect(0, 0, cv.width, cv.height);
      c.fillStyle = '#EFE7DF'; c.font = '500 18px "PingFang SC", sans-serif';
      c.textAlign = 'center';
      c.fillText('空白页', cv.width / 2, cv.height / 2);
      $('#stageSkeleton').hidden = true;
      $('#sbDetail').textContent = '页 ' + (S.current + 1) + ' / ' + S.pages.length + ' · 缩放 ' + Math.round(S.zoom * 100) + '% · 空白页';
      return;
    }

    ZJRender.render(S.doc, page.index, cv, target, Math.min(2, window.devicePixelRatio || 1)).then(function (res) {
      if (seq !== mainSeq) return;
      if (res && res.cancelled) return;          /* 被更新的一次渲染取代，直接忽略 */
      cv.style.transform = 'translate(-50%,-50%)' + (rot ? ' rotate(' + rot + 'deg)' : '');
      $('#stageSkeleton').hidden = true;
      $('#sbDetail').textContent = '页 ' + (S.current + 1) + ' / ' + S.pages.length + ' · 缩放 ' + Math.round(S.zoom * 100) + '%';
    }).catch(function (err) {
      if (seq !== mainSeq) return;
      $('#stageSkeleton').hidden = true;
      setStatus('error', '页面渲染失败');
      showToast('页面渲染失败：' + ((err && err.message) || '未知原因'), 'warn');
    });
  }

  function updateNav() {
    $('#pageInput').value = S.pages.length ? S.current + 1 : 0;
    $('#pagePrev').disabled = S.current <= 0;
    $('#pageNext').disabled = S.current >= S.pages.length - 1;
  }

  function goPage(i) {
    if (!S.pages.length) return;
    S.current = Math.max(0, Math.min(S.pages.length - 1, i));
    syncSelUI();
    updateNav();
    renderMain();
    var t = $('.thumb[data-idx="' + S.current + '"]');
    if (t) t.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  /* ============================================================
     8. 撤销 / 重做
     ============================================================ */
  function pushHistory() {
    S.hist.push(S.pages);
    updateUndoRedo();
    markDirty(true);
  }
  function restore(snap) {
    if (!snap) return;
    S.pages = ZJPages.snapshot(snap);
    S.sel = S.sel.filter(function (i) { return i < S.pages.length; });
    S.current = Math.min(S.current, Math.max(0, S.pages.length - 1));
    buildThumbs(); renderMain(); updateSel(); updateNav();
  }
  function undo() {
    var snap = S.hist.undo();
    if (!snap) return;
    restore(snap);
    updateUndoRedo();
    showToast('已撤销', 'info');
  }
  function redo() {
    var snap = S.hist.redo();
    if (!snap) return;
    restore(snap);
    updateUndoRedo();
    showToast('已重做', 'info');
  }
  function updateUndoRedo() {
    $('#btnUndo').disabled = !S.hist.canUndo();
    $('#btnRedo').disabled = !S.hist.canRedo();
  }

  /* ============================================================
     9. 页面操作
     ============================================================ */
  function targets() {
    return S.sel.length ? S.sel.slice().sort(function (a, b) { return a - b; }) : [S.current];
  }

  function pageAct(act, idx) {
    if (blockWhileLoading()) return;
    if (!S.doc) { showToast('先打开一个 PDF', 'warn'); return; }
    var list = typeof idx === 'number' ? [idx] : targets();
    if (!list.length || S.pages[list[0]] === undefined) return;

    if (act === 'up' || act === 'down' || act === 'move') {
      if (list.length !== 1) { showToast('请只选择一页再移动', 'warn'); return; }
      var from = list[0];
      var target = -1;
      if (act === 'up') target = from - 1;
      else if (act === 'down') target = from + 1;
      else {
        var input = $('#moveToPage');
        var want = parseInt(input ? input.value : '', 10);
        if (!Number.isInteger(want) || want < 1 || want > S.pages.length) {
          showToast('请输入 1–' + S.pages.length + ' 之间的页码', 'warn');
          if (input) input.focus();
          return;
        }
        target = want - 1;
      }
      if (target < 0 || target >= S.pages.length) {
        showToast(act === 'up' ? '已经是第一页' : '已经是最后一页', 'info');
        return;
      }
      if (target === from) { showToast('页面位置没有变化', 'info'); return; }
      var insertAt = target > from ? target + 1 : target;
      S.pages = ZJPages.move(S.pages, from, insertAt);
      S.sel = [target];
      S.current = target;
      pushHistory(); buildThumbs(); renderMain(); updateSel(); updateNav();
      showToast('已移动页面到第 ' + (target + 1) + ' 位', 'ok');
      return;
    }

    if (act === 'rotate-r' || act === 'rot') {
      S.pages = ZJPages.rotate(S.pages, list, 90);
      pushHistory(); buildThumbs(); renderMain(); updateSel();
      return;
    }
    if (act === 'rotate-l') {
      S.pages = ZJPages.rotate(S.pages, list, 270);
      pushHistory(); buildThumbs(); renderMain(); updateSel();
      return;
    }
    if (act === 'dup') {
      var dup = ZJPages.duplicate(S.pages, list);
      S.pages = dup.pages;
      S.sel = dup.sel;
      S.current = dup.at;
      pushHistory(); buildThumbs(); renderMain(); updateSel(); updateNav();
      showToast('已复制 ' + dup.sel.length + ' 页', 'ok');
      return;
    }
    if (act === 'del') {
      var names = list.length === 1 ? ('第 ' + (list[0] + 1) + ' 页') : (list.length + ' 个页面');
      openDialog({
        title: '删除 ' + names + '？',
        desc: '页面会先从当前视图移除。保存在新文件之前，你随时可以撤销这一步。',
        icon: 'trash', danger: true, confirmText: '删除页面',
        bullets: ['原文件不会被修改', '保存时生成新文件', '可用 Ctrl+Z 撤销'],
        onConfirm: function () {
          S.pages = ZJPages.remove(S.pages, list);
          S.sel = []; S.current = Math.max(0, Math.min(S.current, S.pages.length - 1));
          pushHistory(); buildThumbs(); renderMain(); updateSel(); updateNav();
          showToast('已删除 ' + names + '，可撤销', 'info');
        }
      });
    }
  }

  function blankSizeFor(at) {
    var mode = ($('#blankSize') && $('#blankSize').value) || 'auto';
    if (mode === 'a4') return { w: 595.28, h: 841.89 };
    if (mode === 'letter') return { w: 612, h: 792 };
    if (mode === 'current' && S.pages[S.current]) return ZJPages.blankDims(S.pages, S.current + 1);
    return ZJPages.blankDims(S.pages, at);
  }

  function insertBlank(pos) {
    if (blockWhileLoading()) return;
    if (!S.doc) { showToast('先打开一个 PDF', 'warn'); return; }
    var at = pos === 'start' ? 0 : pos === 'end' ? S.pages.length : S.current + 1;
    var inserted = ZJPages.insertBlank(S.pages, at, blankSizeFor(at));
    S.pages = inserted.pages;
    S.current = inserted.at; S.sel = [inserted.at];
    pushHistory(); buildThumbs(); renderMain(); updateSel(); updateNav();
    showToast('已插入空白页', 'ok');
  }

  /* ============================================================
     10. 合并 / 对比 视图
     ============================================================ */
  function renderMergeList() {
    var host = $('#mergeFiles');
    if (!host) return;
    host.innerHTML = S.mergeFiles.map(function (f, i) {
      return '<div class="file-item" draggable="true" data-mfi="' + i + '">' +
        '<span class="grip">' + icon('grip', 12) + '</span>' +
        '<span class="fi-icon">' + icon('file-pdf') + '</span>' +
        '<div class="fi-main"><div class="fi-name">' + esc(f.name) + '</div>' +
          '<div class="fi-meta">' + f.pages + ' 页 · ' + kb(f.size) + (f.demo ? ' · 示例预览，不能导出' : '') + '</div></div>' +
        '<span class="fi-actions">' +
          '<button class="icon-btn" data-mfup="' + i + '" aria-label="上移">' + icon('chevron-up') + '</button>' +
          '<button class="icon-btn" data-mfdown="' + i + '" aria-label="下移">' + icon('chevron-down') + '</button>' +
          '<button class="icon-btn" data-mfdel="' + i + '" aria-label="移除">' + icon('x') + '</button>' +
        '</span>' +
      '</div>';
    }).join('');
    $('#mergeCountChip').textContent = S.mergeFiles.length + ' 个文件';
  }

  function renderMergePreview() {
    var host = $('#mergePreview');
    if (!host) return;
    var total = S.mergeFiles.reduce(function (a, f) { return a + f.pages; }, 0);
    var html = '';
    S.mergeFiles.forEach(function (f, i) {
      var chips = '';
      for (var k = 0; k < Math.min(f.pages, 14); k++) {
        chips += '<span class="mp-page' + (k === 0 ? ' is-start' : '') + '"></span>';
      }
      if (f.pages > 14) chips += '<span style="font-size:10px;color:var(--ink-3);align-self:center">+' + (f.pages - 14) + '</span>';
      html += '<div class="mp-file"><span class="idx">' + (i + 1) + '</span>' +
        '<span class="nm" style="max-width:180px">' + esc(f.name) + '</span>' +
        '<span class="mp-pages">' + chips + '</span></div>';
      if (i < S.mergeFiles.length - 1) html += '<div class="mp-join">合并</div>';
    });
    var size = S.mergeFiles.reduce(function (a, f) { return a + f.size; }, 0);
    html += '<div class="mp-summary">' +
      '<div class="mp-stat"><span>文件</span><strong>' + S.mergeFiles.length + '</strong></div>' +
      '<div class="mp-stat"><span>总页数</span><strong>' + total + '</strong></div>' +
      '<div class="mp-stat"><span>预计大小</span><strong>约 ' + kb(size) + '</strong></div>' +
      '<div class="mp-stat"><span>加入空白分隔页</span><strong>' + ($('#mergeSep') && $('#mergeSep').checked ? '是' : '否') + '</strong></div>' +
      '<p class="mp-note">预览按文件顺序拼接，输出为一个新 PDF。原文件不会被改动。</p>' +
    '</div>';
    host.innerHTML = html;
  }

  function renderCompare() {
    var host = $('#compareGrid');
    if (!host) return;
    /* 演示用行宽序列：w 为宽度比例，cls 标记新增 / 删除 */
    var rows = [
      [1, ''], [1, ''], [0.86, ''], [1, ''], [0.62, ''], [1, ''],
      [0.92, ''], [1, 'add'], [1, ''], [0.74, ''], [1, ''], [0.55, ''],
      [1, ''], [0.88, ''], [1, 'add'], [1, ''], [0.66, ''], [1, ''],
      [0.8, ''], [1, 'add'], [0.58, ''], [1, '']
    ];
    function paper(kind) {
      return rows.map(function (r, i) {
        var cls = 'diff-line';
        if (kind === 'b' && r[1] === 'add') cls += ' is-add';
        if (kind === 'a' && i === 9) cls += ' is-del';
        return '<div class="' + cls + '" style="width:' + (r[0] * 100) + '%"></div>';
      }).join('');
    }
    host.innerHTML =
      '<div class="cmp-pane"><div class="cmp-head">A · 产品设计复盘_v2.pdf <span class="ver">12 页</span></div>' +
        '<div class="cmp-paper">' + paper('a') + '</div></div>' +
      '<div class="cmp-pane"><div class="cmp-head">B · 产品设计复盘_v3.pdf <span class="ver">13 页</span></div>' +
        '<div class="cmp-paper">' + paper('b') + '</div></div>' +
      '<div style="grid-column:1/-1;display:flex;justify-content:center;gap:16px" class="diff-legend">' +
        '<span class="legend-item"><span class="legend-swatch" style="background:#CBE4C4;box-shadow:inset 0 0 0 1px #A9CEA0"></span>新增 3 处</span>' +
        '<span class="legend-item"><span class="legend-swatch" style="background:#F3C8BF;box-shadow:inset 0 0 0 1px #E8A99B"></span>删除 1 处</span>' +
        '<span class="legend-item"><span class="legend-swatch" style="background:#EFE7DF"></span>未变化</span>' +
      '</div>';
  }

  /* ============================================================
     11. 工具切换
     ============================================================ */
  function updateRailVisibility() {
    var body = $('#wsBody') || $('.ws-body');
    var rail = $('#rail');
    var wide = (S.tool === 'merge' || S.tool === 'compare' || !S.doc);
    body.classList.toggle('no-rail', wide);
    rail.hidden = wide;
  }

  function showStage(kind) {
    $('#stageCanvas').hidden = kind !== 'doc';
    $('#stageEmpty').hidden = kind !== 'empty';
    $('#mergePreview').hidden = kind !== 'merge';
    $('#compareGrid').hidden = kind !== 'compare';
    $('#canvasToolbar').hidden = true;
  }

  function openTool(tool, skipRender) {
    S.tool = tool;
    switchView('workspace');
    $$('.tool-panel').forEach(function (p) { p.hidden = p.dataset.panel !== tool; });
    $('#toolSelect').value = tool;
    $$('.nav-item').forEach(function (b) {
      b.classList.toggle('is-active', b.dataset.tool ? navToolMatch(b.dataset.tool) : false);
    });

    if (tool === 'convert') {
      renderConvImages();
    }
    if (tool === 'merge') {
      renderMergeList(); renderMergePreview(); showStage('merge');
    } else if (tool === 'compare') {
      renderCompare(); showStage('compare');
    } else if (!S.doc) {
      showStage('empty');
    } else {
      showStage('doc');
      if (!skipRender) renderMain();
    }
    updateRailVisibility();
    updatePanelStateForTool();
    updateFootLabel();
    updateWsChrome();
    updateStatus();
  }

  function updateFootLabel() {
    var t = TOOLS[S.tool];
    var btn = $('.tool-panel[data-panel="' + S.tool + '"] [data-run="' + S.tool + '"]');
    if (!btn || !t) return;
    if (S.tool === 'convert') {
      var dir = convertDir();
      btn.textContent = dir === 'img2pdf' ? '生成 PDF 并另存' : dir === 'pdf2txt' ? '导出文本并另存' : '转换并另存';
      return;
    }
    btn.textContent = t.run;
  }

  /* 顶栏随工具变化：合并/对比时替换文件名区，并收起与页面无关的控件 */
  function updateWsChrome() {
    var isMerge = S.tool === 'merge';
    var isCmp = S.tool === 'compare';
    var name = $('#wsFileName'), sub = $('#wsFileSub');
    if (isMerge) {
      var total = S.mergeFiles.reduce(function (a, f) { return a + f.pages; }, 0);
      name.textContent = '合并 PDF';
      sub.textContent = S.mergeFiles.length + ' 个文件 · 共 ' + total + ' 页 · 按顺序拼接';
    } else if (isCmp) {
      name.textContent = '对比差异';
      sub.textContent = 'A 12 页 · B 13 页 · 文字对比';
    } else if (S.doc) {
      name.textContent = S.doc.name;
      sub.textContent = S.pages.length + ' 页 · ' + kb(S.doc.size) + ' · ' + (S.doc.kind === 'demo' ? '演示样张' : '本机文件');
    } else {
      name.textContent = '未打开文件';
      sub.textContent = '选择一个 PDF 开始';
    }
    var zn = document.querySelector('.zoom-group');
    var pn = document.querySelector('.page-nav');
    if (zn) zn.style.display = (isMerge || isCmp) ? 'none' : '';
    if (pn) pn.style.display = (isMerge || isCmp) ? 'none' : '';
    $('#btnSaveCopy').style.display = (isMerge || isCmp || !S.doc) ? 'none' : '';
  }

  /* ============================================================
     12. 面板状态机
     未选文件 / 加载中 / 可编辑 / 处理中 / 完成 / 失败 / 取消 /
     密码错误 / 格式不支持 / 功能未接入
     ============================================================ */
  function stateHost(tool) {
    return $('[data-state-for="' + tool + '"]');
  }

  function blockHTML(kind, iconName, title, desc, extra, actions) {
    return '<div class="state-block ' + kind + '">' +
      '<span class="sb-icon">' + icon(iconName) + '</span>' +
      '<div style="min-width:0;flex:1 1 auto">' +
        '<div class="sb-title">' + title + '</div>' +
        (desc ? '<div class="sb-desc">' + desc + '</div>' : '') +
        (extra ? '<div class="sb-extra">' + extra + '</div>' : '') +
        (actions ? '<div class="sb-actions">' + actions + '</div>' : '') +
      '</div></div>';
  }

  function setPanelState(tool, state, payload) {
    var host = stateHost(tool);
    if (!host) return;
    payload = payload || {};
    var html = '';

    if (state === 'idle') html = '';
    else if (state === 'nofile') {
      html = blockHTML('is-notice', 'file',
        '还没有选择文件',
        '这个工具需要 ' + (TOOLS[tool] ? TOOLS[tool].need : '1 个文件') + '。选择后即可在当前页预览与设置参数。',
        '',
        '<button class="btn btn-primary btn-sm" data-open-file>选择 PDF</button>' +
        '<button class="btn btn-ghost btn-sm" data-open-demo>用演示文档</button>');
    } else if (state === 'loading') {
      html = '<div class="progress-wrap"><div class="progress-head"><span>正在读取并生成缩略图…</span></div>' +
        '<div class="progress-track"><div class="progress-bar" style="width:38%"></div></div>' +
        '<p class="field-hint">大文件会慢一些，全部在本机完成。</p></div>';
    } else if (state === 'busy') {
      var pct = payload.pct || 0;
      html = '<div class="progress-wrap">' +
        '<div class="progress-head"><span>' + (payload.label || '正在处理…') + '</span><span class="pc">' + Math.round(pct) + '%</span></div>' +
        '<div class="progress-track"><div class="progress-bar" style="width:' + pct + '%"></div></div>' +
        '<div class="row-inline" style="margin-top:4px">' +
          '<p class="field-hint" style="flex:1">文件只在本机处理；保存前可以取消。</p>' +
          '<button class="btn btn-secondary btn-sm" data-cancel-run>取消</button>' +
        '</div></div>';
    } else if (state === 'done') {
      html = blockHTML('is-ok', 'check-circle',
        '处理完成 <span class="chip chip-local">本机处理</span>',
        '已生成 <strong>' + esc(payload.name || '结果文件.pdf') + '</strong>。原文件保持不变。',
        esc([payload.path, payload.note].filter(Boolean).join(' · ')),
        '<button class="btn btn-secondary btn-sm" data-open-result="' + esc(tool) + '">打开结果</button>' +
        '<button class="btn btn-ghost btn-sm" data-again>再试一次</button>');
    } else if (state === 'previewDone') {
      html = blockHTML('is-demo', 'sparkle',
        '界面状态预览',
        '这里只预览完成提示的样式，没有处理文件，也没有生成结果。',
        '',
        '<button class="btn btn-ghost btn-sm" data-again>执行本机功能</button>');
    } else if (state === 'error') {
      html = blockHTML('is-error', 'alert-circle',
        payload.title || '处理未完成',
        (payload.reason || '') + (payload.next ? ' ' + payload.next : ''),
        payload.extra || '',
        '<button class="btn btn-secondary btn-sm" data-again>重试</button>' +
        (payload.secondary ? '<button class="btn btn-ghost btn-sm" data-secondary>' + payload.secondary + '</button>' : ''));
    } else if (state === 'cancelled') {
      html = blockHTML('is-notice', 'info',
        '已取消',
        '本次结果已放弃，不会保存文件。当前页的计算可能仍需一点时间才会结束。',
        '',
        '<button class="btn btn-secondary btn-sm" data-again>重新开始</button>');
    } else if (state === 'password') {
      html = blockHTML('is-error', 'lock',
        '需要打开密码',
        '这个文件已加密。请输入密码后继续，密码只在本机使用，不会保存。',
        '错误：PasswordException · 未尝试任何云端解密',
        '<button class="btn btn-secondary btn-sm" data-pwd-retry>输入密码</button>');
    } else if (state === 'unsupported') {
      html = blockHTML('is-notice', 'slash',
        '这个格式本机引擎不支持',
        '当前引擎无法处理该文件类型。应用不会改用云端处理，也不会提供隐藏的后备通道，请换一个受支持的文件。',
        '支持：PDF、PNG、JPEG、文本',
        '<button class="btn btn-secondary btn-sm" data-open-file>换一个文件</button>');
    } else if (state === 'notready') {
      html = blockHTML('is-notice', 'slash',
        '功能尚未接入',
        '这项功能还没有接入本机处理引擎。当前版本不会把演示交互当成真实处理结果，也不会把文件上传到云端。',
        '',
        '<button class="btn btn-secondary btn-sm" data-open-demo>查看可用工具</button>');
    }

    host.innerHTML = html;
  }

  function updatePanelStateForTool() {
    var t = S.tool;
    if (t === 'merge' || t === 'compare') {
      if (!stateHost(t).innerHTML) setPanelState(t, 'idle');
      return;
    }
    if (t === 'convert' && convertDir() === 'img2pdf') {
      var host = stateHost(t);
      if (!host.innerHTML || /还没有选择文件/.test(host.innerHTML)) setPanelState(t, 'idle');
      return;
    }
    if (!S.doc) { setPanelState(t, 'nofile'); return; }
    if (stateHost(t).innerHTML === '' || /还没有选择文件/.test(stateHost(t).innerHTML)) {
      setPanelState(t, 'idle');
    }
  }

  /* ============================================================
     13. 本机 PDF 处理与保存
     ============================================================ */
  var PROGRESS_TEXT = {
    organize: ['正在按新顺序重排页面…', '正在写入输出对象…', '正在生成新文件…'],
    merge: ['正在读取第 1 个文件…', '正在拼接页面…', '正在生成合并文件…'],
    split: ['正在拆分页码范围…', '正在生成多个文件…', '正在核对页数…'],
    compress: ['正在重新编码图像…', '正在清理冗余对象…', '正在校验输出…'],
    convert: ['正在按 DPI 渲染页面…', '正在编码图片…', '正在写入输出…'],
    edit: ['正在合成叠加对象…', '正在写入页面内容…', '正在生成副本…'],
    annotate: ['正在写入批注…', '正在放置签名…', '正在生成副本…'],
    form: ['正在写入字段值…', '正在更新表单外观…', '正在生成副本…'],
    compare: ['正在提取文字…', '正在逐页比对…', '正在汇总差异…'],
    protect: ['正在生成加密句柄…', '正在写入权限…', '正在生成副本…'],
    redact: ['正在移除底层内容…', '正在重写页面流…', '正在生成脱敏副本…']
  };

  var IMPLEMENTED_TOOLS = { organize: true, merge: true, split: true, convert: true };
  var outputUrls = {};

  function friendlyError(err) {
    var msg = err && err.message ? err.message : String(err || '未知错误');
    var name = err && err.name;
    if (name === 'RangeError' || /array buffer|allocation failed|invalid string length|out of memory|heap/i.test(msg)) {
      return '文件太大，本机内存不足。请尝试分批处理（例如先拆分再合并），或关闭其他标签页后重试。';
    }
    if (/encrypt|password|encrypted/i.test(msg)) return '这个 PDF 有打开密码或加密限制，请先用本机 PDF 阅读器解锁后另存一份再处理。';
    if (/invalid pdf|header|endobj|catalog|failed to parse/i.test(msg)) return '文件不是可读取的 PDF，或文件内容已损坏。';
    if (/memory|allocation|large/i.test(msg)) return '文件太大，浏览器内存不足。请尝试分批处理或关闭其他标签页。';
    return msg;
  }

  function selectedSplitGroups() {
    if (!S.doc || S.doc.kind !== 'pdf') throw new Error('请先打开一个真实 PDF 文件。');
    var modeButton = $('#splitMode [aria-pressed="true"]');
    var groups = ZJPages.buildSplitGroups({
      mode: modeButton ? modeButton.dataset.mode : 'range',
      total: S.pages.length,
      sel: S.sel,
      rangeText: $('#pageRange') ? $('#pageRange').value : '',
      everyN: $('#everyN') ? $('#everyN').value : ''
    });
    return groups.map(function (g) {
      return {
        label: g.label,
        pages: g.indexes.map(function (i) { return S.pages[i]; })
      };
    });
  }

  function convertDir() {
    var b = $('#convDir [aria-pressed="true"]');
    return b ? b.dataset.dir : 'pdf2img';
  }

  function convertOrientation() {
    var b = $('#convOrient [aria-pressed="true"]');
    return b ? b.dataset.orient : 'auto';
  }

  function renderConvImages() {
    var host = $('#convImgList');
    if (!host) return;
    if (!S.convImages.length) {
      host.innerHTML = '<div class="field-hint">还没有选择图片。点下方按钮选择本机的 PNG 或 JPG。</div>';
      return;
    }
    host.innerHTML = S.convImages.map(function (img, i) {
      return '<div class="result-item"><span class="ri-name">' + esc(img.name) + '</span>' +
        '<span class="ri-meta">' + kb(img.size) + '</span>' +
        '<button class="icon-btn" data-imgdel="' + i + '" aria-label="移除">' + icon('x') + '</button></div>';
    }).join('');
  }

  /* 按当前页序把要导出的页面转成 pdf.js 页码；空白页单独标记 */
  function convertItems() {
    var scope = $('#convScope') ? $('#convScope').value : 'all';
    var positions;
    if (scope === 'current') {
      positions = [S.current];
    } else if (scope === 'custom') {
      var segs = ZJPages.parseSelection($('#convRange').value, S.pages.length);
      var picked = [];
      segs.forEach(function (seg) {
        for (var p = seg.from; p <= seg.to; p++) if (picked.indexOf(p - 1) === -1) picked.push(p - 1);
      });
      positions = picked.sort(function (a, b) { return a - b; });
    } else {
      positions = S.pages.map(function (_, i) { return i; });
    }
    return positions.map(function (pos) {
      var model = S.pages[pos];
      if (!model) throw new Error('页面范围超出当前文档。');
      if (model.blank) return { blank: ZJPages.displaySize(model) };
      return { page: model.index + 1 };
    });
  }

  function startConvert() {
    var pre = preflight('convert');
    if (!pre.ok) {
      setPanelState('convert', pre.state, pre.payload);
      setStatus('error', pre.state === 'nofile' ? '未选文件' : '未开始');
      return;
    }

    var dir = convertDir();
    var token = ++runToken;
    S.busy = true;
    var labels = PROGRESS_TEXT.convert;
    var setProgress = function (pct, label) {
      if (token !== runToken) return false;
      setPanelState('convert', 'busy', { pct: pct, label: label || labels[0] });
      return true;
    };
    var onStep = function (done, total, label) {
      return setProgress(10 + Math.round(done / total * 78), label);
    };
    setStatus('busy', '本机处理中');
    setProgress(5, labels[0]);

    var base = S.doc ? baseName(S.doc.name) : baseName((S.convImages[0] || {}).name || '图片合并');
    var job;

    if (dir === 'img2pdf') {
      job = ZJConvert.imagesToPdf(S.convImages, { orientation: convertOrientation() }, onStep).then(function (bytes) {
        return {
          blob: new Blob([bytes], { type: 'application/pdf' }),
          name: base + '_图片.pdf',
          note: '图片按列表顺序合成，每页一张；输出是图片页，不含文字层。'
        };
      });
    } else if (dir === 'pdf2txt') {
      job = ZJConvert.pdfToText(S.doc.pdf, { items: convertItems() }, onStep).then(function (text) {
        return {
          blob: new Blob([text], { type: 'text/plain;charset=utf-8' }),
          name: base + '.txt',
          note: '文本来自 PDF 的文字层。扫描件没有文字层时只会得到空提示。'
        };
      });
    } else {
      var fmt = document.querySelector('input[name="convFmt"]:checked');
      var fmtIndex = Array.prototype.indexOf.call(document.querySelectorAll('input[name="convFmt"]'), fmt);
      var type = fmtIndex === 1 ? 'image/jpeg' : 'image/png';
      job = ZJConvert.pdfToImages(S.doc.pdf, {
        items: convertItems(),
        dpi: parseInt($('#convDpi').value, 10) || 150,
        type: type,
        prefix: base
      }, onStep).then(function (images) {
        if (!window.JSZip) throw new Error('ZIP 组件没有加载，请重新启动应用。');
        var zip = new window.JSZip();
        images.forEach(function (img) { zip.file(img.name, img.blob); });
        return zip.generateAsync({ type: 'blob', compression: 'STORE' }).then(function (blob) {
          return {
            blob: blob,
            name: base + '_图片.zip',
            note: '共 ' + images.length + ' 张图片，已打包为 ZIP；解压后按页编号排列。'
          };
        });
      });
    }

    job.then(function (result) {
      if (token !== runToken) return;
      setProgress(94, '请在系统保存窗口中选择位置…');
      return saveBlob(result.blob, result.name).then(function (saved) {
        if (token !== runToken) return;
        S.busy = false;
        if (outputUrls.convert) URL.revokeObjectURL(outputUrls.convert);
        outputUrls.convert = URL.createObjectURL(result.blob);
        setPanelState('convert', 'done', { name: saved.name, path: saved.location, note: result.note, outputUrl: outputUrls.convert });
        setStatus('ready', '本机处理完成 · 已保存');
        markDirty(false);
        showToast('已生成并保存：' + saved.name, 'ok');
      });
    }).catch(function (err) {
      if (token !== runToken) return;
      S.busy = false;
      if (err && err.name === 'AbortError') {
        setPanelState('convert', 'cancelled'); setStatus('ready', '已取消'); return;
      }
      setPanelState('convert', 'error', { title: '本机转换失败', reason: friendlyError(err), next: '原文件没有被修改。' });
      setStatus('error', '处理失败');
    });
  }

  function preflight(tool) {
    if (tool === 'merge') {
      var realFiles = S.mergeFiles.filter(function (f) { return !!f.file; });
      if (realFiles.length < 2) {
        return { ok: false, state: 'error', payload: { title: '请添加至少两个本机 PDF', reason: '列表里的示例文件只是界面预览，不能用于生成结果。请点“添加文件”选择你自己的 PDF。', next: '' } };
      }
      return { ok: true };
    }
    if (tool === 'convert') {
      var dir = convertDir();
      if (dir === 'img2pdf') {
        if (!S.convImages.length) {
          return { ok: false, state: 'error', payload: { title: '请先选择图片', reason: '图片转 PDF 需要至少一张本机的 PNG 或 JPG 图片。', next: '' } };
        }
        return { ok: true };
      }
      if (!S.doc) return { ok: false, state: 'nofile' };
      if (S.doc.kind !== 'pdf' || !S.doc.pdf) {
        return { ok: false, state: 'error', payload: { title: '演示文档不能转换', reason: '请先打开自己的 PDF。演示样张只用于预览界面。', next: '' } };
      }
      if (dir === 'pdf2img' || dir === 'pdf2txt') {
        try {
          convertItems();
        } catch (err) {
          return { ok: false, state: 'error', payload: { title: '页面范围需要检查', reason: friendlyError(err), next: '' } };
        }
      }
      return { ok: true };
    }
    if (!IMPLEMENTED_TOOLS[tool]) return { ok: false, state: 'notready' };
    if (!S.doc) return { ok: false, state: 'nofile' };
    if (S.doc.kind !== 'pdf' || !S.doc.file) {
      return { ok: false, state: 'error', payload: { title: '演示文档不能导出', reason: '请先打开自己的 PDF。演示样张只用于预览界面。', next: '' } };
    }
    if (tool === 'organize' && !S.pages.length) {
      return { ok: false, state: 'error', payload: { title: '文档没有页面', reason: '至少保留一页后才能导出。', next: '' } };
    }
    if (tool === 'split') {
      try {
        if (!selectedSplitGroups().length) throw new Error('没有可导出的页面。');
      } catch (err) {
        return { ok: false, state: 'error', payload: { title: '拆分参数需要检查', reason: friendlyError(err), next: '' } };
      }
    }
    return { ok: true };
  }

  function resultOf(tool) {
    var base = S.doc ? S.doc.name.replace(/\.pdf$/i, '') : '合并结果';
    var map = {
      organize: $('#orgOutName') ? $('#orgOutName').value : base + '_已整理.pdf',
      merge: $('#mergeOutName') ? $('#mergeOutName').value : '合并结果_20261116.pdf',
      split: ($('#splitPrefix') ? $('#splitPrefix').value : base) + '_第1部分.pdf',
      compress: $('#cmpOutName') ? $('#cmpOutName').value : base + '_压缩.pdf',
      convert: base + '_第1页.png',
      edit: base + '_已编辑.pdf',
      annotate: base + '_已批注.pdf',
      form: base + '_已填写.pdf',
      compare: 'diff_' + base + '.txt',
      protect: base + '_已保护.pdf',
      redact: base + '_已脱敏.pdf'
    };
    return { name: map[tool] || (base + '_输出.pdf'), path: '保存位置由你在系统保存窗口中选择' };
  }

  function safeFileName(name, fallback) {
    var cleaned = String(name || fallback || '输出.pdf').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim();
    return cleaned || (fallback || '输出.pdf');
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
    return url;
  }

  var SAVE_TYPES = {
    '.pdf': { mime: 'application/pdf', desc: 'PDF 文档' },
    '.zip': { mime: 'application/zip', desc: 'ZIP 压缩包' },
    '.txt': { mime: 'text/plain', desc: '纯文本' },
    '.png': { mime: 'image/png', desc: 'PNG 图片' },
    '.jpg': { mime: 'image/jpeg', desc: 'JPEG 图片' }
  };

  function saveBlob(blob, name, mime) {
    name = safeFileName(name, '输出.pdf');
    var found = name.match(/\.(pdf|zip|txt|png|jpg|jpeg)$/i);
    if (!found) {
      name += '.pdf';
      found = ['.pdf'];
    }
    var ext = found[0].toLowerCase();
    if (ext === '.jpeg') ext = '.jpg';
    var meta = SAVE_TYPES[ext] || SAVE_TYPES['.pdf'];

    if (window.zjDesktop && typeof window.zjDesktop.saveFile === 'function') {
      return blob.arrayBuffer().then(function (buffer) {
        return window.zjDesktop.saveFile(name, new Uint8Array(buffer));
      }).then(function (result) {
        if (!result || result.canceled) {
          var cancel = new Error('已取消保存');
          cancel.name = 'AbortError';
          throw cancel;
        }
        if (result.error) throw new Error(result.error);
        return { name: result.name || name, location: result.path || '已保存' };
      });
    }

    if (typeof window.showSaveFilePicker === 'function') {
      var type = meta.mime;
      var pickerOpened = false;
      return window.showSaveFilePicker({
        suggestedName: name,
        types: [{ description: meta.desc, accept: (function () { var o = {}; o[type] = [ext]; return o; })() }]
      }).then(function (handle) {
        pickerOpened = true;
        return handle.createWritable().then(function (writable) {
          return writable.write(blob).then(function () { return writable.close(); }).then(function () {
            return { name: handle.name || name, location: '已通过系统保存窗口保存' };
          });
        });
      }).catch(function (err) {
        if (err && err.name === 'AbortError') throw err;
        if (pickerOpened) throw err;
        var url = downloadBlob(blob, name);
        return { name: name, location: '已下载到浏览器默认下载位置', url: url };
      });
    }
    var fallbackUrl = downloadBlob(blob, name);
    return Promise.resolve({ name: name, location: '已下载到浏览器默认下载位置', url: fallbackUrl });
  }

  function saveSourceCopy() {
    if (!S.doc || S.doc.kind !== 'pdf' || !S.doc.file) { showToast('请先打开一个真实 PDF 文件', 'warn'); return; }
    var name = safeFileName(S.doc.name.replace(/\.pdf$/i, '') + '_副本.pdf', '副本.pdf');
    S.doc.file.arrayBuffer().then(function (buffer) {
      return saveBlob(new Blob([buffer], { type: 'application/pdf' }), name, 'application/pdf');
    }).then(function (result) {
      showToast('副本已交给系统保存：' + result.name, 'ok');
    }).catch(function (err) {
      if (err && err.name === 'AbortError') { showToast('已取消保存', 'info'); return; }
      showToast('保存失败：' + friendlyError(err), 'warn');
    });
  }

  function cancelRun() {
    var tool = S.tool;
    runToken++;
    S.busy = false;
    setPanelState(tool, 'cancelled');
    setStatus('ready', '已取消');
    showToast('已请求停止；未开始保存的处理不会写入文件', 'info');
  }

  function startRun(tool) {
    if (blockWhileLoading()) return;
    if (tool === 'convert') { startConvert(); return; }
    var pre = preflight(tool);
    if (!pre.ok) {
      setPanelState(tool, pre.state, pre.payload);
      setStatus('error', pre.state === 'nofile' ? '未选文件' : '未开始');
      return;
    }

    var doRun = function () {
      var token = ++runToken;
      S.busy = true;
      var labels = PROGRESS_TEXT[tool] || ['正在本机处理…'];
      var setProgress = function (pct, label) {
        if (token !== runToken) return false;
        setPanelState(tool, 'busy', { pct: pct, label: label || labels[0] });
        return true;
      };
      setStatus('busy', '本机处理中');
      setProgress(5, labels[0]);
      var artifact = resultOf(tool);
      var bytesPromise;
      if (tool === 'merge') {
        bytesPromise = ZJEngine.merge(S.mergeFiles.filter(function (f) { return !!f.file; }), !!($('#mergeSep') && $('#mergeSep').checked), function (done, total) {
          return setProgress(10 + Math.round(done / total * 78), done === total ? '正在生成合并文件…' : '正在读取第 ' + done + ' 个文件…');
        });
      } else if (tool === 'organize') {
        bytesPromise = ZJEngine.createFromPages(S.doc.file, S.pages, function (done, total) {
          return setProgress(10 + Math.round(done / total * 78), '正在处理第 ' + done + ' / ' + total + ' 页…');
        });
      } else {
        var groups;
        try { groups = selectedSplitGroups(); } catch (err) {
          S.busy = false; setPanelState(tool, 'error', { title: '拆分参数需要检查', reason: friendlyError(err) }); setStatus('error', '未开始'); return;
        }
        var prefix = safeFileName(($('#splitPrefix') ? $('#splitPrefix').value : '').trim() || baseName(S.doc.name), '拆分结果');
        var outputs = [];
        bytesPromise = groups.reduce(function (chain, group, index) {
          return chain.then(function () {
            if (token !== runToken) throw Object.assign(new Error('已取消处理'), { name: 'AbortError' });
            return ZJEngine.createFromPages(S.doc.file, group.pages, function (done, total) {
              return setProgress(8 + Math.round((index + done / total) / groups.length * 80), '正在生成第 ' + (index + 1) + ' / ' + groups.length + ' 个文件…');
            }).then(function (bytes) {
              outputs.push({ name: safeFileName(prefix + '_第' + (index + 1) + '部分.pdf', '拆分结果.pdf'), bytes: bytes });
            });
          });
        }, Promise.resolve()).then(function () {
          if (!window.JSZip) throw new Error('ZIP 组件没有加载，请重新启动应用。');
          var zip = new window.JSZip();
          outputs.forEach(function (item) { zip.file(item.name, item.bytes); });
          artifact.name = safeFileName(prefix + '_拆分结果.zip', '拆分结果.zip');
          return zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
        });
      }

      Promise.resolve(bytesPromise).then(function (result) {
        if (token !== runToken) return;
        var blob = result instanceof Blob ? result : new Blob([result], { type: 'application/pdf' });
        setProgress(94, '请在系统保存窗口中选择位置…');
        return saveBlob(blob, artifact.name, /\.zip$/i.test(artifact.name) ? 'application/zip' : 'application/pdf').then(function (saved) {
          if (token !== runToken) return;
          S.busy = false;
          if (outputUrls[tool]) URL.revokeObjectURL(outputUrls[tool]);
          outputUrls[tool] = URL.createObjectURL(blob);
          var note = tool === 'merge'
            ? '书签未保留；交互式表单、数字签名等文档级内容可能不会复制。'
            : tool === 'organize'
              ? '此导出会复制页面内容；书签和交互式表单等文档级内容可能不会保留。'
              : '拆分输出已打包为 ZIP；解压后可见各个 PDF。';
          setPanelState(tool, 'done', { name: saved.name, path: saved.location, note: note, outputUrl: outputUrls[tool] });
          setStatus('ready', '本机处理完成 · 已保存');
          markDirty(false);
          showToast('已生成并保存：' + saved.name, 'ok');
        });
      }).catch(function (err) {
        if (token !== runToken) return;
        S.busy = false;
        if (err && err.name === 'AbortError') {
          setPanelState(tool, 'cancelled'); setStatus('ready', '已取消保存'); return;
        }
        setPanelState(tool, 'error', { title: '本机处理失败', reason: friendlyError(err), next: '原文件没有被修改。' });
        setStatus('error', '处理失败');
      });
    };

    if (!IMPLEMENTED_TOOLS[tool]) { setPanelState(tool, 'notready'); return; }
    if (tool === 'organize') {
      openDialog({
        title: '另存为新文件',
        desc: '处理结果会在本机生成一个新 PDF。接下来由系统保存窗口选择保存位置，原文件保持不变。',
        icon: 'save', confirmText: '继续并另存',
        extra: '文件名：' + resultOf(tool).name,
        onConfirm: doRun
      });
      return;
    }
    doRun();
  }

  /* ============================================================
     14. 对象（编辑 / 批注 / 脱敏标记）
     ============================================================ */
  function addObject(opts) {
    if (!S.doc) { showToast('先打开一个 PDF', 'warn'); return; }
    var id = ++S.objSeq;
    var obj = {
      id: id,
      label: opts.label || '文本',
      x: opts.x != null ? opts.x : 22,
      y: opts.y != null ? opts.y : 34,
      w: opts.w || 44,
      h: opts.h || 7,
      kind: opts.kind || 'text',
      text: opts.text || ''
    };
    S.objects.push(obj);
    paintObjects();
    selectObject(id);
    return obj;
  }

  function paintObjects() {
    var host = $('#objLayer');
    var html = '';
    S.objects.forEach(function (o) {
      var dark = o.kind === 'redact';
      html += '<div class="obj-box" data-obj="' + o.id + '" style="left:' + o.x + '%;top:' + o.y + '%;width:' + o.w + '%;height:' + o.h + '%;' +
        (dark ? 'background:#2B211C;border-color:#2B211C;' : '') + '">' +
        '<span class="obj-label" style="' + (dark ? 'background:#2B211C' : '') + '">' + esc(o.label) + '</span>' +
        '<span class="obj-handle" style="right:-5px;bottom:-5px"></span>' +
      '</div>';
    });
    host.innerHTML = html;
  }

  var selectedObj = null;
  function selectObject(id) {
    selectedObj = id;
    $$('.obj-box').forEach(function (b) {
      b.classList.toggle('is-selected', String(b.dataset.obj) === String(id));
    });
    $('#canvasToolbar').hidden = id == null;
  }

  function removeObject(id) {
    S.objects = S.objects.filter(function (o) { return String(o.id) !== String(id); });
    S.redMarks = S.redMarks.filter(function (m) { return String(m) !== String(id); });
    paintObjects();
    selectObject(null);
    renderRedList();
  }

  function initObjectDrag() {
    var host = $('#objLayer');
    host.addEventListener('mousedown', function (e) {
      var box = e.target.closest('.obj-box');
      if (!box) { selectObject(null); return; }
      e.preventDefault();
      var id = box.dataset.obj;
      selectObject(id);
      var obj = S.objects.filter(function (o) { return String(o.id) === String(id); })[0];
      if (!obj) return;
      var parent = $('#stageCanvas').getBoundingClientRect();
      var startX = e.clientX, startY = e.clientY, ox = obj.x, oy = obj.y;
      function move(ev) {
        obj.x = Math.max(0, Math.min(96 - obj.w, ox + (ev.clientX - startX) / parent.width * 100));
        obj.y = Math.max(0, Math.min(96 - obj.h, oy + (ev.clientY - startY) / parent.height * 100));
        paintObjects();
      }
      function up() {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        paintObjects();
        $$('.obj-box').forEach(function (b) { b.classList.toggle('is-selected', b.dataset.obj === String(id)); });
      }
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  function renderRedList() {
    var host = $('#redList');
    if (!host) return;
    if (!S.redMarks.length) {
      host.innerHTML = '<div class="field-hint">还没有标记。用「选择文字」或「绘制区域」在页面上标出要移除的内容。</div>';
    } else {
      host.innerHTML = S.redMarks.map(function (m, i) {
        return '<div class="result-item"><span class="chip chip-neutral" style="height:18px">第 ' + (S.current + 1) + ' 页</span>' +
          '<span class="ri-name">标记 ' + (i + 1) + ' · ' + (i === 0 ? '身份证号 ····12' : '电话 138****') + '</span>' +
          '<span class="ri-meta">区域</span></div>';
      }).join('');
    }
    $('#btnRedactRun').disabled = !$('#redConfirm').checked || !S.redMarks.length;
  }

  /* ============================================================
     15. 对话框
     ============================================================ */
  var dialogKeyHandler = null;

  function openDialog(opt) {
    var mount = $('#overlayMount');
    var id = 'dlg' + Date.now();
    var bullets = opt.bullets && opt.bullets.length
      ? '<div class="dialog-extra' + (opt.danger ? ' is-danger' : '') + '"><ul>' +
        opt.bullets.map(function (b) { return '<li>' + esc(b) + '</li>'; }).join('') + '</ul></div>' : '';
    var extra = opt.extra && !bullets ? '<div class="dialog-extra">' + esc(opt.extra) + '</div>' : '';
    var inputHTML = opt.input
      ? '<div class="field" style="margin-top:12px"><label class="field-label" for="' + id + '_in">' + esc(opt.input.label) + '</label>' +
        '<input class="input" id="' + id + '_in" type="' + (opt.input.type || 'text') + '" placeholder="' + esc(opt.input.placeholder || '') + '"></div>' : '';
    var checkHTML = opt.requireCheck
      ? '<label class="check-row dialog-confirm"><input type="checkbox" id="' + id + '_ck"><span>' + esc(opt.requireCheck) + '</span></label>' : '';

    mount.innerHTML =
      '<div class="overlay" id="' + id + '">' +
        '<div class="dialog" role="dialog" aria-modal="true" aria-labelledby="' + id + '_t">' +
          '<div class="dialog-head">' +
            '<span class="dialog-icon ' + (opt.danger ? 'is-danger' : opt.icon === 'alert-triangle' ? 'is-warn' : '') + '">' + icon(opt.icon || 'info') + '</span>' +
            '<div style="flex:1;min-width:0"><div class="dialog-title" id="' + id + '_t">' + opt.title + '</div></div>' +
          '</div>' +
          '<div class="dialog-body">' +
            (opt.desc ? '<p>' + esc(opt.desc) + '</p>' : '') +
            bullets + extra + inputHTML + checkHTML +
          '</div>' +
          '<div class="dialog-foot">' +
            (opt.cancelText === null ? '' : '<button class="btn btn-ghost" data-dlg-cancel>' + esc(opt.cancelText || '取消') + '</button>') +
            '<button class="btn ' + (opt.danger ? 'btn-danger' : 'btn-primary') + '" data-dlg-ok>' + esc(opt.confirmText || '确定') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    var overlay = $('#' + id);
    var okBtn = $('[data-dlg-ok]', overlay);

    function close() {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      dialogKeyHandler = null;
    }
    function confirm() {
      var val = opt.input ? $('#' + id + '_in').value : null;
      if (opt.requireCheck) {
        var ck = $('#' + id + '_ck');
        if (ck && !ck.checked) { showToast('请先勾选确认项', 'warn'); return; }
      }
      var keep = opt.onConfirm && opt.onConfirm(val);
      if (keep === false) return;
      close();
    }
    function onKey(e) {
      if (e.key === 'Escape') { close(); if (opt.onCancel) opt.onCancel(); }
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); confirm(); }
    }
    okBtn.addEventListener('click', confirm);
    var cancelBtn = $('[data-dlg-cancel]', overlay);
    if (cancelBtn) cancelBtn.addEventListener('click', function () {
      close();
      if (opt.onCancel) opt.onCancel();
    });
    overlay.addEventListener('mousedown', function (e) {
      if (e.target === overlay) { close(); if (opt.onCancel) opt.onCancel(); }
    });
    document.addEventListener('keydown', onKey);
    dialogKeyHandler = onKey;

    setTimeout(function () {
      var inp = $('#' + id + '_in');
      if (inp) inp.focus(); else okBtn.focus();
    }, 40);
  }

  /* ============================================================
     16. Toast
     ============================================================ */
  function showToast(msg, type) {
    var stack = $('#toastStack');
    var el = document.createElement('div');
    el.className = 'toast' + (type === 'warn' ? ' is-warn' : type === 'ok' ? ' is-ok' : '');
    el.innerHTML = icon(type === 'ok' ? 'check-circle' : type === 'warn' ? 'alert-circle' : 'info') + '<span>' + esc(msg) + '</span>';
    stack.appendChild(el);
    while (stack.children.length > 3) stack.removeChild(stack.firstChild);
    setTimeout(function () {
      el.classList.add('is-out');
      setTimeout(function () { el.remove(); }, 220);
    }, 3200);
  }

  /* ============================================================
     17. 状态栏
     ============================================================ */
  function setStatus(kind, text) {
    var dot = $('#sbStatusDot');
    dot.className = 'sb-status-dot' + (kind === 'busy' ? ' is-busy' : kind === 'error' ? ' is-error' : '');
    $('#sbStatus').textContent = text || '就绪';
  }

  function updateStatus() {
    if (S.tool === 'merge') {
      var total = S.mergeFiles.reduce(function (a, f) { return a + f.pages; }, 0);
      setStatus('ready', '就绪');
      $('#sbDetail').textContent = S.mergeFiles.length + ' 个文件 · 共 ' + total + ' 页';
      $('#sbSelInfo').textContent = total ? '预览顺序即输出顺序' : '还没有文件';
      return;
    }
    if (S.tool === 'compare') {
      setStatus('ready', '就绪');
      $('#sbDetail').textContent = 'A / B 并排 · 文字级对比';
      $('#sbSelInfo').textContent = '2 个版本';
      return;
    }
    if (!S.doc) {
      setStatus('ready', '未打开文件');
      $('#sbDetail').textContent = '选择一个 PDF 开始';
      $('#sbSelInfo').textContent = '未选择页面';
      return;
    }
    setStatus('ready', S.doc.kind === 'demo' ? '就绪 · 演示渲染' : '就绪 · 本地文件');
    $('#sbDetail').textContent = '页 ' + (S.current + 1) + ' / ' + S.pages.length + ' · 缩放 ' + Math.round(S.zoom * 100) + '%';
    $('#sbSelInfo').textContent = S.sel.length ? '已选 ' + S.sel.length + ' 页' : '未选择页面';
  }

  /* ============================================================
     18. 设置
     ============================================================ */
  function syncSettings() {
    var n = S.recent.length;
    var el = $('#setRecentNum');
    if (el) el.textContent = n;
    var sw = $('#setRecent');
    if (sw) sw.checked = S.recentOn;
  }

  function clearRecent() {
    if (!S.recent.length) { showToast('没有可清除的记录', 'info'); return; }
    openDialog({
      title: '清除最近文件记录？',
      desc: '列表会被清空，但不会删除任何原始 PDF 文件。此操作不可撤销。',
      icon: 'trash', confirmText: '清除记录',
      bullets: ['将清除 ' + S.recent.length + ' 条记录', '只删除文件名与时间索引，不保存文件内容', '不会改动磁盘上的文件'],
      onConfirm: function () {
        S.recent = [];
        saveRecentStore();
        renderRecent();
        syncSettings();
        showToast('已清除最近文件记录', 'ok');
      }
    });
  }

  /* ============================================================
     19. 演示状态控制（评审用）
     ============================================================ */
  function closeDevPop() {
    var p = $('#devPop');
    if (p) p.remove();
  }

  function toggleDevPop(anchor) {
    if ($('#devPop')) { closeDevPop(); return; }
    var states = [
      ['nofile', '未选文件', 'no-file'],
      ['busy', '处理中', 'busy'],
      ['done', '演示完成', 'done'],
      ['error', '处理失败', 'error'],
      ['cancelled', '已取消', 'busy'],
      ['password', '需要密码', 'error'],
      ['unsupported', '格式不支持', 'error'],
      ['notready', '功能未接入', 'busy'],
      ['idle', '清除状态', 'ready']
    ];
    var html = '<div class="dev-pop" id="devPop" role="dialog" aria-label="演示状态控制">' +
      '<h4>' + icon('gauge', 14) + ' 演示状态</h4>' +
      '<p class="dev-note">切换右栏面板的状态，用来检查每种提示的文案与层级。不改变文件。</p>' +
      '<div class="dev-grid">' +
      states.map(function (s) {
        return '<button data-st="' + s[0] + '"><span class="d"></span>' + s[1] + '</button>';
      }).join('') +
      '</div></div>';
    /* 挂到 body 上，避免所在顶栏被隐藏时不渲染 */
    document.body.insertAdjacentHTML('beforeend', html);
    var pop = $('#devPop');
    var rect = (anchor && anchor.getBoundingClientRect) ? anchor.getBoundingClientRect() : null;
    pop.style.position = 'fixed';
    if (rect && rect.width) {
      pop.style.top = Math.round(rect.bottom + 8) + 'px';
      pop.style.right = Math.max(12, Math.round(window.innerWidth - rect.right - 40)) + 'px';
    } else {
      pop.style.top = '70px';
      pop.style.right = '24px';
    }

    pop.addEventListener('click', function (e) {
      var b = e.target.closest('[data-st]');
      if (!b) return;
      var st = b.dataset.st;
      var tool = S.tool;
      if (!S.doc && tool !== 'merge' && tool !== 'compare' && st !== 'nofile') {
        showToast('先打开一个文件，或切到合并工具再试', 'warn');
      }
      if (st === 'busy') setPanelState(tool, 'busy', { pct: 46, label: (PROGRESS_TEXT[tool] || ['正在处理…'])[1] });
      else if (st === 'done') setPanelState(tool, 'previewDone', resultOf(tool));
      else if (st === 'error') setPanelState(tool, 'error', { title: '输出目录不可写', reason: '无法写入 D:\\报销\\ 目录，可能是权限不足或磁盘已满。', next: '请换一个输出目录后重试。', secondary: '换目录' });
      else if (st === 'password') setPanelState(tool, 'password');
      else if (st === 'unsupported') setPanelState(tool, 'unsupported');
      else if (st === 'notready') setPanelState(tool, 'notready');
      else if (st === 'cancelled') setPanelState(tool, 'cancelled');
      else if (st === 'nofile') setPanelState(tool, 'nofile');
      else { setPanelState(tool, 'idle'); }
      closeDevPop();
    });
  }

  /* ============================================================
     20. 拆分预览
     ============================================================ */
  function updateSplitPreview() {
    var total = S.pages.length;
    var host = $('#splitResult');
    if (!host) return;
    var modeButton = $('#splitMode [aria-pressed="true"]');
    var items;
    try {
      items = ZJPages.buildSplitGroups({
        mode: modeButton ? modeButton.dataset.mode : 'range',
        total: total,
        sel: S.sel,
        rangeText: $('#pageRange') ? $('#pageRange').value : '',
        everyN: $('#everyN') ? $('#everyN').value : ''
      });
    } catch (err) {
      host.innerHTML = '<div class="field-hint">' + esc(friendlyError(err)) + '</div>';
      return;
    }
    if (!items.length) {
      host.innerHTML = '<div class="field-hint">没有解析到有效页码范围，请检查输入。</div>';
      return;
    }
    var prefix = $('#splitPrefix') ? $('#splitPrefix').value : '输出';
    host.innerHTML = items.slice(0, 6).map(function (it, i) {
      return '<div class="result-item"><span class="ri-name">' + esc(prefix) + '_第' + (i + 1) + '部分.pdf</span>' +
        '<span class="ri-meta">' + esc(it.label) + ' 页</span></div>';
    }).join('') + (items.length > 6 ? '<div class="field-hint">还有 ' + (items.length - 6) + ' 个文件…</div>' : '') +
      '<div class="field-hint">共 ' + items.length + ' 个文件，将打包为一个 ZIP 保存。</div>';
  }

  /* ============================================================
     21. 事件绑定
     ============================================================ */
  function bind() {
    /* 导航 */
    $('#nav').addEventListener('click', function (e) {
      var b = e.target.closest('.nav-item');
      if (!b) return;
      if (b.dataset.view) {
        if (b.dataset.view === 'workspace') return;
        switchView(b.dataset.view);
      } else if (b.dataset.tool) {
        openTool(b.dataset.tool);
      }
    });
    $('#brandHome').addEventListener('click', function () { switchView('home'); });

    /* 首页工具卡 */
    $('#toolGroups').addEventListener('click', function (e) {
      var card = e.target.closest('.tool-card');
      if (!card) return;
      if (card.dataset.unsupported) {
        openDialog({
          title: '本机无法完成「' + card.dataset.unsupported + '」',
          desc: '这项能力需要额外的本机模型或转换组件，当前版本还未包含。应用不会在你点击后把文件发送到云端。',
          icon: 'slash',
          extra: '目前请使用你已有的本机工具完成这项工作。',
          cancelText: '知道了',
          confirmText: '看我本机能做什么',
          onConfirm: function () { switchView('home'); $('#toolGroups').scrollIntoView({ behavior: 'smooth' }); }
        });
        return;
      }
      openTool(card.dataset.openTool);
    });

    /* 打开文件 */
    ['#btnOpenHome', '#btnPick', '#btnPickInStage', '#btnOpenRecent'].forEach(function (sel) {
      var el = $(sel);
      if (el) el.addEventListener('click', pickFiles);
    });
    $('#fileInput').addEventListener('change', function (e) { onFilesPicked(e.target.files); });
    $('#btnDemoDoc').addEventListener('click', openDemo);

    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-open-file]')) { pickFiles(); }
      if (e.target.closest('[data-open-demo]')) { openDemo(); }
      if (e.target.closest('[data-again]')) {
        var panel = e.target.closest('.tool-panel');
        if (panel) startRun(panel.dataset.panel);
      }
      if (e.target.closest('[data-cancel-run]')) cancelRun();
      var openResult = e.target.closest('[data-open-result]');
      if (openResult) {
        var resultUrl = outputUrls[openResult.dataset.openResult];
        if (resultUrl) window.open(resultUrl, '_blank', 'noopener');
      }
      if (e.target.closest('[data-secondary]')) {
        var t = e.target.closest('.tool-panel');
        if (t && t.dataset.panel === 'error') pickFiles();
      }
      if (e.target.closest('[data-pwd-retry]')) {
        openDialog({
          title: '输入打开密码',
          desc: '密码只在本机用于解密，不会保存，也不会发送到任何地方。',
          icon: 'lock',
          input: { label: '打开密码', type: 'password' },
          confirmText: '解锁',
          onConfirm: function (v) {
            if (!v) { showToast('请输入密码', 'warn'); return false; }
            showToast('演示：密码校验需要引擎接入', 'warn');
          }
        });
      }
      var ro = e.target.closest('[data-recent-open]');
      if (ro) { e.stopPropagation(); openRecent(parseInt(ro.dataset.recentOpen, 10)); }
    });

    /* 拖放 */
    var dz = $('#dropzone');
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) {
        e.preventDefault(); dz.classList.add('is-drag');
      });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) {
        e.preventDefault();
        if (ev === 'dragleave' && e.relatedTarget && dz.contains(e.relatedTarget)) return;
        dz.classList.remove('is-drag');
      });
    });
    dz.addEventListener('drop', function (e) {
      if (e.dataTransfer.files && e.dataTransfer.files.length) onFilesPicked(e.dataTransfer.files);
    });
    dz.addEventListener('click', function (e) {
      if (e.target.closest('button')) return;
      pickFiles();
    });
    dz.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pickFiles(); }
    });
    window.addEventListener('dragover', function (e) { e.preventDefault(); });
    /* 浏览器模式下用 beforeunload 兜底；桌面版由主进程弹确认框 */
    if (!(window.zjDesktop && window.zjDesktop.isDesktop)) {
      window.addEventListener('beforeunload', function (e) {
        if (!dirty) return;
        e.preventDefault();
        e.returnValue = '';
        return '';
      });
    } else if (typeof window.zjDesktop.onSaveRequest === 'function') {
      window.zjDesktop.onSaveRequest(function () { requestSave(); });
    }

    window.addEventListener('drop', function (e) {
      e.preventDefault();
      if (e.target.closest('#stageViewport') && e.dataTransfer.files.length) onFilesPicked(e.dataTransfer.files);
    });

    /* 最近文件 */
    function recentClick(e) {
      var row = e.target.closest('[data-recent-idx]');
      if (!row) return;
      openRecent(parseInt(row.dataset.recentIdx, 10));
    }
    $('#recentCard').addEventListener('click', recentClick);
    $('#recentCardFull').addEventListener('click', recentClick);
    ['#btnClearRecent', '#btnClearRecent2', '#btnClearRecent3'].forEach(function (s) {
      var el = $(s); if (el) el.addEventListener('click', clearRecent);
    });

    /* 工作区顶栏 */
    $('#btnBack').addEventListener('click', function () { switchView('home'); });
    $('#btnCloseDoc').addEventListener('click', function () {
      openDialog({
        title: '关闭当前文档？',
        desc: '未保存的页面调整只保留在内存中。关闭后这些改动会丢失，原文件不会受影响。',
        icon: 'x', confirmText: '关闭文档',
        onConfirm: function () {
          S.doc = null; S.pages = []; S.sel = []; S.objects = []; S.redMarks = [];
          openTool('organize');
          showToast('已关闭文档', 'info');
        }
      });
    });
    $('#btnUndo').addEventListener('click', undo);
    $('#btnRedo').addEventListener('click', redo);
    $('#zoomIn').addEventListener('click', function () { setZoom(S.zoom + 0.1); });
    $('#zoomOut').addEventListener('click', function () { setZoom(S.zoom - 0.1); });
    $('#zoomVal').addEventListener('click', function () { setZoom(1); });
    $('#pagePrev').addEventListener('click', function () { goPage(S.current - 1); });
    $('#pageNext').addEventListener('click', function () { goPage(S.current + 1); });
    $('#pageInput').addEventListener('change', function (e) {
      var v = parseInt(e.target.value, 10);
      if (!isNaN(v)) goPage(v - 1); else updateNav();
    });
    $('#btnSaveCopy').addEventListener('click', saveSourceCopy);

    /* 缩略图栏 */
    $('#thumbList').addEventListener('click', function (e) {
      var act = e.target.closest('[data-thumbact]');
      if (act) {
        e.stopPropagation();
        pageAct(act.dataset.thumbact, parseInt(act.dataset.idx, 10));
        return;
      }
      var pick = e.target.closest('.thumb-pick');
      var thumb = e.target.closest('.thumb');
      if (!thumb) return;
      var i = parseInt(thumb.dataset.idx, 10);
      if (pick) { toggleSel(i); return; }
      if (e.shiftKey) { extendSel(i); renderMain(); }
      else if (e.ctrlKey || e.metaKey) { toggleSel(i); }
      else selectOnly(i);
    });
    $('#btnSelectAll').addEventListener('click', function () {
      if (S.sel.length === S.pages.length) S.sel = [];
      else S.sel = S.pages.map(function (_, i) { return i; });
      syncSelUI();
    });
    $('#btnAddBlank').addEventListener('click', function () { insertBlank('after'); });
    $('#btnInsertBlank').addEventListener('click', function () { insertBlank($('#blankPos').value); });

    /* 缩略图拖拽排序 */
    var dragIdx = null;
    $('#thumbList').addEventListener('dragstart', function (e) {
      var t = e.target.closest('.thumb');
      if (!t) return;
      dragIdx = parseInt(t.dataset.idx, 10);
      t.classList.add('is-dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', String(dragIdx)); } catch (err) {}
    });
    $('#thumbList').addEventListener('dragend', function (e) {
      $$('.thumb').forEach(function (t) { t.classList.remove('is-dragging', 'drop-before', 'drop-after'); });
      dragIdx = null;
    });
    $('#thumbList').addEventListener('dragover', function (e) {
      var t = e.target.closest('.thumb');
      if (!t || dragIdx === null) return;
      e.preventDefault();
      var r = t.getBoundingClientRect();
      var after = (e.clientY - r.top) > r.height / 2;
      $$('.thumb').forEach(function (x) { x.classList.remove('drop-before', 'drop-after'); });
      t.classList.add(after ? 'drop-after' : 'drop-before');
    });
    $('#thumbList').addEventListener('drop', function (e) {
      var t = e.target.closest('.thumb');
      if (!t || dragIdx === null) return;
      if (blockWhileLoading()) return;
      e.preventDefault();
      var to = parseInt(t.dataset.idx, 10);
      var r = t.getBoundingClientRect();
      var after = (e.clientY - r.top) > r.height / 2;
      var target = to + (after ? 1 : 0);
      var landed = dragIdx < target ? target - 1 : target;
      S.pages = ZJPages.move(S.pages, dragIdx, target);
      S.sel = [landed]; S.current = landed;
      pushHistory(); buildThumbs(); renderMain(); updateSel(); updateNav();
      showToast('已移动页面到第 ' + (landed + 1) + ' 位', 'ok');
    });

    /* 触屏与手写笔：HTML5 拖放在触屏上不会触发 dragstart，这里用 Pointer 事件补齐 */
    var touchDrag = null;
    function clearDropMarks() {
      $$('.thumb, #mergeFiles .file-item').forEach(function (t) {
        t.classList.remove('is-dragging', 'drop-before', 'drop-after');
      });
    }
    $('#thumbList').addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' || e.button > 0) return;
      if (e.target.closest('button')) return;
      var t = e.target.closest('.thumb');
      if (!t) return;
      touchDrag = { kind: 'page', from: parseInt(t.dataset.idx, 10), target: -1 };
      t.classList.add('is-dragging');
    });
    $('#mergeFiles').addEventListener('pointerdown', function (e) {
      if (e.pointerType === 'mouse' || e.button > 0) return;
      if (e.target.closest('button')) return;
      var it = e.target.closest('[data-mfi]');
      if (!it) return;
      touchDrag = { kind: 'merge', from: parseInt(it.dataset.mfi, 10), target: -1 };
      it.classList.add('is-dragging');
    });
    document.addEventListener('pointermove', function (e) {
      if (!touchDrag) return;
      var el = document.elementFromPoint(e.clientX, e.clientY);
      if (!el || !el.closest) return;
      var node = touchDrag.kind === 'page' ? el.closest('#thumbList .thumb') : el.closest('#mergeFiles [data-mfi]');
      if (!node) return;
      e.preventDefault();
      var r = node.getBoundingClientRect();
      var after = (e.clientY - r.top) > r.height / 2;
      $$(touchDrag.kind === 'page' ? '.thumb' : '#mergeFiles .file-item').forEach(function (x) {
        x.classList.remove('drop-before', 'drop-after');
      });
      node.classList.add(after ? 'drop-after' : 'drop-before');
      touchDrag.target = parseInt(touchDrag.kind === 'page' ? node.dataset.idx : node.dataset.mfi, 10) + (after ? 1 : 0);
    }, { passive: false });
    function endTouchDrag() {
      if (!touchDrag) return;
      var drag = touchDrag;
      touchDrag = null;
      clearDropMarks();
      if (drag.target < 0 || drag.target === drag.from || drag.target === drag.from + 1) return;
      if (drag.kind === 'page') {
        if (blockWhileLoading()) return;
        var landed = drag.from < drag.target ? drag.target - 1 : drag.target;
        S.pages = ZJPages.move(S.pages, drag.from, drag.target);
        S.sel = [landed]; S.current = landed;
        pushHistory(); buildThumbs(); renderMain(); updateSel(); updateNav();
        showToast('已移动页面到第 ' + (landed + 1) + ' 位', 'ok');
      } else {
        var insertAt = drag.from < drag.target ? drag.target - 1 : drag.target;
        var item = S.mergeFiles.splice(drag.from, 1)[0];
        S.mergeFiles.splice(insertAt, 0, item);
        markDirty(true);
        renderMergeList(); renderMergePreview();
        showToast('已调整合并顺序', 'ok');
      }
    }
    document.addEventListener('pointerup', endTouchDrag);
    document.addEventListener('pointercancel', endTouchDrag);

    /* 键盘 */
    document.addEventListener('keydown', function (e) {
      var tag = (e.target.tagName || '').toLowerCase();
      var typing = tag === 'input' || tag === 'textarea' || tag === 'select';
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'o') { e.preventDefault(); pickFiles(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (S.doc) $('#btnSaveCopy').click();
        return;
      }
      if (typing) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if (e.key === 'Escape' && S.loading) {
        loadCancelled = true;
        showToast('正在取消读取…', 'info');
        return;
      }
      if (e.key === 'Escape') { closeDevPop(); }
      if (S.view !== 'workspace') return;
      if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && S.tool === 'organize' && S.doc) {
        e.preventDefault();
        pageAct(e.key === 'ArrowUp' ? 'up' : 'down');
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goPage(S.current + 1); }
      if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goPage(S.current - 1); }
      if (e.key === '+' || e.key === '=') { setZoom(S.zoom + 0.1); }
      if (e.key === '-') { setZoom(S.zoom - 0.1); }
    });

    /* 面板内交互 */
    $('#toolSelect').addEventListener('change', function (e) { openTool(e.target.value); });
    $('#btnPanelClose').addEventListener('click', function () { $('#panelCol').classList.remove('is-open'); });

    $$('[data-pageact]').forEach(function (b) {
      b.addEventListener('click', function () { pageAct(b.dataset.pageact); });
    });
    $$('[data-run]').forEach(function (b) {
      b.addEventListener('click', function () {
        var tool = b.dataset.run;
        if (tool === 'reset') { restore(S.hist.initial()); updateUndoRedo(); showToast('已还原到打开时的状态', 'info'); return; }
        startRun(tool);
      });
    });

    /* 分段控件通用 */
    function segGroup(id, cb) {
      var g = $('#' + id);
      if (!g) return;
      g.addEventListener('click', function (e) {
        var b = e.target.closest('button');
        if (!b) return;
        $$('button', g).forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
        b.setAttribute('aria-pressed', 'true');
        if (cb) cb(b);
      });
    }
    segGroup('splitMode', function (b) {
      $('#splitRangeGroup').hidden = b.dataset.mode !== 'range';
      $('#splitEveryGroup').hidden = b.dataset.mode !== 'every';
      updateSplitPreview();
    });
    segGroup('convDir', function (b) {
      var dir = b.dataset.dir;
      $('#convFormatGroup').hidden = dir !== 'pdf2img';
      $('#convParamGroup').hidden = dir === 'img2pdf';
      if ($('#convDpiField')) $('#convDpiField').hidden = dir === 'pdf2txt';
      if ($('#convScopeField')) $('#convScopeField').hidden = dir === 'img2pdf';
      if ($('#convImgGroup')) $('#convImgGroup').hidden = dir !== 'img2pdf';
      if ($('#convOrientGroup')) $('#convOrientGroup').hidden = dir !== 'img2pdf';
      var run = $('#btnConvertRun');
      if (run) run.textContent = dir === 'img2pdf' ? '生成 PDF 并另存' : dir === 'pdf2txt' ? '导出文本并另存' : '转换并另存';
      renderConvImages();
      updatePanelStateForTool();
    });
    segGroup('editType', function (b) {
      $('#editTextGroup').hidden = b.dataset.type === 'image' || b.dataset.type === 'num';
    });
    segGroup('annoTab', function (b) {
      $('#annoGroup').hidden = b.dataset.tab !== 'anno';
      $('#signGroup').hidden = b.dataset.tab !== 'sign';
    });
    segGroup('annoTool'); segGroup('annoTool2'); segGroup('signSrc'); segGroup('redMode'); segGroup('cmpMode'); segGroup('editPos');
    segGroup('protTab', function (b) {
      $('#protPwd').hidden = b.dataset.tab !== 'pwd';
      $('#protMeta').hidden = b.dataset.tab !== 'meta';
      $('#protBm').hidden = b.dataset.tab !== 'bm';
    });
    segGroup('redTab', function (b) {
      $('#redactGroup').hidden = b.dataset.tab !== 'redact';
      $('#cleanGroup').hidden = b.dataset.tab !== 'clean';
      var run = $('#btnRedactRun');
      if (b.dataset.tab === 'clean') { run.disabled = false; run.textContent = '清理并另存'; }
      else { run.textContent = '确认脱敏并另存'; renderRedList(); }
    });

    $('#pageRange').addEventListener('input', updateSplitPreview);
    $('#everyN').addEventListener('input', updateSplitPreview);
    $('#splitPrefix').addEventListener('input', updateSplitPreview);
    $('#btnSwapCmp').addEventListener('click', function () { showToast('已交换 A / B（演示）', 'info'); });

    /* 批注颜色 */
    $$('.swatch').forEach(function (sw, i) {
      if (i === 0) sw.classList.add('is-active');
      sw.addEventListener('click', function () {
        $$('.swatch').forEach(function (x) { x.classList.remove('is-active'); });
        sw.classList.add('is-active');
      });
    });

    /* 滑块 */
    function rangeBind(id, out, suffix, fmt) {
      var el = $('#' + id), o = $('#' + out);
      if (!el) return;
      el.addEventListener('input', function () {
        o.textContent = fmt ? fmt(el.value) : (el.value + suffix);
      });
    }
    rangeBind('editSize', 'editSizeVal', ' pt');
    rangeBind('editOpacity', 'editOpacityVal', '%');

    /* 密码强度 */
    $('#newPwd').addEventListener('input', function () {
      var v = this.value;
      var score = 0;
      if (v.length >= 6) score++;
      if (v.length >= 10) score++;
      if (/[A-Z]/.test(v) && /[a-z]/.test(v)) score++;
      if (/\d/.test(v)) score++;
      if (/[^A-Za-z0-9]/.test(v)) score++;
      var label = score <= 1 ? '偏弱' : score <= 3 ? '中等' : '较强';
      var bar = $('#pwdStrength').parentElement.querySelector('.size-bar span');
      $('#pwdStrength').textContent = v ? label : '未输入';
      if (bar) bar.style.width = (v ? Math.min(100, score * 22) : 26) + '%';
    });

    /* 脱敏 */
    $('#btnMarkDemo').addEventListener('click', function () {
      if (!S.doc) { showToast('先打开一个 PDF', 'warn'); return; }
      [addObject({ label: '身份证号 ····12', kind: 'redact', x: 14, y: 30, w: 30, h: 3.4 }),
       addObject({ label: '电话 138****', kind: 'redact', x: 14, y: 36, w: 24, h: 3.4 })
      ].forEach(function (o) { S.redMarks.push(o.id); });
      selectObject(null);
      renderRedList();
      showToast('已在当前页标记 2 处（演示位置）', 'info');
    });
    $('#redConfirm').addEventListener('change', function () {
      $('#btnRedactRun').disabled = !this.checked || !S.redMarks.length;
    });

    /* 转换：页面范围与图片列表 */
    var convScope = $('#convScope');
    if (convScope) {
      convScope.addEventListener('change', function () {
        var custom = convScope.value === 'custom';
        if ($('#convRangeField')) $('#convRangeField').hidden = !custom;
        if (custom && $('#convRange')) $('#convRange').focus();
        updatePanelStateForTool();
      });
    }
    var imgInput = $('#imgInput');
    if ($('#btnPickImages')) {
      $('#btnPickImages').addEventListener('click', function () {
        if (!imgInput) return;
        imgInput.value = '';
        imgInput.click();
      });
    }
    if (imgInput) {
      imgInput.addEventListener('change', function (e) {
        onFilesPicked(e.target.files);
      });
    }
    if ($('#btnClearImages')) {
      $('#btnClearImages').addEventListener('click', function () {
        S.convImages = [];
        renderConvImages();
        updatePanelStateForTool();
        showToast('已清空图片列表', 'info');
      });
    }
    var convImgList = $('#convImgList');
    if (convImgList) {
      convImgList.addEventListener('click', function (e) {
        var b = e.target.closest('[data-imgdel]');
        if (!b) return;
        S.convImages.splice(parseInt(b.dataset.imgdel, 10), 1);
        renderConvImages();
        updatePanelStateForTool();
      });
    }

    /* 添加对象 */
    $('#btnAddObj').addEventListener('click', function () {
      var type = ($('#editType [aria-pressed="true"]') || {}).dataset;
      var t = type ? type.type : 'text';
      var labels = { text: '文本', image: '图片', num: '页码', wm: '水印', stamp: '印章' };
      var pos = ($('#editPos [aria-pressed="true"]') || {}).dataset;
      var p = pos ? pos.pos : 'c';
      var coords = {
        tl: [12, 10, 30, 6], c: [24, 46, 46, 7], bl: [12, 82, 30, 6], br: [52, 82, 30, 6]
      }[p] || [24, 46, 46, 7];
      addObject({ label: labels[t] + (t === 'text' ? ' · ' + ($('#editSize').value) + 'pt' : ''), kind: 'text', x: coords[0], y: coords[1], w: coords[2], h: coords[3] });
      showToast('已添加' + labels[t] + '，可拖动调整位置', 'ok');
      setPanelState('edit', 'idle');
    });

    /* 画布工具条 */
    $('#canvasToolbar').addEventListener('click', function (e) {
      var b = e.target.closest('[data-objact]');
      if (!b || selectedObj == null) return;
      var act = b.dataset.objact;
      if (act === 'del') { removeObject(selectedObj); showToast('已删除对象', 'info'); return; }
      if (act === 'dup') {
        var o = S.objects.filter(function (x) { return String(x.id) === String(selectedObj); })[0];
        if (o) { S.objects.push({ id: ++S.objSeq, label: o.label, x: Math.min(90, o.x + 4), y: Math.min(90, o.y + 4), w: o.w, h: o.h, kind: o.kind }); paintObjects(); selectObject(S.objSeq); }
        return;
      }
      if (act === 'front') { selectObject(selectedObj); showToast('已置顶（演示）', 'info'); return; }
      if (act === 'done') { selectObject(null); }
    });

    /* 面板切换隐藏态（窄屏抽屉） */
    $('#stage').addEventListener('click', function () {
      if (window.innerWidth <= 1080) $('#panelCol').classList.add('is-open');
    });

    /* 参数输入后重新计算拆分预览 */
    ['#pageRange', '#splitPrefix'].forEach(function (s) {
      var el = $(s); if (el) el.addEventListener('focus', updateSplitPreview);
    });

    /* 合并文件列表 */
    $('#btnMergeAdd').addEventListener('click', pickFiles);
    $('#mergeSep').addEventListener('change', function () {
      renderMergePreview();
      showToast(this.checked ? '将在每个文件之间插入空白分隔页' : '已取消分隔页', 'info');
    });
    $('#mergeFiles').addEventListener('click', function (e) {
      var del = e.target.closest('[data-mfdel]');
      var up = e.target.closest('[data-mfup]');
      var down = e.target.closest('[data-mfdown]');
      if (del) {
        S.mergeFiles.splice(parseInt(del.dataset.mfdel, 10), 1);
        markDirty(true);
        renderMergeList(); renderMergePreview();
      }
      if (up) {
        var i = parseInt(up.dataset.mfup, 10);
        if (i > 0) {
          var tmp = S.mergeFiles[i - 1];
          S.mergeFiles[i - 1] = S.mergeFiles[i];
          S.mergeFiles[i] = tmp;
          markDirty(true);
          renderMergeList(); renderMergePreview();
        }
      }
      if (down) {
        var d = parseInt(down.dataset.mfdown, 10);
        if (d > -1 && d < S.mergeFiles.length - 1) {
          var tmp2 = S.mergeFiles[d + 1];
          S.mergeFiles[d + 1] = S.mergeFiles[d];
          S.mergeFiles[d] = tmp2;
          markDirty(true);
          renderMergeList(); renderMergePreview();
        }
      }
    });
    var mDrag = null;
    $('#mergeFiles').addEventListener('dragstart', function (e) {
      var it = e.target.closest('[data-mfi]');
      if (!it) return;
      mDrag = parseInt(it.dataset.mfi, 10);
      it.classList.add('is-dragging');
    });
    $('#mergeFiles').addEventListener('dragend', function () {
      $$('#mergeFiles .file-item').forEach(function (x) { x.classList.remove('is-dragging', 'drop-before', 'drop-after'); });
    });
    $('#mergeFiles').addEventListener('dragover', function (e) {
      var it = e.target.closest('[data-mfi]');
      if (!it || mDrag === null) return;
      e.preventDefault();
      var r = it.getBoundingClientRect();
      $$('#mergeFiles .file-item').forEach(function (x) { x.classList.remove('drop-before', 'drop-after'); });
      it.classList.add((e.clientY - r.top) > r.height / 2 ? 'drop-after' : 'drop-before');
    });
    $('#mergeFiles').addEventListener('drop', function (e) {
      var it = e.target.closest('[data-mfi]');
      if (!it || mDrag === null) return;
      e.preventDefault();
      var to = parseInt(it.dataset.mfi, 10);
      var r = it.getBoundingClientRect();
      var after = (e.clientY - r.top) > r.height / 2;
      var insertAt = to + (after ? 1 : 0);
      if (mDrag < insertAt) insertAt--;
      var item = S.mergeFiles.splice(mDrag, 1)[0];
      S.mergeFiles.splice(insertAt, 0, item);
      mDrag = null;
      markDirty(true);
      renderMergeList(); renderMergePreview();
    });

    /* 设置 */
    $('#setRecent').addEventListener('change', function () {
      S.recentOn = this.checked;
      saveRecentOn();
      if (!S.recentOn) {
        S.recent = [];
        saveRecentStore();
        renderRecent();
      }
      showToast(this.checked ? '已开启最近文件记录（只保存在本机）' : '已停止记录最近文件', 'info');
    });

    /* 演示控制 */
    $('#devToggle').addEventListener('click', function (e) { e.stopPropagation(); toggleDevPop(this); });
    document.addEventListener('click', function (e) {
      var pop = $('#devPop');
      if (pop && !e.target.closest('#devPop') && !e.target.closest('#devToggle') && !e.target.closest('#devToggleWs')) closeDevPop();
    });

    /* 窗口尺寸变化 */
    var rzTimer = null;
    window.addEventListener('resize', function () {
      clearTimeout(rzTimer);
      rzTimer = setTimeout(function () {
        if (S.view === 'workspace' && S.doc) renderMain();
        var narrow = window.innerWidth <= 1080;
        $('#btnPanelClose').style.display = narrow ? 'grid' : 'none';
      }, 180);
    });
  }

  function setZoom(z) {
    S.zoom = Math.max(0.4, Math.min(2.5, Math.round(z * 10) / 10));
    $('#zoomVal').textContent = Math.round(S.zoom * 100) + '%';
    if (S.doc) renderMain();
  }

  function openRecent(i) {
    var r = S.recent[i];
    if (!r) return;
    if (r.file) { openLocalPdf(r.file); return; }
    if (r.demo) { openDemo(); return; }
    if (r.path && window.zjDesktop && typeof window.zjDesktop.readFile === 'function') {
      window.zjDesktop.readFile(r.path).then(function (res) {
        if (!res || !res.ok) {
          showToast('无法读取这个文件，可能已被移动或删除', 'err');
          return;
        }
        openLocalPdf(new File([res.bytes], res.name || r.name, { type: 'application/pdf' }));
      });
      return;
    }
    openDialog({
      title: '需要重新选择这个文件',
      desc: '浏览器仅在当前运行期间保留所选文件引用。请重新选择该文件继续处理。',
      icon: 'file',
      extra: r.path,
      cancelText: '关闭',
      confirmText: '选择文件',
      onConfirm: function () { pickFiles(); },
      onCancel: function () { openDemo(); }
    });
  }

  /* ============================================================
     22. 初始化
     ============================================================ */
  function init() {
    S.recent = loadRecentStore();
    S.recentOn = loadRecentOn();
    renderHome();
    renderMergeList();
    renderMergePreview();
    renderCompare();
    renderRedList();
    bind();
    initObjectDrag();
    updateSplitPreview();
    syncSettings();

    /* 工具下拉 */
    var opts = Object.keys(TOOLS).map(function (k) {
      return '<option value="' + k + '">' + TOOLS[k].name + '</option>';
    }).join('');
    $('#toolSelect').innerHTML = opts;
    $('#toolSelect').value = S.tool;

    /* 工作区也放一个演示控制入口 */
    var wsDev = document.createElement('button');
    wsDev.className = 'icon-btn';
    wsDev.id = 'devToggleWs';
    wsDev.setAttribute('data-tip', '演示状态控制');
    wsDev.setAttribute('aria-label', '演示状态控制');
    wsDev.innerHTML = icon('gauge');
    wsDev.addEventListener('click', function (e) { e.stopPropagation(); toggleDevPop(this); });
    $('#btnSaveCopy').parentElement.insertBefore(wsDev, $('#btnSaveCopy'));

    /* 引擎状态 */
    var dot = $('#engineDot');
    var engineReady = !!(ZJRender.pdfReady && window.PDFLib && window.JSZip);
    if (dot) dot.classList.toggle('is-on', engineReady);
    var engineLabel = $('.engine-row span:last-child');
    if (engineLabel && !engineReady) engineLabel.textContent = '本机引擎组件未能加载';

    /* 窄屏面板按钮 */
    if (window.innerWidth <= 1080) $('#btnPanelClose').style.display = 'grid';

    showStage('empty');
    updateRailVisibility();
    switchView('home');

    if (!ZJRender.pdfReady) {
      showToast('渲染组件未加载，将使用演示文档', 'warn');
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
