/* ===== 进度与统计 ===== */
window.App = window.App || {};
(function (A) {
  'use strict';
  var util = A.util, store = A.store, parser = A.parser;
  var stats = {};

  /* ---------- 总览 ---------- */
  stats.renderGlobal = function () {
    var banks = store.banks();
    var h = '<div class="page-head"><h1>学习统计</h1><p>所有题库的练习进度与正确率</p></div>';

    if (!banks.length) {
      return h + '<div class="empty"><div class="e-ico">📊</div><div class="e-title">还没有题库</div>' +
        '<div class="e-desc">先导入题库开始刷题吧</div><a class="btn primary" href="#/">去导入题库</a></div>';
    }

    var tTotal = 0, tAttempted = 0, tCorrect = 0, tWrong = 0;
    banks.forEach(function (b) {
      var p = store.progress(b);
      tTotal += p.total; tAttempted += p.attempted; tCorrect += p.correct; tWrong += p.wrong;
    });
    var rate = tAttempted ? Math.round(tCorrect / tAttempted * 100) : 0;

    h += '<div class="stat-grid">' +
      '<div class="stat"><div class="num">' + banks.length + '</div><div class="lbl">题库</div></div>' +
      '<div class="stat"><div class="num">' + tTotal + '</div><div class="lbl">题目总数</div></div>' +
      '<div class="stat"><div class="num">' + tAttempted + '</div><div class="lbl">已作答</div></div>' +
      '<div class="stat"><div class="num" style="color:var(--primary)">' + rate + '%</div><div class="lbl">正确率</div></div>' +
      '</div>';

    h += '<div class="card"><div class="card-title">各题库进度</div>';
    banks.forEach(function (b) {
      var p = store.progress(b);
      h += '<div style="margin-bottom:14px">';
      h += '<div class="row" style="gap:8px;margin-bottom:6px"><a href="#/stats/' + b.id + '" style="font-weight:600">' + util.esc(b.name) + '</a>' +
        '<span class="spacer"></span>' +
        '<span class="small muted">' + p.attempted + '/' + p.total + ' · 正确率 ' + p.rate + '%</span></div>';
      h += '<div class="bar' + (p.rate >= 80 ? ' green' : '') + '"><i style="width:' + p.cover + '%"></i></div>';
      h += '<div class="small muted" style="margin-top:4px">覆盖率 ' + p.cover + '% · 错题 ' + p.wrong + ' · 收藏 ' + p.fav + '</div>';
      h += '</div>';
    });
    h += '</div>';

    h += renderExamHistory(null);
    return h;
  };

  /* ---------- 单题库 ---------- */
  stats.renderBank = function (bankId) {
    var bank = store.getBank(bankId);
    if (!bank) return '<div class="empty">题库不存在</div>';
    var p = store.progress(bank);
    var chapters = store.chapterStats(bank);

    var h = '<div class="page-head"><h1>' + util.esc(bank.name) + '</h1><p>共 ' + p.total + ' 题 · 已作答 ' + p.attempted + ' 题</p></div>';

    h += '<div class="stat-grid">' +
      '<div class="stat"><div class="num">' + p.total + '</div><div class="lbl">总题数</div></div>' +
      '<div class="stat"><div class="num">' + p.cover + '%</div><div class="lbl">覆盖率</div></div>' +
      '<div class="stat"><div class="num" style="color:var(--green)">' + p.correct + '</div><div class="lbl">答对</div></div>' +
      '<div class="stat"><div class="num" style="color:var(--red)">' + p.wrong + '</div><div class="lbl">错题</div></div>' +
      '</div>';

    h += '<div class="btn-row" style="margin:14px 0">' +
      '<a class="btn" href="#/bank/' + bank.id + '">开始刷题</a>' +
      '<a class="btn" href="#/wrong/' + bank.id + '">错题本（' + p.wrong + '）</a>' +
      '<a class="btn" href="#/fav/' + bank.id + '">收藏（' + p.fav + '）</a>' +
      '<button class="btn danger" data-act="bank-clear" data-id="' + bank.id + '">清空记录</button>' +
      '</div>';

    /* 题型分布 */
    var byType = {};
    bank.questions.forEach(function (q) { byType[q.type] = (byType[q.type] || 0) + 1; });
    h += '<div class="card"><div class="card-title">题型分布</div><div class="row">';
    Object.keys(byType).forEach(function (t) {
      h += '<span class="badge primary">' + parser.typeName(t) + ' ' + byType[t] + '</span>';
    });
    h += '</div></div>';

    /* 章节进度 */
    h += '<div class="card"><div class="card-title">各章节进度</div>';
    if (!chapters.length) h += '<div class="muted small">暂无数据</div>';
    chapters.forEach(function (c) {
      var cov = c.total ? Math.round(c.attempted / c.total * 100) : 0;
      var rate = c.attempted ? Math.round(c.correct / c.attempted * 100) : 0;
      h += '<div style="margin-bottom:14px">';
      h += '<div class="row" style="gap:8px;margin-bottom:6px"><span style="font-weight:600;font-size:14px">' + util.esc(c.name) + '</span>' +
        '<span class="spacer"></span><span class="small muted">' + c.attempted + '/' + c.total + ' · ' + rate + '%</span></div>';
      h += '<div class="bar' + (rate >= 80 && c.attempted ? ' green' : '') + '"><i style="width:' + cov + '%"></i></div>';
      h += '<div class="small muted" style="margin-top:4px">错 ' + c.wrong + ' · 已掌握 ' + c.mastered + '</div>';
      h += '<div style="margin-top:6px"><a class="btn sm" href="#/practice/' + bank.id + '?mode=seq&chapter=' + encodeURIComponent(c.name) + '">练本章</a></div>';
      h += '</div>';
    });
    h += '</div>';

    h += renderExamHistory(bank.id);
    return h;
  };

  function renderExamHistory(bankId) {
    var all = store.exams().filter(function (e) { return !bankId || e.bankId === bankId; });
    var h = '<div class="card"><div class="card-title">考试记录<span class="spacer"></span>' +
      '<span class="small muted">最近 ' + Math.min(all.length, 10) + ' 次</span></div>';
    if (!all.length) { h += '<div class="muted small">还没有考试记录</div></div>'; return h; }
    all.slice(0, 10).forEach(function (e) {
      var passed = e.score >= 60;
      h += '<div class="list-item" style="margin-bottom:8px">' +
        '<div class="li-main"><div class="li-title">' + util.esc(bankId ? '' : (e.bankName + ' · ')) + e.score + ' 分' +
        '<span class="badge ' + (passed ? 'green' : 'red') + '" style="margin-left:6px">' + (passed ? '合格' : '未合格') + '</span></div>' +
        '<div class="li-sub">' + util.fmtDate(e.date) + ' · ' + e.correct + '/' + e.scoreable + ' 正确 · 用时 ' + util.fmtDuration(e.durationSec) + '</div></div>' +
        '<a class="btn sm" href="#/result/' + e.id + '">查看</a>' +
        '</div>';
    });
    h += '</div>';
    return h;
  }

  A.stats = stats;
})(window.App);
