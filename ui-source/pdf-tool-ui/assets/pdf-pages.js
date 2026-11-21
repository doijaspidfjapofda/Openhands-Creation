/* 纯逻辑模块：页面模型操作与拆分页码解析。不访问 DOM，便于自动化测试。 */
(function (global) {
  'use strict';

  function normalizeRotation(value) {
    return ((Number(value) || 0) % 360 + 360) % 360;
  }

  function clonePage(p) {
    return { id: p.id, index: p.index, rot: p.rot, blank: !!p.blank, w: p.w, h: p.h };
  }

  function snapshot(pages) {
    return (pages || []).map(clonePage);
  }

  /* 页面在屏幕上显示时的宽高（含旋转） */
  function displaySize(page) {
    if (!page) return { w: 595.28, h: 841.89 };
    var rotated = normalizeRotation(page.rot) % 180 !== 0;
    var w = Number(page.w) || 595.28;
    var h = Number(page.h) || 841.89;
    return rotated ? { w: h, h: w } : { w: w, h: h };
  }

  function uniqueSorted(indexes) {
    var seen = {};
    return (indexes || []).filter(function (i) {
      if (!Number.isInteger(i) || seen[i]) return false;
      seen[i] = true;
      return true;
    }).sort(function (a, b) { return a - b; });
  }

  function rotate(pages, indexes, delta) {
    var list = uniqueSorted(indexes);
    var next = snapshot(pages);
    list.forEach(function (i) {
      if (!next[i]) return;
      next[i].rot = normalizeRotation((next[i].rot || 0) + delta);
    });
    return next;
  }

  function duplicate(pages, indexes) {
    var list = uniqueSorted(indexes);
    if (!list.length) return { pages: snapshot(pages), sel: [], at: 0 };
    var next = snapshot(pages);
    var clones = list.map(function (i) {
      var p = clonePage(next[i]);
      p.id = 'pg' + p.index + '_' + Math.random().toString(36).slice(2, 7);
      return p;
    });
    var at = list[list.length - 1] + 1;
    next.splice.apply(next, [at, 0].concat(clones));
    return {
      pages: next,
      sel: clones.map(function (_, k) { return at + k; }),
      at: at
    };
  }

  function remove(pages, indexes) {
    var list = uniqueSorted(indexes);
    return snapshot(pages).filter(function (_, i) { return list.indexOf(i) === -1; });
  }

  /* 空白页尺寸跟随插入位置前后的页面，保持视觉一致 */
  function blankDims(pages, at) {
    var list = pages || [];
    if (!list.length) return { w: 595.28, h: 841.89 };
    var before = list[Math.max(0, Math.min(list.length - 1, at - 1))];
    var after = list[Math.min(list.length - 1, at)];
    var ref = before || after || list[0];
    return displaySize(ref);
  }

  function insertBlank(pages, at, dims) {
    var next = snapshot(pages);
    var pos = Math.max(0, Math.min(next.length, Number.isInteger(at) ? at : next.length));
    var size = dims || blankDims(next, pos);
    next.splice(pos, 0, {
      id: 'blank_' + Math.random().toString(36).slice(2, 7),
      index: 0,
      rot: 0,
      blank: true,
      w: size.w,
      h: size.h
    });
    return { pages: next, at: pos };
  }

  function move(pages, from, insertAt) {
    var next = snapshot(pages);
    if (!Number.isInteger(from) || from < 0 || from >= next.length) return next;
    var pos = Math.max(0, Math.min(next.length, insertAt));
    if (from < pos) pos--;
    var item = next.splice(from, 1)[0];
    next.splice(pos, 0, item);
    return next;
  }

  /* 解析 "1-3, 5, 8-12"；任何非法输入都抛出可读的中文错误 */
  function parseSelection(text, total) {
    var raw = String(text || '').replace(/，/g, ',');
    var segments = raw.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    if (!segments.length) throw new Error('请输入至少一个页码或页码范围。');
    if (!Number.isInteger(total) || total < 1) throw new Error('当前文档没有可拆分的页面。');

    var used = {};
    return segments.map(function (seg) {
      var match = seg.match(/^(\d+)\s*[-–~]\s*(\d+)$/);
      var from, to;
      if (match) {
        from = parseInt(match[1], 10);
        to = parseInt(match[2], 10);
        if (from > to) throw new Error('页码范围“' + seg + '”的起始页大于结束页。');
      } else if (/^\d+$/.test(seg)) {
        from = to = parseInt(seg, 10);
      } else {
        throw new Error('无法识别页码“' + seg + '”，请使用例如 1-3, 5 的格式。');
      }
      if (from < 1 || to > total) {
        throw new Error('页码“' + seg + '”超出当前文档范围（1-' + total + '）。');
      }
      for (var p = from; p <= to; p++) {
        if (used[p]) throw new Error('页码“' + seg + '”与前面的范围重叠（第 ' + p + ' 页）。');
        used[p] = true;
      }
      return { label: seg, from: from, to: to };
    });
  }

  /* 统一的拆分分组：返回 0 基页码索引，供界面预览与实际导出共用 */
  function buildSplitGroups(opts) {
    var total = Number(opts && opts.total) || 0;
    var mode = (opts && opts.mode) || 'range';
    if (!total) throw new Error('当前文档没有可拆分的页面。');

    if (mode === 'picked') {
      var sel = uniqueSorted(opts.sel || []).filter(function (i) { return i >= 0 && i < total; });
      if (!sel.length) throw new Error('请先在左侧缩略图选择要提取的页面。');
      return [{ label: '选中页面', indexes: sel }];
    }

    if (mode === 'every') {
      var size = Number(opts.everyN);
      if (!Number.isInteger(size) || size < 1) throw new Error('每份页数必须是大于 0 的整数。');
      var groups = [];
      for (var i = 0; i < total; i += size) {
        var end = Math.min(total, i + size);
        groups.push({
          label: (i + 1) + '-' + end,
          indexes: Array.from({ length: end - i }, function (_, k) { return i + k; })
        });
      }
      return groups;
    }

    return parseSelection(opts.rangeText, total).map(function (seg) {
      var indexes = [];
      for (var p = seg.from; p <= seg.to; p++) indexes.push(p - 1);
      return { label: seg.label, indexes: indexes };
    });
  }

  function createHistory(limit) {
    var max = limit || 40;
    var stack = [];
    var idx = -1;
    function push(pages) {
      stack = stack.slice(0, idx + 1);
      stack.push(snapshot(pages));
      if (stack.length > max) stack.shift();
      idx = stack.length - 1;
    }
    return {
      push: push,
      undo: function () {
        if (idx <= 0) return null;
        idx--;
        return snapshot(stack[idx]);
      },
      redo: function () {
        if (idx >= stack.length - 1) return null;
        idx++;
        return snapshot(stack[idx]);
      },
      initial: function () { return stack.length ? snapshot(stack[0]) : null; },
      current: function () { return idx >= 0 ? snapshot(stack[idx]) : null; },
      canUndo: function () { return idx > 0; },
      canRedo: function () { return idx < stack.length - 1; }
    };
  }

  global.ZJPages = {
    normalizeRotation: normalizeRotation,
    snapshot: snapshot,
    displaySize: displaySize,
    rotate: rotate,
    duplicate: duplicate,
    remove: remove,
    insertBlank: insertBlank,
    blankDims: blankDims,
    move: move,
    parseSelection: parseSelection,
    buildSplitGroups: buildSplitGroups,
    createHistory: createHistory
  };
})(window);
