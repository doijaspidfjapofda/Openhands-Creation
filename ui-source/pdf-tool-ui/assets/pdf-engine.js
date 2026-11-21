/* 本机 PDF 写入引擎。所有处理都在当前浏览器标签页内完成，不发起网络请求。 */
(function (global) {
  'use strict';

  var PDFDocument = global.PDFLib && global.PDFLib.PDFDocument;
  var degrees = global.PDFLib && global.PDFLib.degrees;

  function ensureEngine() {
    if (!PDFDocument) throw new Error('本地 PDF 处理组件没有加载，请重新启动应用。');
  }

  function codedError(code, message) {
    var err = new Error(message);
    err.code = code;
    return err;
  }

  function abortError() {
    var err = new Error('已取消处理');
    err.name = 'AbortError';
    return err;
  }

  function readBytes(file) {
    if (file && typeof file.arrayBuffer === 'function') {
      return file.arrayBuffer().then(function (buffer) { return new Uint8Array(buffer); });
    }
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('无法读取文件：' + ((file && file.name) || 'PDF'))); };
      reader.onload = function () { resolve(new Uint8Array(reader.result)); };
      reader.readAsArrayBuffer(file);
    });
  }

  function load(file) {
    ensureEngine();
    return readBytes(file).then(function (bytes) {
      if (!bytes || !bytes.length) {
        throw codedError('empty', '文件是空的或读取失败，请重新选择这个文件。');
      }
      return PDFDocument.load(bytes, { updateMetadata: false, throwOnInvalidObject: true }).catch(function (err) {
        var msg = (err && err.message) || '';
        if (/encrypt/i.test(msg)) {
          throw codedError('encrypted', '这个 PDF 有打开密码或加密限制，本机版本无法处理。请先在本机阅读器中解锁并另存一份。');
        }
        if (/header|parse|invalid|object/i.test(msg)) {
          throw codedError('invalid', '文件不是可读取的 PDF，或内容已损坏。本机版本没有修复能力。');
        }
        throw err;
      }).then(function (doc) {
        if (!doc.getPageCount()) throw codedError('empty', '这个 PDF 没有任何页面。');
        return doc;
      });
    });
  }

  function pageRotation(page) {
    var rot = page.getRotation && page.getRotation();
    return (rot && Number(rot.angle)) || 0;
  }

  function normalizedRotation(value) {
    return ((Number(value) || 0) % 360 + 360) % 360;
  }

  /* 页面显示尺寸（已包含旋转），用于生成视觉大小一致的空白页 */
  function displayDims(page) {
    var rotated = normalizedRotation(pageRotation(page)) % 180 !== 0;
    return rotated
      ? { w: page.getHeight(), h: page.getWidth() }
      : { w: page.getWidth(), h: page.getHeight() };
  }

  function tick(onProgress, done, total, label) {
    if (onProgress && onProgress(done, total, label) === false) throw abortError();
  }

  function appendBlank(target, source, model) {
    var dims;
    if (model.w && model.h) {
      dims = { w: Number(model.w), h: Number(model.h) };
    } else if (Number.isInteger(model.index) && source.getPageCount() > model.index) {
      dims = displayDims(source.getPage(model.index));
    } else {
      dims = { w: 595.28, h: 841.89 };
    }
    var page = target.addPage([dims.w, dims.h]);
    if (model.rot) page.setRotation(degrees(normalizedRotation(model.rot)));
    return page;
  }

  function createFromPages(file, models, onProgress) {
    ensureEngine();
    if (!file) return Promise.reject(new Error('没有可处理的原始 PDF。'));
    if (!models || !models.length) return Promise.reject(new Error('输出至少要包含一页。'));
    return Promise.all([load(file), PDFDocument.create()]).then(function (parts) {
      var source = parts[0], target = parts[1], chain = Promise.resolve();
      models.forEach(function (model, index) {
        chain = chain.then(function () {
          tick(onProgress, index + 1, models.length, '正在处理第 ' + (index + 1) + ' / ' + models.length + ' 页…');
          if (model.blank) return appendBlank(target, source, model);
          if (!Number.isInteger(model.index) || model.index < 0 || model.index >= source.getPageCount()) {
            throw codedError('pagerange', '页面顺序数据无效，请重新打开 PDF 后再试。');
          }
          return target.copyPages(source, [model.index]).then(function (copies) {
            var page = copies[0];
            var combined = normalizedRotation(pageRotation(page) + (Number(model.rot) || 0));
            if (combined) page.setRotation(degrees(combined));
            target.addPage(page);
            return page;
          });
        });
      });
      return chain.then(function () {
        tick(onProgress, models.length, models.length, '正在写入新文件…');
        return target.save({ useObjectStreams: true, addDefaultPage: false });
      });
    });
  }

  function merge(files, addBlankSeparators, onProgress) {
    ensureEngine();
    if (!files || files.length < 2) return Promise.reject(new Error('合并至少需要两个本机 PDF 文件。'));
    return PDFDocument.create().then(function (target) {
      var chain = Promise.resolve();
      files.forEach(function (entry, fileIndex) {
        chain = chain.then(function () {
          if (!entry || !entry.file) throw new Error('合并列表中含有演示项目，请移除后重新添加本机文件。');
          tick(onProgress, fileIndex + 1, files.length, '正在读取第 ' + (fileIndex + 1) + ' 个文件…');
          return load(entry.file).then(function (source) {
            var count = source.getPageCount();
            var indexes = [];
            for (var i = 0; i < count; i++) indexes.push(i);
            return target.copyPages(source, indexes).then(function (pages) {
              pages.forEach(function (page) { target.addPage(page); });
              if (addBlankSeparators && fileIndex < files.length - 1) {
                var last = pages[pages.length - 1];
                var dims = last ? displayDims(last) : { w: 595.28, h: 841.89 };
                target.addPage([dims.w, dims.h]);
              }
            });
          });
        });
      });
      return chain.then(function () {
        tick(onProgress, files.length, files.length, '正在写入合并文件…');
        return target.save({ useObjectStreams: true, addDefaultPage: false });
      });
    });
  }

  function pageCount(file) {
    return load(file).then(function (doc) { return doc.getPageCount(); });
  }

  global.ZJEngine = {
    pageCount: pageCount,
    createFromPages: createFromPages,
    merge: merge
  };
})(window);
