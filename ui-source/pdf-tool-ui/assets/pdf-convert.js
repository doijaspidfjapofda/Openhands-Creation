/* 本机转换模块：PDF → 图片 / 图片 → PDF / PDF → 文本。全部在本机内存中完成。 */
(function (global) {
  'use strict';

  var PDFDocument = global.PDFLib && global.PDFLib.PDFDocument;
  var A4 = { w: 595.28, h: 841.89 };

  function abortError() {
    var err = new Error('已取消处理');
    err.name = 'AbortError';
    return err;
  }

  function codedError(code, message) {
    var err = new Error(message);
    err.code = code;
    return err;
  }

  function readBytes(file) {
    if (file && typeof file.arrayBuffer === 'function') {
      return file.arrayBuffer().then(function (buffer) { return new Uint8Array(buffer); });
    }
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('无法读取图片：' + ((file && file.name) || ''))); };
      reader.onload = function () { resolve(new Uint8Array(reader.result)); };
      reader.readAsArrayBuffer(file);
    });
  }

  function tick(onProgress, done, total, label) {
    if (onProgress && onProgress(done, total, label) === false) throw abortError();
  }

  function scopeIndexes(scope, current, total) {
    if (!total) return [];
    if (scope === 'current') return [Math.max(0, Math.min(total - 1, current || 0))];
    var out = [];
    for (var i = 0; i < total; i++) out.push(i);
    return out;
  }

  function formatTextContent(items) {
    var text = '';
    (items || []).forEach(function (item) {
      if (typeof item.str !== 'string') return;
      text += item.str;
      if (item.hasEOL) text += '\n';
    });
    return text.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  /* PDF → 纯文本。doc 为 pdf.js 文档对象，items 指定要导出的页面 */
  function pdfToText(doc, opts, onProgress) {
    if (!doc || typeof doc.numPages !== 'number') {
      return Promise.reject(codedError('nodoc', '请先打开一个真实 PDF 文件。'));
    }
    opts = opts || {};
    var items = opts.items && opts.items.length ? opts.items : scopeIndexes('all', 0, doc.numPages).map(function (i) { return { page: i + 1 }; });
    var pages = [];
    var chain = Promise.resolve();
    items.forEach(function (item, k) {
      chain = chain.then(function () {
        tick(onProgress, k + 1, items.length, '正在提取第 ' + (k + 1) + ' / ' + items.length + ' 页文字…');
        if (item.blank) {
          pages.push('--- 第 ' + (k + 1) + ' 页 ---\n（空白页）');
          return null;
        }
        return doc.getPage(item.page).then(function (page) {
          return page.getTextContent();
        }).then(function (content) {
          var body = formatTextContent(content.items);
          pages.push('--- 第 ' + (k + 1) + ' 页 ---\n' + (body || '（这一页没有文字层）'));
        });
      });
    });
    return chain.then(function () {
      var body = pages.join('\n\n');
      return body || '（这个 PDF 没有可提取的文字层，可能是扫描件。本机版本没有 OCR。）';
    });
  }

  function blankToBlob(size, dpi, type) {
    var scale = (Number(dpi) || 150) / 72;
    var canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round((size.w || A4.w) * scale));
    canvas.height = Math.max(1, Math.round((size.h || A4.h) * scale));
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        canvas.width = 0;
        canvas.height = 0;
        if (!blob) { reject(codedError('encode', '图片编码失败，可能是浏览器内存不足。')); return; }
        resolve(blob);
      }, type, 0.92);
    });
  }

  /* PDF → 图片。返回 [{name, blob}]，按传入页面顺序 */
  function pdfToImages(doc, opts, onProgress) {
    if (!doc || typeof doc.numPages !== 'number') {
      return Promise.reject(codedError('nodoc', '请先打开一个真实 PDF 文件。'));
    }
    opts = opts || {};
    var items = opts.items && opts.items.length
      ? opts.items
      : scopeIndexes(opts.scope, opts.current, doc.numPages).map(function (i) { return { page: i + 1 }; });
    var dpi = Number(opts.dpi) || 150;
    var type = opts.type === 'image/jpeg' ? 'image/jpeg' : 'image/png';
    var ext = type === 'image/jpeg' ? 'jpg' : 'png';
    var prefix = opts.prefix || '页面';
    var results = [];
    var chain = Promise.resolve();

    items.forEach(function (item, k) {
      chain = chain.then(function () {
        tick(onProgress, k + 1, items.length, '正在渲染第 ' + (k + 1) + ' / ' + items.length + ' 页…');
        var label = item.page || (k + 1);
        var blobPromise;
        if (item.blank) {
          blobPromise = blankToBlob(item.blank, dpi, type);
        } else {
          blobPromise = doc.getPage(item.page).then(function (page) {
            var viewport = page.getViewport({ scale: dpi / 72 });
            var canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.floor(viewport.width));
            canvas.height = Math.max(1, Math.floor(viewport.height));
            return page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise.then(function () {
              return new Promise(function (resolve, reject) {
                canvas.toBlob(function (blob) {
                  canvas.width = 0;
                  canvas.height = 0;
                  if (!blob) { reject(codedError('encode', '图片编码失败，可能是浏览器内存不足。')); return; }
                  resolve(blob);
                }, type, 0.92);
              });
            });
          });
        }
        return blobPromise.then(function (blob) {
          results.push({ name: prefix + '_第' + label + '页.' + ext, blob: blob });
        });
      });
    });

    return chain.then(function () { return results; });
  }

  function detectImageType(bytes) {
    if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
    if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
    return '';
  }

  /* 图片 → PDF。entries: [{file, name}]，按列表顺序每页一张 */
  function imagesToPdf(entries, opts, onProgress) {
    if (!PDFDocument) return Promise.reject(new Error('本地 PDF 处理组件没有加载，请重新启动应用。'));
    if (!entries || !entries.length) return Promise.reject(new Error('请先选择至少一张图片。'));
    var orientation = (opts && opts.orientation) || 'auto';
    return PDFDocument.create().then(function (doc) {
      var chain = Promise.resolve();
      entries.forEach(function (entry, index) {
        chain = chain.then(function () {
          tick(onProgress, index + 1, entries.length, '正在加入第 ' + (index + 1) + ' / ' + entries.length + ' 张图片…');
          return readBytes(entry.file).then(function (bytes) {
            var kind = detectImageType(bytes);
            if (!kind) {
              throw codedError('format', '“' + (entry.name || '图片') + '”不是支持的图片格式。当前只支持 PNG 和 JPG。');
            }
            var embed = kind === 'png' ? doc.embedPng(bytes) : doc.embedJpg(bytes);
            return embed.then(function (image) {
              var landscape = image.width > image.height;
              var pageSize;
              if (orientation === 'landscape') pageSize = { w: A4.h, h: A4.w };
              else if (orientation === 'portrait') pageSize = { w: A4.w, h: A4.h };
              else pageSize = landscape ? { w: A4.h, h: A4.w } : { w: A4.w, h: A4.h };
              var page = doc.addPage([pageSize.w, pageSize.h]);
              var scale = Math.min(pageSize.w / image.width, pageSize.h / image.height);
              var w = image.width * scale;
              var h = image.height * scale;
              page.drawImage(image, { x: (pageSize.w - w) / 2, y: (pageSize.h - h) / 2, width: w, height: h });
            });
          });
        });
      });
      return chain.then(function () {
        tick(onProgress, entries.length, entries.length, '正在写入 PDF…');
        return doc.save({ useObjectStreams: true, addDefaultPage: false });
      });
    });
  }

  global.ZJConvert = {
    scopeIndexes: scopeIndexes,
    formatTextContent: formatTextContent,
    pdfToText: pdfToText,
    pdfToImages: pdfToImages,
    imagesToPdf: imagesToPdf,
    detectImageType: detectImageType
  };
})(window);
