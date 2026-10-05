/* ===== 本地存储（localStorage） =====
 * 数据结构：
 * { version, banks:[{id,name,createdAt,source,questions:[]}],
 *   records:{ [bankId]:{ [qid]:{c,w,last,time,fav,ok} } },
 *   exams:[...], settings:{theme} }
 */
window.App = window.App || {};
(function (A) {
  'use strict';
  var KEY = 'brushquiz.v1';
  var VERSION = 1;
  var store = {};
  var cache = null;

  function blank() {
    return { version: VERSION, banks: [], records: {}, exams: [], settings: {} };
  }

  store.load = function () {
    if (cache) return cache;
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var d = JSON.parse(raw);
        cache = normalize(d);
      } else {
        cache = blank();
      }
    } catch (e) {
      console.warn('读取本地数据失败，已重置', e);
      cache = blank();
    }
    return cache;
  };

  function normalize(d) {
    var out = blank();
    if (!d || typeof d !== 'object') return out;
    if (Array.isArray(d.banks)) out.banks = d.banks;
    if (d.records && typeof d.records === 'object') out.records = d.records;
    if (Array.isArray(d.exams)) out.exams = d.exams;
    if (d.settings && typeof d.settings === 'object') out.settings = d.settings;
    return out;
  }

  store.save = function () {
    try {
      localStorage.setItem(KEY, JSON.stringify(store.load()));
      return true;
    } catch (e) {
      A.util.toast('本地存储写入失败（可能空间已满）', 'err');
      console.error(e);
      return false;
    }
  };

  store.data = function () { return store.load(); };

  /* ---------- 题库 ---------- */
  store.banks = function () { return store.load().banks; };

  store.getBank = function (id) {
    var bs = store.banks();
    for (var i = 0; i < bs.length; i++) if (bs[i].id === id) return bs[i];
    return null;
  };

  store.addBank = function (bank) {
    var d = store.load();
    // 题目 id 去重（同题库内重复题）
    var seen = {};
    bank.questions.forEach(function (q, i) {
      if (seen[q.id]) q.id = q.id + '#' + i;
      seen[q.id] = 1;
    });
    d.banks.unshift(bank);
    d.records[bank.id] = d.records[bank.id] || {};
    store.save();
    return bank;
  };

  /* 按 id 覆盖式导入：共享题库更新用。题库内容替换，做题记录原样保留 */
  store.upsertBank = function (bank) {
    var d = store.load();
    var seen = {};
    bank.questions.forEach(function (q, i) {
      if (seen[q.id]) q.id = q.id + '#' + i;
      seen[q.id] = 1;
    });
    for (var i = 0; i < d.banks.length; i++) {
      if (d.banks[i].id === bank.id) {
        var recs = d.records[bank.id] || {};
        d.banks[i] = bank;
        d.records[bank.id] = recs;
        store.save();
        return bank;
      }
    }
    return store.addBank(bank);
  };

  store.deleteBank = function (id) {
    var d = store.load();
    d.banks = d.banks.filter(function (b) { return b.id !== id; });
    delete d.records[id];
    d.exams = d.exams.filter(function (e) { return e.bankId !== id; });
    store.save();
  };

  store.renameBank = function (id, name) {
    var b = store.getBank(id);
    if (b) { b.name = name; store.save(); }
    return b;
  };

  /* ---------- 答题记录 ---------- */
  store.records = function (bankId) {
    var d = store.load();
    if (!d.records[bankId]) d.records[bankId] = {};
    return d.records[bankId];
  };

  store.getRec = function (bankId, qid) {
    return store.records(bankId)[qid] || null;
  };

  /* correct: true/false/null(跳过) */
  store.recordAnswer = function (bankId, qid, correct) {
    var recs = store.records(bankId);
    var r = recs[qid] || { c: 0, w: 0 };
    if (correct === true) { r.c = (r.c || 0) + 1; r.last = 1; }
    else if (correct === false) { r.w = (r.w || 0) + 1; r.last = 0; }
    r.time = Date.now();
    recs[qid] = r;
    store.save();
    return r;
  };

  store.setFav = function (bankId, qid, val) {
    var recs = store.records(bankId);
    var r = recs[qid] || { c: 0, w: 0 };
    r.fav = !!val;
    if (!r.fav && !r.c && !r.w && !r.ok) delete recs[qid];
    else recs[qid] = r;
    store.save();
  };

  store.setMastered = function (bankId, qid, val) {
    var recs = store.records(bankId);
    var r = recs[qid] || { c: 0, w: 0 };
    r.ok = !!val;
    if (!r.fav && !r.c && !r.w && !r.ok) delete recs[qid];
    else recs[qid] = r;
    store.save();
  };

  store.clearRecords = function (bankId) {
    var d = store.load();
    d.records[bankId] = {};
    store.save();
  };

  store.toggleFav = function (bankId, qid) {
    var r = store.getRec(bankId, qid);
    var next = !(r && r.fav);
    store.setFav(bankId, qid, next);
    return next;
  };

  /* ---------- 派生列表 ---------- */
  store.wrongList = function (bank) {
    var recs = store.records(bank.id);
    return bank.questions.filter(function (q) {
      var r = recs[q.id];
      return r && r.last === 0 && !r.ok;
    });
  };

  store.favList = function (bank) {
    var recs = store.records(bank.id);
    return bank.questions.filter(function (q) {
      var r = recs[q.id];
      return r && r.fav;
    });
  };

  /* 已作答过的题（含正确/错误） */
  store.answeredList = function (bank) {
    var recs = store.records(bank.id);
    return bank.questions.filter(function (q) {
      var r = recs[q.id];
      return r && (r.c || r.w);
    });
  };

  store.progress = function (bank) {
    var recs = store.records(bank.id);
    var attempted = 0, correct = 0, wrong = 0, unanswered = 0, fav = 0, mastered = 0;
    var seenCorrect = 0;
    bank.questions.forEach(function (q) {
      var r = recs[q.id];
      if (!r) { unanswered++; return; }
      if (r.fav) fav++;
      if (r.ok) mastered++;
      if (r.c || r.w) {
        attempted++;
        if (r.last === 1) { correct++; } else if (r.last === 0) { wrong++; }
        if (r.c) seenCorrect++;
      } else {
        unanswered++;
      }
    });
    return {
      total: bank.questions.length,
      attempted: attempted,
      unanswered: unanswered,
      correct: correct,
      wrong: wrong,
      fav: fav,
      mastered: mastered,
      rate: attempted ? Math.round(correct / attempted * 100) : 0,
      cover: bank.questions.length ? Math.round(attempted / bank.questions.length * 100) : 0
    };
  };

  store.chapterStats = function (bank) {
    var recs = store.records(bank.id);
    var map = {}, order = [];
    bank.questions.forEach(function (q) {
      var key = q.chapterGroup + '||' + q.chapter;
      if (!map[key]) { map[key] = { group: q.chapterGroup, name: q.chapter, total: 0, attempted: 0, correct: 0, wrong: 0, mastered: 0 }; order.push(key); }
      var s = map[key];
      s.total++;
      var r = recs[q.id];
      if (r) {
        if (r.ok) s.mastered++;
        if (r.c || r.w) {
          s.attempted++;
          if (r.last === 1) s.correct++; else s.wrong++;
        }
      }
    });
    return order.map(function (k) { return map[k]; });
  };

  store.chapterNames = function (bank) {
    var seen = {}, out = [];
    bank.questions.forEach(function (q) {
      if (!seen[q.chapter]) { seen[q.chapter] = 1; out.push(q.chapter); }
    });
    return out;
  };

  /* ---------- 考试记录 ---------- */
  store.exams = function () { return store.load().exams; };

  store.getExam = function (id) {
    var es = store.exams();
    for (var i = 0; i < es.length; i++) if (es[i].id === id) return es[i];
    return null;
  };

  store.addExam = function (exam) {
    var d = store.load();
    d.exams.unshift(exam);
    if (d.exams.length > 200) d.exams.length = 200;
    store.save();
    return exam;
  };

  store.deleteExam = function (id) {
    var d = store.load();
    d.exams = d.exams.filter(function (e) { return e.id !== id; });
    store.save();
  };

  /* ---------- 设置 ---------- */
  store.getSetting = function (k, def) {
    var s = store.load().settings;
    return s[k] === undefined ? def : s[k];
  };
  store.setSetting = function (k, v) {
    store.load().settings[k] = v;
    store.save();
  };

  /* ---------- 导入 / 导出 ---------- */
  store.exportAll = function () {
    return JSON.stringify(store.load(), null, 1);
  };

  store.exportBank = function (bankId) {
    var d = store.load();
    var bank = store.getBank(bankId);
    return JSON.stringify({
      version: VERSION,
      type: 'bank',
      banks: bank ? [bank] : [],
      records: d.records[bankId] ? (function () { var o = {}; o[bankId] = d.records[bankId]; return o; })() : {}
    }, null, 1);
  };

  /* mode: 'merge' | 'replace' */
  store.importAll = function (jsonText, mode) {
    var d;
    try { d = JSON.parse(jsonText); } catch (e) { throw new Error('文件不是有效的 JSON'); }
    if (!d || typeof d !== 'object') throw new Error('文件内容无法识别');
    if (!Array.isArray(d.banks)) throw new Error('文件中没有找到题库数据');

    mode = mode || 'merge';
    var cur = store.load();
    if (mode === 'replace') {
      cur.banks = [];
      cur.records = {};
      cur.exams = [];
    }
    var addedBanks = 0, addedRecords = 0;
    d.banks.forEach(function (b) {
      if (!b || !b.id || !Array.isArray(b.questions)) return;
      var exist = null;
      for (var i = 0; i < cur.banks.length; i++) if (cur.banks[i].id === b.id) { exist = cur.banks[i]; break; }
      if (exist) {
        // 同 id 题库：按题目 id 合并
        var have = {};
        exist.questions.forEach(function (q) { have[q.id] = 1; });
        b.questions.forEach(function (q) { if (!have[q.id]) { exist.questions.push(q); have[q.id] = 1; } });
      } else {
        cur.banks.push(b); addedBanks++;
      }
    });
    if (d.records && typeof d.records === 'object') {
      Object.keys(d.records).forEach(function (bid) {
        cur.records[bid] = cur.records[bid] || {};
        Object.keys(d.records[bid] || {}).forEach(function (qid) {
          var incoming = d.records[bid][qid];
          var mine = cur.records[bid][qid];
          if (!mine) { cur.records[bid][qid] = incoming; addedRecords++; return; }
          // 合并计数，标记取并集
          mine.c = Math.max(mine.c || 0, incoming.c || 0);
          mine.w = Math.max(mine.w || 0, incoming.w || 0);
          if (incoming.time && (!mine.time || incoming.time > mine.time)) { mine.last = incoming.last; mine.time = incoming.time; }
          if (incoming.fav) mine.fav = true;
          if (incoming.ok) mine.ok = true;
        });
      });
    }
    if (Array.isArray(d.exams)) {
      var haveEx = {};
      cur.exams.forEach(function (e) { haveEx[e.id] = 1; });
      d.exams.forEach(function (e) { if (e && e.id && !haveEx[e.id]) cur.exams.push(e); });
      cur.exams.sort(function (a, b) { return (b.date || 0) - (a.date || 0); });
    }
    store.save();
    return { banks: addedBanks, records: addedRecords };
  };

  store.usage = function () {
    try {
      var raw = localStorage.getItem(KEY) || '';
      return raw.length;
    } catch (e) { return 0; }
  };

  store.clearAll = function () {
    cache = blank();
    try { localStorage.removeItem(KEY); } catch (e) { }
    store.save();
  };

  A.store = store;
})(window.App);
