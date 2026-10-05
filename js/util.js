/* ===== 通用工具 ===== */
window.App = window.App || {};
(function (A) {
  'use strict';

  var util = {};

  util.uid = function (prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  /* 稳定内容哈希：用于生成题目标识，重新导入同一题库时学习记录可保留 */
  util.hash = function (str) {
    var h1 = 0x811c9dc5, h2 = 0x1000193;
    str = String(str);
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      h1 = ((h1 ^ c) * 0x01000193) >>> 0;
      h2 = ((h2 + c) * 0x85ebca6b) >>> 0;
    }
    return (h1.toString(36) + h2.toString(36));
  };

  util.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /* 去掉 HTML 标签并还原实体，得到用于匹配/搜索的纯文本 */
  util.plain = function (html) {
    return String(html == null ? '' : html)
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/\u200b/g, '');
  };

  /* 清理用户文档里的 HTML：只保留安全标签 */
  util.sanitize = function (html) {
    var s = String(html == null ? '' : html);
    s = s.replace(/<script[\s\S]*?<\/script>/gi, '');
    s = s.replace(/<style[\s\S]*?<\/style>/gi, '');
    s = s.replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
    s = s.replace(/(href|src)\s*=\s*("\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi, '$1="#"');
    s = s.replace(/<(iframe|object|embed|form|input|link|meta)[\s\S]*?>/gi, '');
    return s;
  };

  /* 统一空白：全角空格 → 半角，连续空白压缩 */
  util.normSpace = function (s) {
    return String(s == null ? '' : s).replace(/\u3000/g, ' ').replace(/[\s\u00a0]+/g, ' ').trim();
  };

  /* 全角 → 半角 标点/字母数字（用于答案比对与匹配） */
  util.toHalf = function (s) {
    return String(s == null ? '' : s).replace(/[\uff01-\uff5e]/g, function (ch) {
      return String.fromCharCode(ch.charCodeAt(0) - 0xfee0);
    }).replace(/\u3000/g, ' ');
  };

  util.fmtDuration = function (sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    if (m >= 60) {
      var h = Math.floor(m / 60); m = m % 60;
      return h + ':' + String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }
    return m + ':' + String(s).padStart(2, '0');
  };

  util.fmtDate = function (ts) {
    var d = new Date(ts || Date.now());
    var p = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  };

  /* ---- 提示条 ---- */
  var toastTimer = null;
  util.toast = function (msg, kind) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'toast show' + (kind ? ' ' + kind : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, 2400);
  };

  /* ---- 文件读取 ---- */
  util.readAsText = function (file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(String(fr.result || '')); };
      fr.onerror = function () { reject(fr.error || new Error('读取失败')); };
      fr.readAsText(file, 'utf-8');
    });
  };

  util.readAsArrayBuffer = function (file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fr.error || new Error('读取失败')); };
      fr.readAsArrayBuffer(file);
    });
  };

  util.download = function (filename, content, mime) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  };

  util.bytes = function (n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  };

  /* ---- 模态框 ---- */
  util.modal = function (opts) {
    var root = document.getElementById('modalRoot');
    var mask = document.createElement('div');
    mask.className = 'modal-mask';
    var bodyHtml = opts.html || '';
    mask.innerHTML =
      '<div class="modal' + (opts.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
      (opts.title ? '<h3>' + util.esc(opts.title) + '</h3>' : '') +
      '<div class="modal-body">' + bodyHtml + '</div>' +
      '<div class="modal-actions">' +
      (opts.cancelText === null ? '' : '<button class="btn" data-mo="cancel">' + util.esc(opts.cancelText || '取消') + '</button>') +
      '<button class="btn ' + (opts.danger ? 'danger' : 'primary') + '" data-mo="ok">' + util.esc(opts.okText || '确定') + '</button>' +
      '</div></div>';
    root.appendChild(mask);

    function close() {
      if (mask.parentNode) mask.parentNode.removeChild(mask);
      document.removeEventListener('keydown', onKey);
    }
    function onKey(e) { if (e.key === 'Escape') { close(); if (opts.onCancel) opts.onCancel(); } }

    mask.addEventListener('click', function (e) {
      var act = e.target.getAttribute && e.target.getAttribute('data-mo');
      if (e.target === mask) { close(); if (opts.onCancel) opts.onCancel(); return; }
      if (act === 'cancel') { close(); if (opts.onCancel) opts.onCancel(); }
      if (act === 'ok') {
        var res = opts.onOk ? opts.onOk(mask) : true;
        if (res !== false) close();
      }
    });
    document.addEventListener('keydown', onKey);

    if (opts.onMount) opts.onMount(mask, close);
    var focusEl = mask.querySelector('input,textarea,select');
    if (focusEl) focusEl.focus();
    return close;
  };

  util.confirm = function (title, message, onOk, opts) {
    opts = opts || {};
    util.modal({
      title: title,
      html: '<div class="small">' + util.esc(message) + '</div>',
      okText: opts.okText || '确定',
      cancelText: opts.cancelText || '取消',
      danger: opts.danger,
      onOk: function () { onOk(); }
    });
  };

  A.util = util;
})(window.App);
