/* ===== 练习引擎：顺序 / 随机 / 背题 / 错题重练 ===== */
window.App = window.App || {};
(function (A) {
  'use strict';
  var util = A.util, store = A.store, parser = A.parser;
  var practice = {};

  var MODES = {
    seq:    { name: '顺序练习', ico: '→', desc: '按题库原顺序逐题作答，即时判分' },
    random: { name: '随机练习', ico: '⇄', desc: '打乱题目顺序，避免记住位置' },
    recite: { name: '背题模式', ico: '☰', desc: '直接显示答案与解析，快速过题' },
    wrong:  { name: '错题重练', ico: '✗', desc: '只练答错且未标记掌握的题目' }
  };
  practice.MODES = MODES;
  practice.modeName = function (m) { return (MODES[m] || {}).name || m; };

  var st = null;

  practice.start = function (params) {
    var key = [params.bankId, params.mode || 'seq', params.chapter || ''].join('|');
    if (st && st.key === key) return;   // 参数未变，保留进度

    var bank = store.getBank(params.bankId);
    if (!bank) { st = null; return; }
    var mode = params.mode || 'seq';
    var chapter = params.chapter || '';

    var pool = bank.questions.slice();
    if (chapter && chapter !== '__all') {
      pool = pool.filter(function (q) { return q.chapter === chapter; });
    }
    if (mode === 'wrong') {
      var wrong = store.wrongList(bank);
      pool = chapter && chapter !== '__all'
        ? wrong.filter(function (q) { return q.chapter === chapter; })
        : wrong;
    } else if (mode === 'random') {
      pool = shuffle(pool);
    }

    st = {
      key: key, bankId: bank.id, bank: bank, mode: mode, chapter: chapter,
      questions: pool, idx: 0,
      sel: {},        // qid → 当前选择
      graded: {},     // qid → true 已判分
      revealed: {},   // qid → true 已看答案
      selfOk: {},     // qid → 简答自评结果
      cardOpen: false,
      session: { correct: 0, wrong: 0, done: 0 }
    };
    if (mode === 'recite') pool.forEach(function (q) { st.revealed[q.id] = true; });
    // 错题重练时跳过已掌握的题
    setupProgress();
  };

  function setupProgress() {
    var recs = store.records(st.bankId);
    st.questions.forEach(function (q) {
      var r = recs[q.id];
      q._rec = r || null;
    });
  }
  function refreshRecs() {
    var recs = store.records(st.bankId);
    st.questions.forEach(function (q) { q._rec = recs[q.id] || null; });
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  practice.shuffle = shuffle;

  practice.active = function () { return !!st; };
  practice.state = function () { return st; };

  /* ---------- 渲染 ---------- */
  practice.render = function () {
    if (!st) return '<div class="empty">题库不存在</div>';
    if (!st.questions.length) {
      var msg = st.mode === 'wrong'
        ? '太棒了，当前没有需要重练的错题。'
        : '该范围内没有题目。';
      return '<div class="page-head"><h1>' + util.esc(MODES[st.mode].name) + '</h1>' +
        '<p>' + util.esc(st.bank.name) + '</p></div>' +
        '<div class="empty"><div class="e-ico">✓</div><div class="e-title">' + msg + '</div>' +
        '<div class="e-desc">可返回题库选择其他范围或模式</div>' +
        backBtnHtml(st.bankId) + '</div>';
    }
    var q = st.questions[st.idx];
    var total = st.questions.length;
    var done = st.session.done;   // 与「对/错」口径一致：本轮练习内的作答数

    var h = '';
    h += '<div class="run-head">';
    h += '<a class="btn sm ghost" href="#/bank/' + st.bankId + '">‹ 返回</a>';
    h += '<span class="run-title">' + util.esc(MODES[st.mode].name) + '</span>';
    h += '<span class="run-progress">' + (st.idx + 1) + ' / ' + total + '</span>';
    h += '<span class="spacer"></span>';
    h += '<span class="badge">已答 ' + done + '</span>';
    h += '<span class="badge green">对 ' + st.session.correct + '</span>';
    h += '<span class="badge red">错 ' + st.session.wrong + '</span>';
    h += '<button class="btn sm" data-act="p-card">答题卡</button>';
    h += '</div>';

    h += '<div class="bar" style="margin-bottom:14px"><i style="width:' + (total ? (st.idx + 1) / total * 100 : 0) + '%"></i></div>';

    if (st.cardOpen) h += renderCard();

    h += renderQuestion(q);
    return h;
  };

  function backBtnHtml(bankId) {
    return '<a class="btn" href="#/bank/' + bankId + '">返回题库</a>';
  }

  function countAnswered() {
    var n = 0;
    st.questions.forEach(function (q) { if (hasResp(q)) n++; });
    return n;
  }
  practice.countAnswered = countAnswered;

  function hasResp(q) {
    var r = q._rec;
    return !!(r && (r.c || r.w));
  }

  function renderCard() {
    var h = '<div class="card"><div class="card-title">答题卡<span class="spacer"></span>' +
      '<span class="small muted">点击可跳题</span></div><div class="card-grid">';
    st.questions.forEach(function (q, i) {
      var cls = 'card-cell';
      var r = q._rec;
      if (r && r.last === 1) cls += ' ok';
      else if (r && r.last === 0) cls += ' no';
      else if (r && (r.c || r.w)) cls += ' answered';
      if (i === st.idx) cls += ' cur';
      h += '<button class="' + cls + '" data-act="p-jump" data-idx="' + i + '">' + (i + 1) + '</button>';
    });
    h += '</div><div class="legend">' +
      '<span><i style="background:var(--green-weak);border:1px solid var(--green)"></i>答对</span>' +
      '<span><i style="background:var(--red-weak);border:1px solid var(--red)"></i>答错</span>' +
      '<span><i style="background:var(--primary-weak);border:1px solid var(--primary)"></i>当前</span>' +
      '</div></div>';
    return h;
  }

  function renderQuestion(q) {
    var graded = !!st.graded[q.id];
    var revealed = !!st.revealed[q.id];
    var sel = st.sel[q.id];
    var showAnswer = graded || revealed;

    var h = '<div class="card q-card">';
    h += '<div class="q-meta">';
    h += '<span class="badge primary">' + parser.typeName(q.type) + '</span>';
    if (q.chapter) h += '<span class="badge">' + util.esc(q.chapter) + '</span>';
    if (q.note) h += '<span class="badge amber">' + util.esc(q.note) + '</span>';
    h += '<span class="spacer"></span>';
    var faved = q._rec && q._rec.fav;
    h += '<button class="icon-btn" data-act="p-fav" title="收藏本题">' + (faved ? '★' : '☆') + '</button>';
    h += '</div>';

    h += '<div class="q-stem">' + q.stem + '</div>';

    /* 选项 / 输入区 */
    if (q.type === 'single' || q.type === 'multiple') {
      h += '<div class="opts">';
      q.options.forEach(function (o) {
        var cls = 'opt';
        var isSel = false;
        if (q.type === 'single') isSel = (sel === o.key);
        else isSel = !!(sel && sel.indexOf(o.key) >= 0);
        if (showAnswer) {
          var isAns = q.answer.indexOf(o.key) >= 0;
          if (isAns) cls += ' correct';
          else if (isSel) cls += ' wrong';
        } else if (isSel) cls += ' selected';
        h += '<button class="' + cls + '" data-act="p-opt" data-key="' + o.key + '"' + (showAnswer ? ' disabled' : '') + '>' +
          '<span class="opt-key">' + o.key + '</span><span class="opt-text">' + o.html + '</span></button>';
      });
      h += '</div>';
      if (q.type === 'multiple' && !showAnswer) {
        h += '<div class="small muted" style="margin-top:8px">多选题：可选择多个选项，选好后点「提交答案」</div>';
      }
    } else if (q.type === 'judge') {
      h += '<div class="judge-opts">';
      [[true, '正确', '✓'], [false, '错误', '✗']].forEach(function (pair) {
        var val = pair[0], label = pair[1], ico = pair[2];
        var cls = 'opt';
        var isSel = (sel === val);
        if (showAnswer) {
          var isAns = (q.answer === val);
          if (isAns) cls += ' correct';
          else if (isSel) cls += ' wrong';
        } else if (isSel) cls += ' selected';
        h += '<button class="' + cls + '" data-act="p-opt" data-val="' + val + '"' + (showAnswer ? ' disabled' : '') + '>' +
          '<span class="opt-key">' + ico + '</span><span class="opt-text">' + label + '</span></button>';
      });
      h += '</div>';
    } else if (q.type === 'blank') {
      h += '<div class="blank-input">';
      h += '<input type="text" data-act="p-input" placeholder="请输入答案" value="' + util.esc(sel || '') + '"' + (showAnswer ? ' disabled' : '') + '>';
      h += '</div>';
    } else if (q.type === 'short') {
      h += '<div class="blank-input">';
      h += '<textarea data-act="p-input" placeholder="请作答（可写下要点后对照参考答案自评）"' + (showAnswer ? ' disabled' : '') + '>' + util.esc(sel || '') + '</textarea>';
      h += '</div>';
    }

    /* 结果 / 答案区 */
    if (showAnswer) h += renderAnswerBox(q, graded);

    /* 操作按钮 */
    h += '<div class="run-actions">';
    if (st.idx > 0) h += '<button class="btn" data-act="p-prev">上一题</button>';
    if (!showAnswer) {
      if (q.type === 'single' || q.type === 'judge') {
        h += '<button class="btn primary" data-act="p-submit">提交答案</button>';
      } else {
        h += '<button class="btn primary" data-act="p-submit">提交答案</button>';
      }
      h += '<button class="btn ghost" data-act="p-reveal">看答案</button>';
    } else {
      if (st.idx < st.questions.length - 1) h += '<button class="btn primary" data-act="p-next">下一题</button>';
      else h += '<button class="btn primary" data-act="p-next">完成练习</button>';
    }
    h += '</div></div>';
    return h;
  }

  function renderAnswerBox(q, graded) {
    var ok = graded ? gradeOf(q) : null;
    var cls = 'result-box';
    if (ok === true) cls += ' ok';
    else if (ok === false) cls += ' no';

    var h = '<div class="' + cls + '">';
    if (ok === true) h += '<div class="rb-title">✓ 回答正确</div>';
    else if (ok === false) h += '<div class="rb-title">✗ 回答错误</div>';
    else h += '<div class="rb-title">参考答案</div>';

    h += '<div class="answer-line">正确答案：' + parser.answerText(q) + '</div>';

    if (graded && q.type !== 'short') {
      var mine = myAnswerText(q);
      h += '<div class="answer-line">你的作答：' + mine + '</div>';
    }

    if (q.type === 'short' && q.keywords && q.keywords.length) {
      var hits = parser.keywordHits(q, st.sel[q.id] || '');
      if (hits) {
        h += '<div class="answer-line">关键词命中：' + hits.map(function (x) {
          return '<span class="' + (x.hit ? 'kw-hit' : 'kw-miss') + '">' + util.esc(x.word) + (x.hit ? '✓' : '✗') + '</span>';
        }).join('　') + '</div>';
      }
    }

    if (q.analysis) h += '<div class="analysis">解析：' + q.analysis + '</div>';

    if (q.type === 'short' && !st.selfOk[q.id]) {
      h += '<div class="run-actions" style="margin-top:10px">' +
        '<button class="btn sm" data-act="p-self" data-ok="1">我答对了</button>' +
        '<button class="btn sm" data-act="p-self" data-ok="0">我答错了</button></div>';
    } else if (q.type === 'short' && st.selfOk[q.id]) {
      h += '<div class="small muted" style="margin-top:6px">自评结果已记录</div>';
    }
    h += '</div>';
    return h;
  }

  function myAnswerText(q) {
    var sel = st.sel[q.id];
    if (sel === undefined || sel === '' || sel === null) return '<span class="muted">（未作答）</span>';
    if (q.type === 'single' || q.type === 'multiple') {
      return String(sel).split('').map(function (k) { return util.esc(k); }).join('、');
    }
    if (q.type === 'judge') return '<b>' + (sel ? '正确' : '错误') + '</b>';
    return util.esc(String(sel));
  }

  function gradeOf(q) {
    if (q.type === 'short') return st.selfOk[q.id];
    if (!st.graded[q.id]) return null;
    return st.graded[q.id] === 'ok';
  }

  /* ---------- 交互 ---------- */
  practice.handle = function (act, el) {
    if (!st) return false;
    var q = st.questions[st.idx];

    switch (act) {
      case 'p-card':
        st.cardOpen = !st.cardOpen;
        A.app.render();
        return true;

      case 'p-jump':
        st.idx = parseInt(el.getAttribute('data-idx'), 10) || 0;
        st.cardOpen = false;
        A.app.render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return true;

      case 'p-prev':
        if (st.idx > 0) st.idx--;
        A.app.render();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return true;

      case 'p-next':
        if (st.idx < st.questions.length - 1) {
          st.idx++;
          A.app.render();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          finish();
        }
        return true;

      case 'p-fav': {
        var on = store.toggleFav(st.bankId, q.id);
        refreshRecs();
        util.toast(on ? '已收藏' : '已取消收藏');
        A.app.render();
        return true;
      }

      case 'p-opt': {
        if (st.graded[q.id] || st.revealed[q.id]) return true;
        var key = el.getAttribute('data-key');
        var val = el.getAttribute('data-val');
        if (val !== null) {           // 判断题
          st.sel[q.id] = (val === 'true');
          submit();
          return true;
        }
        if (q.type === 'single') {
          st.sel[q.id] = key;
          submit();                    // 单选点击即判分
          return true;
        }
        // 多选：切换
        var cur = st.sel[q.id] || '';
        var arr = cur.split('').filter(Boolean);
        var i = arr.indexOf(key);
        if (i >= 0) arr.splice(i, 1); else arr.push(key);
        arr.sort();
        st.sel[q.id] = arr.join('');
        A.app.render();
        return true;
      }

      case 'p-input': {
        st.sel[q.id] = el.value;
        return true;   // 不重渲染，避免输入框失焦
      }

      case 'p-submit':
        submit();
        return true;

      case 'p-reveal':
        st.revealed[q.id] = true;
        A.app.render();
        return true;

      case 'p-self': {
        var ok = el.getAttribute('data-ok') === '1';
        st.selfOk[q.id] = ok;
        st.graded[q.id] = ok ? 'ok' : 'no';
        store.recordAnswer(st.bankId, q.id, ok);
        if (ok) st.session.correct++; else st.session.wrong++;
        st.session.done++;
        refreshRecs();
        A.app.render();
        return true;
      }
    }
    return false;
  };

  function submit() {
    var q = st.questions[st.idx];
    if (st.graded[q.id] || st.revealed[q.id]) return;
    var sel = st.sel[q.id];
    if (sel === undefined || sel === '' || sel === null) {
      util.toast('请先作答', 'err');
      return;
    }
    var res = parser.grade(q, sel);
    if (res === null) {              // 简答题：展示参考答案，等待自评
      st.revealed[q.id] = true;
      refreshRecs();
      A.app.render();
      util.toast('请对照参考答案自评');
      return;
    }
    st.graded[q.id] = res ? 'ok' : 'no';
    store.recordAnswer(st.bankId, q.id, res);
    if (res) st.session.correct++; else st.session.wrong++;
    st.session.done++;
    refreshRecs();
    A.app.render();
    // 答对自动进入下一题（仅顺序/随机模式，给人一点反馈时间）
    if (res && (st.mode === 'seq' || st.mode === 'random') && st.idx < st.questions.length - 1) {
      var curQ = q;
      setTimeout(function () {
        if (st && st.questions[st.idx] === curQ && st.graded[curQ.id] === 'ok') {
          st.idx++;
          A.app.render();
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }, 900);
    }
  }

  function finish() {
    var s = st.session;
    var rate = s.done ? Math.round(s.correct / s.done * 100) : 0;
    util.modal({
      title: '本轮练习完成',
      html: '<div class="stat-grid" style="grid-template-columns:repeat(3,1fr)">' +
        '<div class="stat"><div class="num">' + s.done + '</div><div class="lbl">作答</div></div>' +
        '<div class="stat"><div class="num" style="color:var(--green)">' + s.correct + '</div><div class="lbl">正确</div></div>' +
        '<div class="stat"><div class="num" style="color:var(--red)">' + s.wrong + '</div><div class="lbl">错误</div></div>' +
        '</div><div class="small muted" style="margin-top:10px">正确率 ' + rate + '%，错题已自动进入错题本。</div>',
      okText: '返回题库',
      cancelText: '再练一轮',
      onOk: function () { location.hash = '#/bank/' + st.bankId; },
      onCancel: function () {
        var p = { bankId: st.bankId, mode: st.mode, chapter: st.chapter };
        st = null;
        practice.start(p);
        A.app.render();
        window.scrollTo({ top: 0 });
      }
    });
  }

  practice.reset = function () { st = null; };
  A.practice = practice;
})(window.App);
