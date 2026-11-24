function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function formatDateTime(ts) {
  const d = new Date(ts);
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}

function formatDate(ts) {
  const d = new Date(ts);
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function pct(n, total) {
  return total ? ((n / total) * 100).toFixed(1) : '0.0';
}

function modeLabel(mode, language) {
  const modeText = mode === 'auto' ? '自动听写' : '手动听写';
  const langText = language === 'en' ? '英文播报' : '中文播报';
  return modeText + ' · ' + langText;
}

module.exports = {
  formatDateTime,
  formatDate,
  pct,
  modeLabel
};
