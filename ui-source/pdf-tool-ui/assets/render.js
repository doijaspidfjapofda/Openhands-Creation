/* ============================================================
   纸间 PDF · 渲染层
   - 真实 PDF：pdf.js（本地 vendor，零网络请求）
   - 演示文档：程序化绘制的 12 页样张
   对外接口（供 app.js 调用）
     ZJRender.pdfReady
     ZJRender.loadPdf(file) -> {kind:'pdf', pdf, pages:[{w,h}], name, size}
     ZJRender.createDemo()  -> {kind:'demo', pages:[{w,h}], name, size}
     ZJRender.render(doc, index, canvas, cssWidth, dpr) -> {ok, w, h}
   ============================================================ */
(function (global) {
  'use strict';

  var A4 = { w: 595, h: 842 };
  var pdfReady = false;
  var workerNote = '';
  var activeTasks = new WeakMap();

  /* ---------- pdf.js 初始化 ---------- */
  if (global.pdfjsLib) {
    try {
      global.pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdf.worker.min.js';
      pdfReady = true;
    } catch (e) {
      workerNote = 'worker-init-failed';
    }
  } else {
    workerNote = 'pdfjs-missing';
  }

  /* ============================================================
     演示文档：内容模型
     ============================================================ */
  var DEMO_TITLE = '2026 年度产品设计复盘';

  var DEMO_PAGES = [
    { type: 'cover' },
    {
      blocks: [
        { t: 'h2', text: '一、设计目标' },
        { t: 'p', text: '我们把这轮改动的目标收敛成一句话：让用户在三次点击内完成最常见的五件事。为了让目标可以被验证，团队把它拆成阅读、整理、合并、压缩与批注五条主线，每条主线都记录了首次上手需要几次试错。' },
        { t: 'p', text: '拆解之后发现，真正拖慢速度的不是功能缺失，而是每一步都要重新确认「我接下来该点什么」。界面需要给出的不是更多按钮，而是更清楚的下一步。' },
        { t: 'quote', text: '快，不是因为按钮更少，而是因为下一步总是可预期。' },
        { t: 'p', text: '这条判断后来成为整个设计系统的第一条原则，也解释了为什么我们最终选择把工具入口按「要处理什么」来分组，而不是按「引擎怎么实现」来分组。' }
      ]
    },
    {
      blocks: [
        { t: 'h2', text: '二、现状问题' },
        { t: 'p', text: '旧版本把二十多个入口平铺在首页，用户平均要滚动一屏半才能找到合并。我们回看了 42 段操作录像，发现三个高频卡点。' },
        { t: 'list', items: [
          '入口太多且同质：合并、拆分、页面整理看起来都在「处理页面」，用户无法从名称判断差别。',
          '状态不可见：处理中没有进度，完成后也没有说明文件存到了哪里。',
          '破坏性操作没有护栏：删除页面与覆盖保存使用的是同一个主按钮。'
        ] },
        { t: 'p', text: '这三个问题指向同一件事：界面没有替用户承担判断成本。' },
        { t: 'figure', caption: '图 1　旧版首页的入口分布，同类工具被拆散在三处' }
      ]
    },
    {
      blocks: [
        { t: 'h2', text: '三、信息架构调整' },
        { t: 'p', text: '新版按任务阶段重组入口，把「整理 / 编辑 / 安全」作为三个稳定分区，主区域内只保留六张高频卡片。' },
        { t: 'table', head: ['分区', '包含工具', '入口数'], rows: [
          ['整理', '页面整理、合并、拆分、压缩、转换', '5'],
          ['编辑', '页面编辑、批注、签名、表单、对比', '5'],
          ['安全', '密码、文档信息、书签、脱敏、清理', '5']
        ] },
        { t: 'p', text: '分区之后，用户从首页到达任一工具的平均点击次数从 2.6 降到 1.2，首页滚动深度下降了 74%。' }
      ]
    },
    {
      blocks: [
        { t: 'h2', text: '四、关键指标变化' },
        { t: 'p', text: '下面五个指标取自灰度两周的埋点数据，样本为 1,284 次真实任务。' },
        { t: 'chart', labels: ['找到工具', '完成任务', '撤销使用', '误删率', '返回重试'], values: [92, 86, 34, 12, 18], note: '单位：百分比（越低越好的指标已反向标记）' },
        { t: 'p', text: '误删率从 12% 降到 3%，主要归功于删除页面前的二次确认与随时可用的撤销。' }
      ]
    },
    {
      blocks: [
        { t: 'h2', text: '五、界面对比' },
        { t: 'p', text: '左侧是旧版，右侧是新版。除了颜色与圆角，更重要的差别在于右栏承担了全部决策：参数、预览、执行按钮都在同一列里，视线不需要来回跳。' },
        { t: 'figure', caption: '图 2　旧版（左）与新版（右）在页面整理任务中的视线路径' },
        { t: 'p', text: '把决策收进一列之后，用户在参数面板与预览区之间的往返次数平均减少了 3.4 次。' }
      ]
    },
    {
      blocks: [
        { t: 'h2', text: '六、设计系统' },
        { t: 'p', text: '为了让十五张卡片看起来像同一套东西，我们只允许四个变量参与视觉表达：色板、字阶、间距与圆角。' },
        { t: 'list', items: [
          '色板：一个强调色承担全部「可以点」的语义，其余颜色只做分区提示。',
          '字阶：11 / 12 / 13 / 15 / 20 / 24，六档足够覆盖桌面密度。',
          '间距：4px 基准，卡片内边距固定 14px，列表行高固定 40px。',
          '圆角：卡片 16px、控件 9px、胶囊 999px，三档区分层级。'
        ] },
        { t: 'note', text: '约束的价值不在于统一好看，而在于让新页面不必重新决策。' }
      ]
    },
    {
      blocks: [
        { t: 'h2', text: '七、组件清单' },
        { t: 'p', text: '第一阶段共落地 18 个组件，其中 6 个是本次新增。' },
        { t: 'table', head: ['组件', '状态数'], rows: [
          ['主按钮', '4'],
          ['文件行', '5'],
          ['缩略图', '6'],
          ['状态块', '4'],
          ['进度条', '3'],
          ['确认对话框', '3']
        ] },
        { t: 'p', text: '状态数最多的是缩略图：默认、悬停、选中、多选、拖动中、拖放目标，六种状态都要在 96px 宽内表达清楚。' }
      ]
    },
    {
      blocks: [
        { t: 'h2', text: '八、可用性测试' },
        { t: 'p', text: '我们在两周内做了 8 场远程测试，任务包括「把三份周报合成一份」与「删掉第 4 页再另存」。' },
        { t: 'p', text: '所有参与者都在第一次尝试中完成了合并，但其中 3 人在保存环节停顿，因为他们不确定结果会覆盖原文件。' },
        { t: 'note', text: '结论：默认「另存为新文件」必须在按钮上写出来，而不是只写在说明里。' }
      ]
    },
    {
      blocks: [
        { t: 'h2', text: '九、遗留问题' },
        { t: 'p', text: '还有三件事没有在这轮解决：拖拽排序在超过 40 页后会明显卡顿；批注的自由绘制在触控板上不够跟手；右栏在 1080px 以下变成抽屉后，用户不容易发现它被收起了。' },
        { t: 'list', items: [
          '缩略图渲染需要分帧队列，优先渲染可视区域。',
          '自由绘制改为采样平滑，减少抖动。',
          '抽屉折叠时在画布右下角保留一个「设置」浮标。'
        ] },
        { t: 'table', head: ['问题', '影响', '计划'], rows: [
          ['大文档缩略图', '中', '下一迭代'],
          ['手绘跟手度', '低', '待评估'],
          ['面板折叠可见性', '中', '下一迭代']
        ] },
        { t: 'p', text: '这三条都已记录进体验债清单，不会因为界面看起来“完成了”而被忽略。' }
      ]
    },
    { type: 'divider', num: '→', label: '下一步' },
    {
      blocks: [
        { t: 'h2', text: '十、结论' },
        { t: 'p', text: '这轮改动的收益主要来自确定性：入口位置稳定、状态始终可见、破坏性操作有护栏。视觉上的年轻化只是让人愿意留下来，真正让人用得下去的是这些不起眼的约定。' },
        { t: 'p', text: '下一阶段会把这些约定固化成本地引擎的接口契约，保证界面上承诺的每一条，在处理层都有对应的实现与错误说明。' },
        { t: 'cta', text: '感谢阅读 · 本页为演示内容' }
      ]
    }
  ];

  /* ---------- 绘图工具 ---------- */
  var C = {
    ink: '#241E1B', ink2: '#4E4540', ink3: '#7C6E65',
    line: '#E6DCD2', soft: '#F6F0EA', brand: '#D9482C', brandSoft: '#FBE9E4'
  };
  var FONT = '"PingFang SC","Microsoft YaHei UI","Microsoft YaHei",sans-serif';

  function font(size, weight) {
    return (weight || 400) + ' ' + size + 'px ' + FONT;
  }

  function wrap(ctx, text, maxW) {
    var lines = [], cur = '';
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (ctx.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; }
      else { cur += ch; }
    }
    if (cur) lines.push(cur);
    return lines;
  }

  function hairline(ctx, x1, y, x2) {
    ctx.save(); ctx.strokeStyle = C.line; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke(); ctx.restore();
  }

  /* ---------- 单页绘制 ---------- */
  function drawDemoPage(ctx, pageNo, total) {
    var W = A4.w, H = A4.h, M = 58;
    ctx.save();
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, W, H);

    var spec = DEMO_PAGES[pageNo - 1] || DEMO_PAGES[1];

    if (spec.type === 'cover') {
      drawCover(ctx, W, H, M);
    } else if (spec.type === 'divider') {
      drawDivider(ctx, W, H, M, spec);
    } else {
      /* 页眉 */
      ctx.fillStyle = C.ink3; ctx.font = font(7.6, 500);
      ctx.textBaseline = 'alphabetic';
      ctx.fillText('纸间 · 演示文档', M, 46);
      ctx.textAlign = 'right';
      ctx.fillText(DEMO_TITLE, W - M, 46);
      ctx.textAlign = 'left';
      hairline(ctx, M, 56, W - M);

      var y = 92;
      var blocks = spec.blocks || [];
      for (var i = 0; i < blocks.length; i++) {
        y = drawBlock(ctx, blocks[i], y, W, M);
        if (y > H - 90) break;
      }
    }

    /* 页脚 */
    hairline(ctx, M, H - 52, W - M);
    ctx.fillStyle = C.ink3; ctx.font = font(7.6, 500);
    ctx.fillText('仅本机处理 · 不上传', M, H - 36);
    ctx.textAlign = 'right';
    ctx.fillText(pageNo + ' / ' + total, W - M, H - 36);
    ctx.textAlign = 'left';

    /* 红点 */
    ctx.fillStyle = C.brand;
    ctx.beginPath(); ctx.arc(W - M - 46, H - 38.2, 1.9, 0, Math.PI * 2); ctx.fill();

    ctx.restore();
  }

  function drawCover(ctx, W, H, M) {
    /* 装饰弧 */
    ctx.save();
    ctx.strokeStyle = '#F7E2DA'; ctx.lineWidth = 22;
    ctx.beginPath(); ctx.arc(W - 40, 90, 150, Math.PI * 0.62, Math.PI * 1.45); ctx.stroke();
    ctx.restore();

    ctx.fillStyle = C.brand;
    ctx.fillRect(M, 128, 34, 5);

    ctx.fillStyle = C.ink3; ctx.font = font(8, 600);
    ctx.fillText('内部资料 · 请勿外传', M, 108);

    ctx.fillStyle = C.ink; ctx.font = font(41, 700);
    ctx.fillText('2026 年度', M, 228);
    ctx.fillText('产品设计复盘', M, 282);

    ctx.fillStyle = C.ink2; ctx.font = font(13, 400);
    ctx.fillText('从可用到顺手：一次关于「减少操作」的重构', M, 322);

    ctx.strokeStyle = C.line; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(M, 362); ctx.lineTo(M + 66, 362); ctx.stroke();

    ctx.fillStyle = C.ink3; ctx.font = font(8.6, 500);
    ctx.fillText('设计中心　/　体验改进小组', M, 384);
    ctx.fillText('2026.11　·　第 3 版', M, 400);

    /* 卡片预览块 */
    ctx.save();
    ctx.fillStyle = C.soft;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(M, 448, W - M * 2, 210, 12);
    else ctx.rect(M, 448, W - M * 2, 210);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    var cw = (W - M * 2 - 44) / 3;
    for (var k = 0; k < 3; k++) {
      var cx = M + 16 + k * (cw + 14);
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(cx, 470, cw, 168, 8);
      else ctx.rect(cx, 470, cw, 168);
      ctx.fill();
      ctx.fillStyle = k === 0 ? C.brand : '#EDE2D8';
      ctx.fillRect(cx + 14, 490, k === 0 ? 34 : 26, 3.5);
      ctx.fillStyle = '#F0E7DF';
      var ly = 512;
      for (var l = 0; l < 7; l++) {
        ctx.fillRect(cx + 14, ly + l * 12, cw - 28 - (l % 3) * 10, 3);
      }
      ctx.fillStyle = '#FFFFFF';
    }
    ctx.restore();

    ctx.fillStyle = C.ink; ctx.font = font(10, 600);
    ctx.fillText('纸间 · 本机 PDF 工作台', M, H - 116);
    ctx.fillStyle = C.ink3; ctx.font = font(8, 400);
    ctx.fillText('本文件为界面原型的演示样张，由程序绘制，不包含任何真实业务数据。', M, H - 100);
  }

  function drawDivider(ctx, W, H, M, spec) {
    ctx.save();
    ctx.fillStyle = C.brandSoft;
    ctx.fillRect(0, 0, W, 8);
    ctx.fillStyle = C.brand; ctx.font = font(120, 700);
    ctx.globalAlpha = 0.14;
    ctx.fillText(spec.num, M - 6, H * 0.52);
    ctx.globalAlpha = 1;
    ctx.fillStyle = C.ink; ctx.font = font(26, 700);
    ctx.fillText(spec.label, M + 4, H * 0.62);
    ctx.fillStyle = C.ink3; ctx.font = font(9, 400);
    ctx.fillText(/^\d+$/.test(spec.num) ? 'SECTION ' + spec.num : 'SECTION', M + 6, H * 0.62 + 24);
    ctx.restore();
  }

  function drawBlock(ctx, b, y, W, M) {
    var maxW = W - M * 2;
    if (b.t === 'h2') {
      ctx.fillStyle = C.brand;
      ctx.fillRect(M, y - 2, 3, 17);
      ctx.fillStyle = C.ink; ctx.font = font(17, 700);
      ctx.fillText(b.text, M + 12, y + 12);
      return y + 44;
    }
    if (b.t === 'p') {
      ctx.fillStyle = C.ink2; ctx.font = font(9.6, 400);
      var lines = wrap(ctx, b.text, maxW);
      for (var i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], M, y + 10 + i * 17);
      }
      return y + 10 + lines.length * 17 + 12;
    }
    if (b.t === 'quote') {
      ctx.save();
      ctx.fillStyle = C.brandSoft;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(M, y, maxW, 52, 6); else ctx.rect(M, y, maxW, 52);
      ctx.fill();
      ctx.fillStyle = C.brand;
      ctx.fillRect(M, y + 10, 2.6, 32);
      ctx.fillStyle = C.ink; ctx.font = font(10.5, 600);
      ctx.fillText(b.text, M + 18, y + 32);
      ctx.restore();
      return y + 68;
    }
    if (b.t === 'list') {
      var yy = y + 4;
      ctx.font = font(9.4, 400);
      for (var k = 0; k < b.items.length; k++) {
        ctx.fillStyle = C.brand;
        ctx.beginPath(); ctx.arc(M + 3, yy + 6, 1.7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = C.ink2;
        var ls = wrap(ctx, b.items[k], maxW - 18);
        for (var j = 0; j < ls.length; j++) ctx.fillText(ls[j], M + 14, yy + 9 + j * 15.5);
        yy += ls.length * 15.5 + 9;
      }
      return yy + 6;
    }
    if (b.t === 'table') {
      var rowH = 26, headH = 26;
      ctx.save();
      ctx.fillStyle = C.soft;
      ctx.fillRect(M, y, maxW, headH);
      ctx.fillStyle = C.ink; ctx.font = font(8.8, 700);
      var colW = [maxW * 0.22, maxW * 0.62, maxW * 0.16];
      var cx2 = M + 10;
      for (var c = 0; c < b.head.length; c++) {
        ctx.fillText(b.head[c], cx2, y + 17);
        cx2 += colW[c];
      }
      var ry = y + headH;
      ctx.font = font(8.8, 400);
      for (var r = 0; r < b.rows.length; r++) {
        hairline(ctx, M, ry, M + maxW);
        var cx3 = M + 10;
        for (var c2 = 0; c2 < b.rows[r].length; c2++) {
          ctx.fillStyle = c2 === 0 ? C.ink : C.ink2;
          ctx.fillText(b.rows[r][c2], cx3, ry + 17);
          cx3 += colW[c2];
        }
        ry += rowH;
      }
      ctx.strokeStyle = C.line; ctx.lineWidth = 0.8;
      ctx.strokeRect(M + 0.4, y + 0.4, maxW - 0.8, ry - y);
      ctx.restore();
      return ry + 18;
    }
    if (b.t === 'chart') {
      var cH = 150, baseY = y + cH, bw = maxW / b.values.length;
      ctx.save();
      for (var gi = 0; gi < 4; gi++) {
        var gy = baseY - (gi * cH / 3.4);
        hairline(ctx, M, gy, M + maxW);
      }
      for (var bi = 0; bi < b.values.length; bi++) {
        var v = b.values[bi];
        var bh = (v / 100) * cH * 0.82;
        var bx = M + bi * bw + bw * 0.24;
        var bwd = bw * 0.5;
        ctx.fillStyle = bi === 0 ? C.brand : '#EFD9D1';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(bx, baseY - bh, bwd, bh, 3); else ctx.rect(bx, baseY - bh, bwd, bh);
        ctx.fill();
        ctx.fillStyle = C.ink; ctx.font = font(8, 700); ctx.textAlign = 'center';
        ctx.fillText(v + '%', bx + bwd / 2, baseY - bh - 6);
        ctx.fillStyle = C.ink3; ctx.font = font(7.6, 400);
        ctx.fillText(b.labels[bi], bx + bwd / 2, baseY + 14);
        ctx.textAlign = 'left';
      }
      ctx.fillStyle = C.ink3; ctx.font = font(7.4, 400);
      ctx.fillText(b.note, M, baseY + 34);
      ctx.restore();
      return baseY + 50;
    }
    if (b.t === 'figure') {
      var fH = 132;
      ctx.save();
      ctx.fillStyle = C.soft;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(M, y, maxW, fH, 8); else ctx.rect(M, y, maxW, fH);
      ctx.fill();

      /* 用三个浅色小块模拟界面截图，比交叉线更接近真实文档插图 */
      var pad = 14;
      var innerY = y + 18, innerH = fH - 36;
      var cw = [maxW * 0.2, maxW * 0.44, maxW * 0.26];
      var cx = M + pad;
      for (var c = 0; c < 3; c++) {
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(cx, innerY, cw[c], innerH, 5);
        else ctx.rect(cx, innerY, cw[c], innerH);
        ctx.fill();
        ctx.strokeStyle = '#EADDD2'; ctx.lineWidth = 0.6; ctx.stroke();
        ctx.fillStyle = c === 1 ? '#F3D8CF' : '#EDE2D8';
        ctx.fillRect(cx + 7, innerY + 7, c === 1 ? cw[c] - 14 : 16, 3);
        ctx.fillStyle = '#F1E8E0';
        var rows2 = c === 1 ? 6 : 5;
        for (var r2 = 0; r2 < rows2; r2++) {
          ctx.fillRect(cx + 7, innerY + 16 + r2 * 8, cw[c] - 14 - (r2 % 3) * 6, 2.6);
        }
        if (c === 1) {
          ctx.fillStyle = C.brand;
          ctx.fillRect(cx + 7, innerY + innerH - 14, 22, 5);
        }
        cx += cw[c] + 8;
      }
      ctx.fillStyle = C.ink3; ctx.font = font(7.6, 400);
      ctx.fillText(b.caption, M, y + fH + 14);
      ctx.restore();
      return y + fH + 28;
    }
    if (b.t === 'note') {
      ctx.save();
      ctx.fillStyle = '#FFF7E6';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(M, y, maxW, 44, 5); else ctx.rect(M, y, maxW, 44);
      ctx.fill();
      ctx.strokeStyle = '#F0DFC2'; ctx.lineWidth = 0.9;
      ctx.beginPath(); ctx.moveTo(M, y); ctx.lineTo(M + maxW, y); ctx.stroke();
      ctx.fillStyle = '#8C6A3F'; ctx.font = font(9.2, 600);
      var nl = wrap(ctx, b.text, maxW - 28);
      for (var n = 0; n < nl.length; n++) ctx.fillText(nl[n], M + 14, y + 18 + n * 14);
      ctx.restore();
      return y + 58;
    }
    if (b.t === 'cta') {
      ctx.save();
      ctx.fillStyle = C.brand;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(M, y, maxW, 38, 6); else ctx.rect(M, y, maxW, 38);
      ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = font(9.4, 700); ctx.textAlign = 'center';
      ctx.fillText(b.text, M + maxW / 2, y + 24);
      ctx.textAlign = 'left';
      ctx.restore();
      return y + 50;
    }
    return y + 10;
  }

  /* ============================================================
     对外接口
     ============================================================ */
  function makeDemo() {
    var pages = [];
    for (var i = 0; i < DEMO_PAGES.length; i++) pages.push({ w: A4.w, h: A4.h });
    return {
      kind: 'demo',
      name: '产品设计复盘_2026.pdf',
      path: 'C:\\Users\\lungm\\Desktop\\产品设计复盘_2026.pdf',
      size: 3984000,
      pages: pages
    };
  }

  function loadPdf(file, opts) {
    opts = opts || {};
    var report = function (done, total) {
      if (typeof opts.onProgress === 'function') {
        try { opts.onProgress(done, total); } catch (e) {}
      }
    };
    var aborted = function () {
      return typeof opts.shouldAbort === 'function' && opts.shouldAbort();
    };
    return new Promise(function (resolve, reject) {
      if (!pdfReady || !global.pdfjsLib) {
        reject({ code: 'nopdfjs', message: '本机 pdf.js 未加载' });
        return;
      }
      var reader = new FileReader();
      reader.onerror = function () { reject({ code: 'read-failed', message: '无法读取该文件' }); };
      reader.onload = function () {
        var data = new Uint8Array(reader.result);
        var task = global.pdfjsLib.getDocument({ data: data, isEvalSupported: false });
        task.promise.then(function (pdf) {
          var meta = {};
          pdf.getMetadata().then(function (m) { meta = (m && m.info) || {}; }).catch(function () {});
          var sizes = [];
          var seq = Promise.resolve();
          report(0, pdf.numPages);
          for (var i = 1; i <= pdf.numPages; i++) {
            (function (n) {
              seq = seq.then(function () {
                if (aborted()) throw { code: 'cancelled', message: '已取消读取' };
                return pdf.getPage(n).then(function (page) {
                  var vp = page.getViewport({ scale: 1 });
                  sizes[n - 1] = { w: vp.width, h: vp.height };
                }).catch(function () {
                  sizes[n - 1] = { w: A4.w, h: A4.h };
                }).then(function () {
                  report(n, pdf.numPages);
                });
              });
            })(i);
          }
          seq.then(function () {
            if (aborted()) throw { code: 'cancelled', message: '已取消读取' };
            resolve({
              kind: 'pdf',
              pdf: pdf,
              name: file.name,
              file: file,
              path: file.name,
              size: file.size || 0,
              pages: sizes,
              encrypted: false
            });
          });
        }).catch(function (err) {
          if (err && err.code === 'cancelled') { reject(err); return; }
          var name = (err && err.name) || '';
          if (name === 'PasswordException') {
            reject({ code: err.code === 2 ? 'bad-password' : 'need-password', message: '该文件已加密，需要打开密码' });
          } else if (name === 'InvalidPDFException') {
            reject({ code: 'invalid', message: '这不是有效的 PDF 文件，或文件已损坏' });
          } else if (name === 'MissingPDFException') {
            reject({ code: 'missing', message: '找不到该文件' });
          } else {
            reject({ code: 'worker', message: (err && err.message) || '渲染组件未能启动' });
          }
        });
      };
      reader.readAsArrayBuffer(file);
    });
  }

  /* 把某一页画到 canvas 上。cssWidth 为期望的 CSS 宽度 */
  function render(doc, pageIndex, canvas, cssWidth, dpr) {
    dpr = dpr || global.devicePixelRatio || 1;
    if (!doc) return Promise.reject({ code: 'no-doc' });

    if (doc.kind === 'demo') {
      var spec = doc.pages[pageIndex] || A4;
      var scale = (cssWidth * dpr) / A4.w;
      canvas.width = Math.round(A4.w * scale);
      canvas.height = Math.round(A4.h * scale);
      canvas.style.width = cssWidth + 'px';
      canvas.style.height = Math.round(cssWidth * A4.h / A4.w) + 'px';
      var ctx = canvas.getContext('2d');
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      drawDemoPage(ctx, pageIndex + 1, doc.pages.length);
      return Promise.resolve({ ok: true, w: cssWidth, h: Math.round(cssWidth * A4.h / A4.w) });
    }

    if (doc.kind === 'pdf' && doc.pdf) {
      return doc.pdf.getPage(pageIndex + 1).then(function (page) {
        var base = page.getViewport({ scale: 1 });
        var scale = (cssWidth * dpr) / base.width;
        var vp = page.getViewport({ scale: scale });
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        canvas.style.width = cssWidth + 'px';
        canvas.style.height = Math.floor(cssWidth * base.height / base.width) + 'px';

        /* 同一块 canvas 上不允许并发渲染：先取消上一次任务 */
        var prev = activeTasks.get(canvas);
        if (prev) { try { prev.cancel(); } catch (e) {} }

        var task;
        try {
          task = page.render({ canvasContext: canvas.getContext('2d'), viewport: vp });
        } catch (e) {
          return { ok: false, cancelled: true };
        }
        activeTasks.set(canvas, task);

        return task.promise.then(function () {
          if (activeTasks.get(canvas) === task) activeTasks.delete(canvas);
          return { ok: true, w: cssWidth, h: Math.floor(cssWidth * base.height / base.width) };
        }).catch(function (err) {
          if (activeTasks.get(canvas) === task) activeTasks.delete(canvas);
          if (err && (err.name === 'RenderingCancelledException' || /cancel/i.test(err.message || ''))) {
            return { ok: false, cancelled: true };
          }
          return Promise.reject({ code: 'render', message: (err && err.message) || '页面渲染失败' });
        });
      }).catch(function (err) {
        if (err && err.code === 'render') return Promise.reject(err);
        return Promise.reject({ code: 'render', message: (err && err.message) || '页面渲染失败' });
      });
    }
    return Promise.reject({ code: 'unsupported' });
  }

  global.ZJRender = {
    pdfReady: pdfReady,
    workerNote: workerNote,
    makeDemo: makeDemo,
    loadPdf: loadPdf,
    render: render,
    A4: A4,
    pageCountOfDemo: DEMO_PAGES.length
  };

})(window);
