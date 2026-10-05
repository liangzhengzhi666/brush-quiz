/* ===== 模拟考试：组卷 / 限时 / 交卷评分 / 成绩单 ===== */
window.App = window.App || {};
(function (A) {
  'use strict';
  var util = A.util, store = A.store, parser = A.parser;
  var exam = {};

  var setupState = null;   // 组卷配置页状态
  var ex = null;           // 考试进行中状态
  var tick = null;

  /* ---------- 组卷配置 ---------- */
  exam.setup = function (params) {
    var bank = store.getBank(params.bankId);
    // 同一题库重复进入时保留用户已做的组卷设置（渲染会多次调用本函数）
    if (setupState && setupState.bankId === params.bankId && setupState.bank === bank) return;
    setupState = {
      bankId: params.bankId,
      bank: bank,
      count: Math.min(20, bank ? bank.questions.length : 20),
      minutes: 20,
      chapter: '__all',
      types: { single: true, multiple: true, judge: true, blank: true, short: false }
    };
    if (bank && bank.questions.length <= 20) setupState.count = bank.questions.length;
    // 记住上次配置
    var saved = store.getSetting('examCfg', null);
    if (saved && bank) {
      setupState.minutes = saved.minutes || setupState.minutes;
      setupState.types = saved.types || setupState.types;
    }
  };

  exam.renderSetup = function () {
    if (!setupState || !setupState.bank) return '<div class="empty">题库不存在</div>';
    var bank = setupState.bank;
    var s = setupState;
    var chapters = store.chapterNames(bank);
    var pool = poolOf(s);
    var available = pool.length;

    var h = '';
    h += '<div class="page-head"><h1>模拟考试</h1><p>' + util.esc(bank.name) + ' · 共 ' + bank.questions.length + ' 题</p></div>';
    h += '<div class="card"><div class="card-title">组卷设置</div>';

    h += '<div class="field"><label>章节范围</label><select data-act="e-cfg" data-k="chapter">';
    h += '<option value="__all">全部章节</option>';
    chapters.forEach(function (c) {
      h += '<option value="' + util.esc(c) + '"' + (s.chapter === c ? ' selected' : '') + '>' + util.esc(c) + '</option>';
    });
    h += '</select></div>';

    h += '<div class="field"><label>题型</label><div class="row">';
    [['single', '单选题'], ['multiple', '多选题'], ['judge', '判断题'], ['blank', '填空题'], ['short', '简答题（不计入自动评分）']].forEach(function (p) {
      h += '<label class="badge" style="cursor:pointer;padding:5px 10px">' +
        '<input type="checkbox" data-act="e-cfg-type" data-k="' + p[0] + '"' + (s.types[p[0]] ? ' checked' : '') + ' style="width:auto;margin-right:5px">' +
        util.esc(p[1]) + '</label>';
    });
    h += '</div></div>';

    h += '<div class="grid2">';
    h += '<div class="field"><label for="examCount">题目数量（可用 ' + available + ' 题）</label>' +
      '<input id="examCount" type="number" min="1" max="' + Math.max(1, available) + '" value="' + s.count + '" data-act="e-cfg" data-k="count"></div>';
    h += '<div class="field"><label for="examMinutes">考试时长（分钟）</label>' +
      '<input id="examMinutes" type="number" min="1" max="300" value="' + s.minutes + '" data-act="e-cfg" data-k="minutes"></div>';
    h += '</div>';

    h += '<div class="btn-row"><button class="btn primary" data-act="e-start">开始考试</button>' +
      '<a class="btn" href="#/bank/' + bank.id + '">返回</a></div>';
    h += '</div>';

    h += '<div class="notice info">考试中不显示对错，交卷后统一评分。答错与未作答的题目会自动进入错题本。</div>';
    if (available === 0) h += '<div class="notice">当前筛选条件下没有可用题目，请调整章节或题型。</div>';
    return h;
  };

  function poolOf(s) {
    var qs = s.bank.questions.filter(function (q) {
      if (s.chapter !== '__all' && q.chapter !== s.chapter) return false;
      return !!s.types[q.type];
    });
    return qs;
  }

  exam.handleSetup = function (act, el) {
    if (!setupState) return false;
    var s = setupState;
    if (act === 'e-cfg') {
      var k = el.getAttribute('data-k');
      var v = el.value;
      if (k === 'count') s.count = Math.max(1, parseInt(v, 10) || 1);
      else if (k === 'minutes') s.minutes = Math.max(1, parseInt(v, 10) || 1);
      else if (k === 'chapter') {
        s.chapter = v;
        var avail = poolOf(s).length;          // 切换范围后同步刷新可用题数与默认题量
        if (avail && s.count > avail) s.count = avail;
        A.app.render();
      }
      return true;
    }
    if (act === 'e-cfg-type') {
      s.types[el.getAttribute('data-k')] = el.checked;
      A.app.render();
      return true;
    }
    if (act === 'e-start') {
      start();
      return true;
    }
    return false;
  };

  function start() {
    var s = setupState;
    var pool = poolOf(s);
    if (!pool.length) { util.toast('没有可用题目', 'err'); return; }
    var count = Math.min(s.count, pool.length);
    var qs = A.practice.shuffle(pool).slice(0, count);
    store.setSetting('examCfg', { minutes: s.minutes, types: s.types });

    ex = {
      bankId: s.bankId, bank: s.bank,
      questions: qs, idx: 0, resp: {}, cardOpen: false,
      limitSec: s.minutes * 60,
      startTs: Date.now(),
      submitted: false,
      mode: 'exam'
    };
    location.hash = '#/examrun/' + s.bankId;
  }

  exam.active = function () { return !!ex; };
  exam.state = function () { return ex; };

  /* ---------- 考试进行中 ---------- */
  function remaining() {
    if (!ex) return 0;
    return Math.max(0, ex.limitSec - Math.floor((Date.now() - ex.startTs) / 1000));
  }

  exam.renderRun = function () {
    if (!ex) return '<div class="empty">考试未开始</div>';
    var q = ex.questions[ex.idx];
    var total = ex.questions.length;
    var answered = Object.keys(ex.resp).filter(function (k) { return ex.resp[k] !== '' && ex.resp[k] !== undefined && ex.resp[k] !== null; }).length;
    var left = remaining();

    var h = '';
    h += '<div class="run-head">';
    h += '<span class="run-title">模拟考试</span>';
    h += '<span class="run-progress">' + (ex.idx + 1) + ' / ' + total + '</span>';
    h += '<span class="spacer"></span>';
    h += '<span class="timer" id="examTimer">' + util.fmtDuration(left) + '</span>';
    h += '<button class="btn sm" data-act="e-card">答题卡</button>';
    h += '<button class="btn sm danger" data-act="e-submit">交卷</button>';
    h += '</div>';
    h += '<div class="bar" style="margin-bottom:14px"><i style="width:' + (total ? (ex.idx + 1) / total * 100 : 0) + '%"></i></div>';

    if (ex.cardOpen) h += renderCard();

    var sel = ex.resp[q.id];
    h += '<div class="card q-card">';
    h += '<div class="q-meta"><span class="badge primary">' + parser.typeName(q.type) + '</span>' +
      (q.chapter ? '<span class="badge">' + util.esc(q.chapter) + '</span>' : '') +
      '<span class="spacer"></span><span class="badge">已答 ' + answered + '/' + total + '</span></div>';
    h += '<div class="q-stem">' + q.stem + '</div>';

    if (q.type === 'single' || q.type === 'multiple') {
      h += '<div class="opts">';
      q.options.forEach(function (o) {
        var isSel = q.type === 'single' ? (sel === o.key) : !!(sel && String(sel).indexOf(o.key) >= 0);
        h += '<button class="opt' + (isSel ? ' selected' : '') + '" data-act="e-opt" data-key="' + o.key + '">' +
          '<span class="opt-key">' + o.key + '</span><span class="opt-text">' + o.html + '</span></button>';
      });
      h += '</div>';
    } else if (q.type === 'judge') {
      h += '<div class="judge-opts">';
      [[true, '正确', '✓'], [false, '错误', '✗']].forEach(function (p) {
        var isSel = (sel === p[0]);
        h += '<button class="opt' + (isSel ? ' selected' : '') + '" data-act="e-opt" data-val="' + p[0] + '">' +
          '<span class="opt-key">' + p[2] + '</span><span class="opt-text">' + p[1] + '</span></button>';
      });
      h += '</div>';
    } else if (q.type === 'blank') {
      h += '<div class="blank-input"><input type="text" data-act="e-input" placeholder="请输入答案" value="' + util.esc(sel || '') + '"></div>';
    } else {
      h += '<div class="blank-input"><textarea data-act="e-input" placeholder="请作答">' + util.esc(sel || '') + '</textarea></div>';
    }

    h += '<div class="run-actions">';
    if (ex.idx > 0) h += '<button class="btn" data-act="e-prev">上一题</button>';
    if (ex.idx < total - 1) h += '<button class="btn primary" data-act="e-next">下一题</button>';
    else h += '<button class="btn primary" data-act="e-submit">交卷</button>';
    h += '</div></div>';
    return h;
  };

  function renderCard() {
    var h = '<div class="card"><div class="card-title">答题卡<span class="spacer"></span><span class="small muted">点击可跳题</span></div><div class="card-grid">';
    ex.questions.forEach(function (q, i) {
      var v = ex.resp[q.id];
      var has = v !== undefined && v !== null && v !== '';
      var cls = 'card-cell' + (has ? ' answered' : '') + (i === ex.idx ? ' cur' : '');
      h += '<button class="' + cls + '" data-act="e-jump" data-idx="' + i + '">' + (i + 1) + '</button>';
    });
    h += '</div><div class="legend"><span><i style="background:var(--primary-weak);border:1px solid var(--primary)"></i>已作答</span>' +
      '<span><i style="background:var(--card);border:1px solid var(--border)"></i>未作答</span></div></div>';
    return h;
  }

  exam.handleRun = function (act, el) {
    if (!ex) return false;
    var q = ex.questions[ex.idx];
    switch (act) {
      case 'e-card': ex.cardOpen = !ex.cardOpen; A.app.render(); return true;
      case 'e-jump': ex.idx = parseInt(el.getAttribute('data-idx'), 10) || 0; ex.cardOpen = false; A.app.render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return true;
      case 'e-prev': if (ex.idx > 0) { ex.idx--; A.app.render(); window.scrollTo({ top: 0, behavior: 'smooth' }); } return true;
      case 'e-next': if (ex.idx < ex.questions.length - 1) { ex.idx++; A.app.render(); window.scrollTo({ top: 0, behavior: 'smooth' }); } return true;
      case 'e-opt': {
        var key = el.getAttribute('data-key');
        var val = el.getAttribute('data-val');
        if (val !== null) { ex.resp[q.id] = (val === 'true'); A.app.render(); return true; }
        if (q.type === 'single') { ex.resp[q.id] = key; A.app.render(); return true; }
        var cur = String(ex.resp[q.id] || '').split('').filter(Boolean);
        var i = cur.indexOf(key);
        if (i >= 0) cur.splice(i, 1); else cur.push(key);
        cur.sort();
        ex.resp[q.id] = cur.join('');
        A.app.render();
        return true;
      }
      case 'e-input': ex.resp[q.id] = el.value; return true;
      case 'e-submit': confirmSubmit(); return true;
    }
    return false;
  };

  function confirmSubmit() {
    var total = ex.questions.length;
    var unanswered = ex.questions.filter(function (q) {
      var v = ex.resp[q.id];
      return v === undefined || v === null || v === '';
    }).length;
    util.confirm('确认交卷？',
      unanswered ? ('还有 ' + unanswered + ' 道题未作答，交卷后立即评分。') : '所有题目均已作答，交卷后立即评分。',
      function () { submit(); },
      { okText: '交卷评分', danger: unanswered > 0 });
  }

  function submit(auto) {
    if (!ex || ex.submitted) return;
    ex.submitted = true;
    stopTimer();

    var details = [];
    var scoreable = 0, correct = 0, wrong = 0, blankShort = 0;
    ex.questions.forEach(function (q) {
      var v = ex.resp[q.id];
      var has = !(v === undefined || v === null || v === '');
      var res = has ? parser.grade(q, v) : false;
      if (res === null) {   // 简答题：不计入自动评分
        blankShort++;
        details.push({ qid: q.id, sel: has ? v : '', ok: null, type: q.type });
        return;
      }
      scoreable++;
      if (res) correct++; else wrong++;
      store.recordAnswer(ex.bankId, q.id, res);
      details.push({ qid: q.id, sel: has ? v : '', ok: res, type: q.type });
    });

    var score = scoreable ? Math.round(correct / scoreable * 100) : 0;
    var rec = {
      id: util.uid('ex'),
      bankId: ex.bankId,
      bankName: ex.bank.name,
      total: ex.questions.length,
      scoreable: scoreable,
      correct: correct,
      wrong: wrong,
      selfReview: blankShort,
      score: score,
      durationSec: Math.floor((Date.now() - ex.startTs) / 1000),
      limitSec: ex.limitSec,
      auto: !!auto,
      date: Date.now(),
      qids: ex.questions.map(function (q) { return q.id; }),
      details: details
    };
    store.addExam(rec);
    var id = rec.id;
    ex = null;
    location.hash = '#/result/' + id;
  }

  function stopTimer() { if (tick) { clearInterval(tick); tick = null; } }

  exam.startTimer = function () {
    stopTimer();
    tick = setInterval(function () {
      var el = document.getElementById('examTimer');
      if (!ex) { stopTimer(); return; }
      var left = remaining();
      if (el) {
        el.textContent = util.fmtDuration(left);
        if (left <= 60) el.classList.add('warn');
      }
      if (left <= 0) {
        stopTimer();
        util.toast('考试时间到，自动交卷', 'err');
        submit(true);
      }
    }, 1000);
  };
  exam.stopTimer = stopTimer;

  exam.quit = function () {
    stopTimer();
    ex = null;
  };

  /* ---------- 成绩单 ---------- */
  exam.renderResult = function (id) {
    var rec = store.getExam(id);
    if (!rec) return '<div class="empty"><div class="e-ico">😕</div><div class="e-title">成绩记录不存在</div></div>';
    var bank = store.getBank(rec.bankId);
    var passed = rec.score >= 60;

    var h = '';
    h += '<div class="page-head"><h1>成绩单</h1><p>' + util.esc(rec.bankName) + ' · ' + util.fmtDate(rec.date) +
      (rec.auto ? ' · 超时自动交卷' : '') + '</p></div>';

    h += '<div class="card" style="text-align:center">';
    h += '<div style="font-size:44px;font-weight:800;letter-spacing:1px;color:' + (passed ? 'var(--green)' : 'var(--red)') + '">' + rec.score + '<span style="font-size:18px;font-weight:600"> 分</span></div>';
    h += '<div class="muted small">' + (passed ? '合格' : '未合格') + ' · 用时 ' + util.fmtDuration(rec.durationSec) + ' / 限时 ' + util.fmtDuration(rec.limitSec) + '</div>';
    h += '</div>';

    h += '<div class="stat-grid">';
    h += '<div class="stat"><div class="num">' + rec.total + '</div><div class="lbl">总题数</div></div>';
    h += '<div class="stat"><div class="num" style="color:var(--green)">' + rec.correct + '</div><div class="lbl">正确</div></div>';
    h += '<div class="stat"><div class="num" style="color:var(--red)">' + rec.wrong + '</div><div class="lbl">错误</div></div>';
    h += '<div class="stat"><div class="num">' + (rec.scoreable ? Math.round(rec.correct / rec.scoreable * 100) : 0) + '%</div><div class="lbl">正确率</div></div>';
    h += '</div>';

    if (rec.selfReview) h += '<div class="notice">本次含 ' + rec.selfReview + ' 道简答题，不计入自动评分，请在下方自行对照参考答案。</div>';

    h += '<div class="btn-row" style="margin:14px 0">';
    if (bank) {
      h += '<a class="btn primary" href="#/bank/' + bank.id + '">返回题库</a>';
      if (rec.wrong) h += '<a class="btn" href="#/practice/' + bank.id + '?mode=wrong">练习本次错题</a>';
    }
    h += '<button class="btn" data-act="r-print">保存成绩单</button>';
    h += '</div>';

    h += '<div class="card"><div class="card-title">答卷详情</div>';
    rec.details.forEach(function (d, i) {
      var q = null;
      if (bank) q = bank.questions.filter(function (x) { return x.id === d.qid; })[0];
      if (!q) { h += '<div class="q-preview"><div class="qp-stem muted">第 ' + (i + 1) + ' 题（题目已删除）</div></div>'; return; }
      var tag = d.ok === null ? '<span class="badge amber">待自评</span>'
        : d.ok ? '<span class="badge green">正确</span>' : '<span class="badge red">错误</span>';
      h += '<div class="q-preview">';
      h += '<div class="row" style="gap:6px;margin-bottom:6px">' + tag +
        '<span class="badge">' + parser.typeName(q.type) + '</span>' +
        '<span class="small muted">第 ' + (i + 1) + ' 题</span></div>';
      h += '<div class="qp-stem">' + q.stem + '</div>';
      if (d.ok === false || d.ok === null) {
        h += '<div class="small" style="color:var(--red)">你的作答：' + myAnswer(q, d.sel) + '</div>';
        h += '<div class="small" style="color:var(--green)">正确答案：' + parser.answerText(q) + '</div>';
        if (q.analysis) h += '<div class="small muted" style="margin-top:4px">解析：' + q.analysis + '</div>';
      }
      h += '</div>';
    });
    h += '</div>';
    return h;
  };

  /* 展示考生作答 */
  function myAnswer(q, sel) {
    if (sel === '' || sel === undefined || sel === null) return '<span class="muted">未作答</span>';
    if (q.type === 'judge') return sel ? '正确' : '错误';
    if (q.type === 'single' || q.type === 'multiple') return util.esc(String(sel).split('').join('、'));
    return util.esc(String(sel));
  }

  exam.handleResult = function (act) {
    if (act === 'r-print') { window.print(); return true; }
    return false;
  };

  A.exam = exam;
})(window.App);
