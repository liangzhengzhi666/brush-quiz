/* ===== 路由与页面 ===== */
window.App = window.App || {};
(function (A) {
  'use strict';
  var util = A.util, store = A.store, parser = A.parser;
  var app = {};
  var view = { chapter: {}, search: {} };
  var curRoute = null;

  /* ---------- 路由解析 ---------- */
  function parseHash() {
    var raw = location.hash.replace(/^#/, '') || '/';
    var qs = '', qi = raw.indexOf('?');
    if (qi >= 0) { qs = raw.slice(qi + 1); raw = raw.slice(0, qi); }
    var parts = raw.split('/').filter(Boolean);
    var params = {};
    qs.split('&').filter(Boolean).forEach(function (kv) {
      var i = kv.indexOf('=');
      var k = i >= 0 ? kv.slice(0, i) : kv;
      var v = i >= 0 ? kv.slice(i + 1) : '';
      try { params[decodeURIComponent(k)] = decodeURIComponent(v); } catch (e) { params[k] = v; }
    });
    return { name: parts[0] || 'home', parts: parts, params: params };
  }

  /* ---------- 渲染 ---------- */
  function render() {
    var route = parseHash();
    curRoute = route;
    var root = document.getElementById('app');
    var html;

    try {
      html = viewFor(route);
    } catch (e) {
      console.error(e);
      html = '<div class="notice">页面渲染出错：' + util.esc(e.message || String(e)) + '</div>';
    }
    root.innerHTML = html;
    afterRender(route);
  }
  app.render = render;

  function viewFor(r) {
    switch (r.name) {
      case 'home': return renderHome();
      case 'bank': return renderBank(r.parts[1]);
      case 'practice': {
        A.practice.start({ bankId: r.parts[1], mode: r.params.mode || 'seq', chapter: r.params.chapter || '' });
        return A.practice.render();
      }
      case 'exam': A.exam.setup({ bankId: r.parts[1] }); return A.exam.renderSetup();
      case 'examrun': return A.exam.renderRun();
      case 'result': return A.exam.renderResult(r.parts[1]);
      case 'wrong': return renderWrong(r.parts[1]);
      case 'fav': return renderFav(r.parts[1]);
      case 'search': return renderSearch(r.parts[1]);
      case 'stats': return r.parts[1] ? A.stats.renderBank(r.parts[1]) : A.stats.renderGlobal();
      case 'data': return renderData();
      default: return '<div class="empty"><div class="e-ico">🧭</div><div class="e-title">页面不存在</div>' +
        '<a class="btn primary" href="#/">回到题库</a></div>';
    }
  }

  function afterRender(r) {
    // 导航高亮
    var navKey = r.name === 'home' ? 'home' : (r.name === 'data' ? 'data' : (r.name === 'stats' ? 'stats' : ''));
    Array.prototype.forEach.call(document.querySelectorAll('#topnav a'), function (a) {
      a.className = a.getAttribute('data-nav') === navKey ? 'active' : '';
    });

    // 考试计时器
    if (r.name === 'examrun' && A.exam.active()) A.exam.startTimer();
    else A.exam.stopTimer();

    // 拖拽导入
    var dz = document.getElementById('dropzone');
    if (dz) bindDropzone(dz);

    // 共享题库区（仅首页）
    if (r.name === 'home' && A.shared) A.shared.render();

    document.title = titleFor(r);
  }

  function titleFor(r) {
    var base = '刷题助手';
    if (r.name === 'bank') { var b = store.getBank(r.parts[1]); return (b ? b.name : '题库') + ' · ' + base; }
    if (r.name === 'practice') return A.practice.modeName(r.params.mode || 'seq') + ' · ' + base;
    if (r.name === 'exam' || r.name === 'examrun') return '模拟考试 · ' + base;
    if (r.name === 'stats') return '学习统计 · ' + base;
    return base;
  }

  /* ================= 首页：题库管理 ================= */
  function renderHome() {
    var banks = store.banks();
    var h = '';
    h += '<div class="page-head"><h1>我的题库</h1><p>导入课程题库文档，即可开始刷题</p></div>';

    /* 导入区 */
    h += '<div class="card">';
    h += '<div class="card-title">导入题库</div>';
    h += '<label class="dropzone" id="dropzone" for="fileInput">' +
      '<span class="dz-ico">📄</span>' +
      '<span class="dz-title">点击选择文件，或把文件拖到这里</span>' +
      '<span class="dz-desc">支持 .docx 与 .txt / .md，可一次选择多个文件</span>' +
      '</label>';
    h += '<input type="file" id="fileInput" accept=".txt,.md,.docx,.csv" multiple hidden>';
    h += '<div class="btn-row" style="margin-top:12px">' +
      '<button class="btn" data-act="home-paste">粘贴文本导入</button>' +
      '<button class="btn" data-act="home-sample">加载示例题库</button>' +
      '<button class="btn ghost" data-act="home-format">查看格式说明</button>' +
      '</div>';
    h += '</div>';

    /* 共享题库池（js/shared.js 异步填充） */
    h += '<div id="sharedSection" style="margin-top:14px"></div>';

    /* 题库列表 */
    if (!banks.length) {
      h += '<div class="empty"><div class="e-ico">📚</div><div class="e-title">还没有本地题库</div>' +
        '<div class="e-desc">可从上方「共享题库」一键加载，或导入自己的题库文件</div></div>';
      return h;
    }

    h += '<div class="card-title" style="margin:18px 0 10px">已导入 ' + banks.length + ' 个题库</div>';
    var lastBankId = store.getSetting('lastBank', '');
    banks.forEach(function (b) {
      var p = store.progress(b);
      h += '<div class="card tight">';
      h += '<div class="row" style="gap:8px">';
      h += '<a href="#/bank/' + b.id + '" style="font-weight:700;font-size:15.5px">' + util.esc(b.name) + '</a>';
      if (b.id === lastBankId) h += '<span class="badge primary">上次学习</span>';
      h += '<span class="spacer"></span><span class="small muted">' + p.total + ' 题</span>';
      h += '</div>';
      h += '<div class="bar' + (p.rate >= 80 && p.attempted ? ' green' : '') + '" style="margin:10px 0 6px"><i style="width:' + p.cover + '%"></i></div>';
      h += '<div class="small muted">已答 ' + p.attempted + '/' + p.total + ' · 正确率 ' + p.rate + '% · 错题 ' + p.wrong + ' · 收藏 ' + p.fav + '</div>';
      h += '<div class="btn-row" style="margin-top:10px">';
      h += '<a class="btn sm primary" href="#/bank/' + b.id + '">开始刷题</a>';
      h += '<a class="btn sm" href="#/stats/' + b.id + '">统计</a>';
      h += '<a class="btn sm" href="#/exam/' + b.id + '">模拟考试</a>';
      h += '<span class="spacer"></span>';
      h += '<button class="btn sm ghost" data-act="bank-rename" data-id="' + b.id + '">重命名</button>';
      h += '<button class="btn sm ghost" data-act="bank-export" data-id="' + b.id + '">导出</button>';
      h += '<button class="btn sm ghost" data-act="sh-export" data-id="' + b.id + '" title="导出为可发布到共享题库池的 JSON">导出共享包</button>';
      h += '<button class="btn sm danger" data-act="bank-del" data-id="' + b.id + '">删除</button>';
      h += '</div>';
      h += '</div>';
    });
    return h;
  }

  function bindDropzone(dz) {
    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.remove('over'); });
    });
    dz.addEventListener('drop', function (e) {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        importFiles(e.dataTransfer.files);
      }
    });
  }

  /* ================= 题库详情 ================= */
  function renderBank(bankId) {
    var bank = store.getBank(bankId);
    if (!bank) return '<div class="empty"><div class="e-ico">📕</div><div class="e-title">题库不存在或已被删除</div><a class="btn primary" href="#/">返回题库列表</a></div>';
    store.setSetting('lastBank', bank.id);

    var p = store.progress(bank);
    var chapters = store.chapterNames(bank);
    var sel = view.chapter[bank.id] || '__all';
    var qsuffix = sel && sel !== '__all' ? '&chapter=' + encodeURIComponent(sel) : '';

    var byType = {};
    bank.questions.forEach(function (q) { byType[q.type] = (byType[q.type] || 0) + 1; });

    var h = '';
    h += '<div class="page-head">';
    h += '<div class="row"><h1 style="margin:0">' + util.esc(bank.name) + '</h1><span class="spacer"></span>' +
      '<button class="btn sm ghost" data-act="bank-rename" data-id="' + bank.id + '">重命名</button></div>';
    h += '<p>共 ' + bank.questions.length + ' 题 · ' + chapters.length + ' 个章节' +
      (bank.source ? ' · 来源 ' + util.esc(bank.source) : '') + '</p>';
    h += '</div>';

    h += '<div class="stat-grid" style="margin-bottom:14px">' +
      '<div class="stat"><div class="num">' + p.total + '</div><div class="lbl">题目</div></div>' +
      '<div class="stat"><div class="num">' + p.cover + '%</div><div class="lbl">覆盖率</div></div>' +
      '<div class="stat"><div class="num" style="color:var(--green)">' + p.correct + '</div><div class="lbl">答对</div></div>' +
      '<div class="stat"><div class="num" style="color:var(--red)">' + p.wrong + '</div><div class="lbl">错题</div></div>' +
      '</div>';

    /* 章节筛选 */
    h += '<div class="card"><div class="field" style="margin:0"><label>练习范围</label>' +
      '<select data-act="chapter-pick" data-id="' + bank.id + '">' +
      '<option value="__all">全部章节（' + bank.questions.length + ' 题）</option>';
    chapters.forEach(function (c) {
      var n = bank.questions.filter(function (q) { return q.chapter === c; }).length;
      h += '<option value="' + util.esc(c) + '"' + (sel === c ? ' selected' : '') + '>' + util.esc(c) + '（' + n + ' 题）</option>';
    });
    h += '</select></div></div>';

    /* 模式选择 */
    h += '<div class="mode-grid" style="margin-bottom:14px">';
    h += modeCard('seq', bank.id, qsuffix, A.practice.MODES.seq);
    h += modeCard('random', bank.id, qsuffix, A.practice.MODES.random);
    h += modeCard('recite', bank.id, qsuffix, A.practice.MODES.recite);
    h += modeCard('wrong', bank.id, qsuffix, {
      name: '错题重练', ico: '✗',
      desc: p.wrong ? ('当前有 ' + p.wrong + ' 道错题待重练') : '暂无错题，做得不错'
    });
    h += '</div>';

    /* 其他入口 */
    h += '<div class="card"><div class="card-title">更多功能</div><div class="btn-row">';
    h += '<a class="btn" href="#/exam/' + bank.id + '">模拟考试</a>';
    h += '<a class="btn" href="#/wrong/' + bank.id + '">错题本' + (p.wrong ? '（' + p.wrong + '）' : '') + '</a>';
    h += '<a class="btn" href="#/fav/' + bank.id + '">收藏' + (p.fav ? '（' + p.fav + '）' : '') + '</a>';
    h += '<a class="btn" href="#/search/' + bank.id + '">搜索题目</a>';
    h += '<a class="btn" href="#/stats/' + bank.id + '">学习统计</a>';
    h += '<button class="btn" data-act="bank-export" data-id="' + bank.id + '">导出题库</button>';
    h += '<button class="btn danger" data-act="bank-del" data-id="' + bank.id + '">删除题库</button>';
    h += '</div>';

    h += '<div class="row" style="margin-top:12px;gap:6px">';
    Object.keys(byType).forEach(function (t) {
      h += '<span class="badge primary">' + parser.typeName(t) + ' ' + byType[t] + '</span>';
    });
    h += '</div></div>';

    /* 最近成绩 */
    var exams = store.exams().filter(function (e) { return e.bankId === bank.id; });
    if (exams.length) {
      h += '<div class="card"><div class="card-title">最近考试</div>';
      exams.slice(0, 3).forEach(function (e) {
        h += '<div class="list-item" style="margin-bottom:8px"><div class="li-main">' +
          '<div class="li-title">' + e.score + ' 分 <span class="badge ' + (e.score >= 60 ? 'green' : 'red') + '">' + (e.score >= 60 ? '合格' : '未合格') + '</span></div>' +
          '<div class="li-sub">' + util.fmtDate(e.date) + ' · ' + e.correct + '/' + e.scoreable + '</div></div>' +
          '<a class="btn sm" href="#/result/' + e.id + '">查看</a></div>';
      });
      h += '</div>';
    }
    return h;
  }

  function modeCard(mode, bankId, qsuffix, info) {
    return '<a class="mode-card" href="#/practice/' + bankId + '?mode=' + mode + qsuffix + '">' +
      '<div class="mc-ico">' + info.ico + '</div>' +
      '<div class="mc-name">' + util.esc(info.name) + '</div>' +
      '<div class="mc-desc">' + util.esc(info.desc) + '</div></a>';
  }

  /* ================= 错题本 / 收藏 / 搜索 ================= */
  function qPreview(q, extraActions) {
    var h = '<div class="q-preview">';
    h += '<div class="row" style="gap:6px;margin-bottom:6px">' +
      '<span class="badge primary">' + parser.typeName(q.type) + '</span>' +
      (q.chapter ? '<span class="badge">' + util.esc(q.chapter) + '</span>' : '') +
      '</div>';
    h += '<div class="qp-stem">' + q.stem + '</div>';
    if (q.type === 'single' || q.type === 'multiple') {
      q.options.forEach(function (o) {
        var isAns = q.answer.indexOf(o.key) >= 0;
        h += '<div class="small" style="' + (isAns ? 'color:var(--green);font-weight:600' : 'color:var(--muted)') + '">' +
          o.key + '、 ' + o.html + (isAns ? ' ✓' : '') + '</div>';
      });
    }
    h += '<div class="qp-ans">正确答案：' + parser.answerText(q) + '</div>';
    if (q.analysis) h += '<div class="small muted" style="margin-top:4px">解析：' + q.analysis + '</div>';
    if (extraActions) h += '<div class="btn-row" style="margin-top:8px">' + extraActions + '</div>';
    h += '</div>';
    return h;
  }

  function renderWrong(bankId) {
    var bank = store.getBank(bankId);
    if (!bank) return '<div class="empty">题库不存在</div>';
    var list = store.wrongList(bank);
    var h = '<div class="page-head"><h1>错题本</h1><p>' + util.esc(bank.name) + ' · 共 ' + list.length + ' 道待重练错题</p></div>';
    h += '<div class="btn-row" style="margin-bottom:14px">' +
      '<a class="btn primary" href="#/practice/' + bank.id + '?mode=wrong">开始重练</a>' +
      '<a class="btn" href="#/bank/' + bank.id + '">返回题库</a></div>';

    if (!list.length) {
      return h + '<div class="empty"><div class="e-ico">🎉</div><div class="e-title">没有待重练的错题</div>' +
        '<div class="e-desc">答错的题会自动出现在这里</div></div>';
    }
    h += '<div class="card">';
    list.forEach(function (q) {
      var actions = '<button class="btn sm" data-act="w-ok" data-bank="' + bank.id + '" data-qid="' + q.id + '">标记已掌握</button>' +
        '<button class="btn sm ghost" data-act="w-fav" data-bank="' + bank.id + '" data-qid="' + q.id + '">收藏</button>';
      h += qPreview(q, actions);
    });
    h += '</div>';
    return h;
  }

  function renderFav(bankId) {
    var bank = store.getBank(bankId);
    if (!bank) return '<div class="empty">题库不存在</div>';
    var list = store.favList(bank);
    var h = '<div class="page-head"><h1>我的收藏</h1><p>' + util.esc(bank.name) + ' · 共 ' + list.length + ' 道收藏题</p></div>';
    h += '<div class="btn-row" style="margin-bottom:14px"><a class="btn" href="#/bank/' + bank.id + '">返回题库</a></div>';
    if (!list.length) {
      return h + '<div class="empty"><div class="e-ico">☆</div><div class="e-title">还没有收藏题目</div>' +
        '<div class="e-desc">刷题时点击右上角星标即可收藏</div></div>';
    }
    h += '<div class="card">';
    list.forEach(function (q) {
      h += qPreview(q, '<button class="btn sm danger" data-act="w-unfav" data-bank="' + bank.id + '" data-qid="' + q.id + '">取消收藏</button>');
    });
    h += '</div>';
    return h;
  }

  function renderSearch(bankId) {
    var bank = store.getBank(bankId);
    if (!bank) return '<div class="empty">题库不存在</div>';
    var term = view.search[bankId] || '';
    var h = '<div class="page-head"><h1>搜索题目</h1><p>' + util.esc(bank.name) + ' · 共 ' + bank.questions.length + ' 题</p></div>';
    h += '<div class="card"><input type="text" id="searchInput" data-act="search-input" data-bank="' + bank.id + '" placeholder="输入关键词搜索题干、选项或答案" value="' + util.esc(term) + '"></div>';
    h += '<div id="searchResults">' + searchResultsHtml(bank, term) + '</div>';
    return h;
  }

  function searchResultsHtml(bank, term) {
    if (!term) return '<div class="muted small" style="padding:8px 2px">输入关键词开始搜索</div>';
    var t = util.normSpace(term).toLowerCase();
    var hit = bank.questions.filter(function (q) {
      var hay = [util.plain(q.stem)].concat(q.options.map(function (o) { return util.plain(o.html); }))
        .concat([parser.answerPlain(q), util.plain(q.analysis || '')]).join(' ').toLowerCase();
      return hay.indexOf(t) >= 0;
    });
    if (!hit.length) return '<div class="empty"><div class="e-ico">🔍</div><div class="e-title">没有找到匹配的题目</div></div>';
    var h = '<div class="card"><div class="small muted" style="margin-bottom:6px">找到 ' + hit.length + ' 道题目</div>';
    hit.slice(0, 60).forEach(function (q) {
      h += qPreview(q, '<button class="btn sm" data-act="w-fav" data-bank="' + bank.id + '" data-qid="' + q.id + '">收藏</button>');
    });
    if (hit.length > 60) h += '<div class="small muted">仅显示前 60 条结果</div>';
    h += '</div>';
    return h;
  }

  /* ================= 数据管理 ================= */
  function renderData() {
    var d = store.data();
    var banks = store.banks();
    var used = store.usage();
    var recCount = 0;
    Object.keys(d.records).forEach(function (k) { recCount += Object.keys(d.records[k] || {}).length; });

    var h = '';
    h += '<div class="page-head"><h1>数据管理</h1><p>学习数据保存在本机浏览器中，可导出备份或迁移到其他设备</p></div>';

    h += '<div class="stat-grid" style="margin-bottom:14px">' +
      '<div class="stat"><div class="num">' + banks.length + '</div><div class="lbl">题库</div></div>' +
      '<div class="stat"><div class="num">' + recCount + '</div><div class="lbl">答题记录</div></div>' +
      '<div class="stat"><div class="num">' + d.exams.length + '</div><div class="lbl">考试记录</div></div>' +
      '<div class="stat"><div class="num">' + util.bytes(used) + '</div><div class="lbl">占用空间</div></div>' +
      '</div>';

    h += '<div class="card"><div class="card-title">导出备份</div>';
    h += '<div class="small muted" style="margin-bottom:10px">导出包含全部题库、答题记录与考试成绩的 JSON 文件。换设备时在本页导入即可恢复。</div>';
    h += '<div class="btn-row"><button class="btn primary" data-act="data-export">导出全部数据</button></div>';
    h += '</div>';

    h += '<div class="card"><div class="card-title">导入备份</div>';
    h += '<div class="small muted" style="margin-bottom:10px">选择之前导出的 JSON 文件，可选择与现有数据合并或完全覆盖。</div>';
    h += '<input type="file" id="dataFile" accept=".json" hidden>';
    h += '<div class="btn-row">' +
      '<button class="btn" data-act="data-import-pick">选择备份文件</button>' +
      '<button class="btn ghost" data-act="data-import-paste">粘贴 JSON 导入</button>' +
      '</div></div>';

    h += '<div class="card"><div class="card-title">危险操作</div>';
    h += '<div class="small muted" style="margin-bottom:10px">清空后所有题库与记录将从本机删除，且无法恢复（建议先导出备份）。</div>';
    h += '<div class="btn-row"><button class="btn danger" data-act="data-clear">清空全部数据</button></div>';
    h += '</div>';

    h += '<div class="notice">提示：浏览器"清除浏览数据"会同时清除这里的数据。重要进度请定期导出备份。</div>';
    return h;
  }

  /* ================= 导入流程 ================= */
  function stripExt(name) { return String(name).replace(/\.[^.]+$/, ''); }

  function importFiles(files) {
    var arr = Array.prototype.slice.call(files);
    if (!arr.length) return;
    util.toast('正在解析 ' + arr.length + ' 个文件…');
    var reports = [];
    var left = arr.length;
    arr.forEach(function (f) {
      A.parser.parseFile(f).then(function (res) {
        reports.push({ file: f.name, res: res });
      }).catch(function (err) {
        reports.push({ file: f.name, error: err && err.message ? err.message : String(err) });
      }).then(function () {
        left--;
        if (left === 0) finalizeImport(reports);
      });
    });
  }

  function finalizeImport(reports) {
    var added = [], failed = [];
    reports.forEach(function (r) {
      if (r.error) { failed.push(r); return; }
      var qs = r.res.questions || [];
      if (!qs.length) { failed.push({ file: r.file, error: '没有解析出任何题目，请检查文件格式' }); return; }
      var bank = {
        id: util.uid('bk'),
        name: stripExt(r.file),
        createdAt: Date.now(),
        source: r.file,
        questions: qs
      };
      store.addBank(bank);
      added.push({ bank: bank, report: r.res.report });
    });

    if (!added.length && failed.length) {
      util.modal({
        title: '导入失败',
        html: failed.map(function (f) { return '<div class="small">• ' + util.esc(f.file) + '：' + util.esc(f.error) + '</div>'; }).join(''),
        cancelText: null, okText: '知道了'
      });
      return;
    }

    var h = '';
    added.forEach(function (a) {
      var rep = a.report;
      h += '<div style="margin-bottom:14px">';
      h += '<div style="font-weight:700;margin-bottom:6px">✓ ' + util.esc(a.bank.name) + '</div>';
      h += '<div class="small">成功解析 <b>' + rep.total + '</b> 道题目</div>';
      h += '<div class="row" style="gap:6px;margin:8px 0">';
      Object.keys(rep.byType).forEach(function (t) {
        h += '<span class="badge primary">' + parser.typeName(t) + ' ' + rep.byType[t] + '</span>';
      });
      h += '</div>';
      var chs = Object.keys(rep.chapterMap).length;
      h += '<div class="small muted">章节数：' + chs + '</div>';
      if (rep.notes) h += '<div class="small muted">含备注说明的题目：' + rep.notes + ' 道</div>';
      if (rep.invalid && rep.invalid.length) {
        h += '<div class="small" style="color:var(--amber);margin-top:6px">有 ' + rep.invalid.length + ' 道题未能解析，已跳过：</div>';
        h += '<div class="small muted">' + rep.invalid.slice(0, 8).map(function (x) {
          return '• ' + util.esc((x.num ? '第' + x.num + '题 ' : '') + (x.stem || '') + ' —— ' + x.reason);
        }).join('<br>') + (rep.invalid.length > 8 ? '<br>…' : '') + '</div>';
      }
      h += '</div>';
    });
    if (failed.length) {
      h += '<div class="notice">' + failed.length + ' 个文件未能导入：' +
        failed.map(function (f) { return util.esc(f.file) + '（' + util.esc(f.error) + '）'; }).join('、') + '</div>';
    }

    util.modal({
      title: '导入完成',
      html: h,
      cancelText: null,
      okText: added.length === 1 ? '开始刷题' : '查看题库',
      onOk: function () {
        if (added.length === 1) location.hash = '#/bank/' + added[0].bank.id;
        else render();
      }
    });
    render();
  }

  function importFromText(text, name) {
    var res = A.parser.parseText(text, { source: name || '粘贴导入' });
    if (!res.questions.length) { util.toast('没有解析出题目，请检查格式', 'err'); return; }
    var bank = {
      id: util.uid('bk'), name: name || '粘贴导入题库',
      createdAt: Date.now(), source: name || '', questions: res.questions
    };
    store.addBank(bank);
    util.modal({
      title: '导入完成',
      html: '<div class="small">成功解析 <b>' + res.report.total + '</b> 道题目' +
        (res.report.invalid.length ? '，跳过 ' + res.report.invalid.length + ' 道无法识别的题目' : '') + '</div>',
      cancelText: null, okText: '开始刷题',
      onOk: function () { location.hash = '#/bank/' + bank.id; }
    });
    render();
  }

  /* ================= 交互事件 ================= */
  document.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (act === 'p-input' || act === 'e-input' || act === 'search-input') return;   // 输入框由 input 事件处理

    // 做题 / 考试
    if (act.indexOf('p-') === 0) { A.practice.handle(act, el); return; }
    if (act.indexOf('sh-') === 0) { A.shared.handle(act, el); return; }
    if (act.indexOf('e-') === 0) {
      if (curRoute && curRoute.name === 'examrun') A.exam.handleRun(act, el);
      else A.exam.handleSetup(act, el);
      return;
    }
    if (act.indexOf('r-') === 0) { A.exam.handleResult(act, el); return; }

    switch (act) {
      /* 导入 */
      case 'home-paste': openPasteImport(); break;
      case 'home-sample': importFromText(A.SAMPLE_TEXT, '示例题库'); break;
      case 'home-format': showFormat(); break;

      /* 题库操作 */
      case 'bank-rename': {
        var b = store.getBank(el.getAttribute('data-id'));
        if (!b) break;
        util.modal({
          title: '重命名题库',
          html: '<input type="text" id="renameInput" value="' + util.esc(b.name) + '">',
          okText: '保存',
          onOk: function (mask) {
            var v = util.normSpace(mask.querySelector('#renameInput').value);
            if (!v) { util.toast('名称不能为空', 'err'); return false; }
            store.renameBank(b.id, v);
            util.toast('已重命名');
            render();
          }
        });
        break;
      }
      case 'bank-del': {
        var bd = store.getBank(el.getAttribute('data-id'));
        if (!bd) break;
        util.confirm('删除题库', '将删除「' + bd.name + '」及其全部答题记录，此操作不可恢复。', function () {
          store.deleteBank(bd.id);
          util.toast('已删除题库');
          location.hash = '#/';
          render();
        }, { danger: true, okText: '确认删除' });
        break;
      }
      case 'bank-export': {
        var be = store.getBank(el.getAttribute('data-id'));
        if (!be) break;
        util.download(be.name + '（含记录）.json', store.exportBank(be.id));
        util.toast('已导出题库');
        break;
      }
      case 'bank-clear': {
        var bc = store.getBank(el.getAttribute('data-id'));
        if (!bc) break;
        util.confirm('清空答题记录', '将清空「' + bc.name + '」的答题记录、错题与收藏，题库题目保留。', function () {
          store.clearRecords(bc.id);
          A.practice.reset();
          util.toast('已清空记录');
          render();
        }, { danger: true, okText: '确认清空' });
        break;
      }

      /* 错题 / 收藏 */
      case 'w-ok': {
        store.setMastered(el.getAttribute('data-bank'), el.getAttribute('data-qid'), true);
        util.toast('已标记为掌握，不再出现在错题本');
        render();
        break;
      }
      case 'w-fav': {
        store.setFav(el.getAttribute('data-bank'), el.getAttribute('data-qid'), true);
        util.toast('已收藏');
        render();
        break;
      }
      case 'w-unfav': {
        store.setFav(el.getAttribute('data-bank'), el.getAttribute('data-qid'), false);
        util.toast('已取消收藏');
        render();
        break;
      }

      /* 数据管理 */
      case 'data-export': {
        util.download('刷题助手备份-' + new Date().toISOString().slice(0, 10) + '.json', store.exportAll());
        util.toast('已导出备份文件');
        break;
      }
      case 'data-import-pick': {
        var f = document.getElementById('dataFile');
        if (f) f.click();
        break;
      }
      case 'data-import-paste': {
        util.modal({
          title: '粘贴 JSON 导入',
          wide: true,
          html: '<textarea id="jsonPaste" style="min-height:180px" placeholder="在此粘贴备份文件的内容"></textarea>',
          okText: '下一步',
          onOk: function (mask) {
            var txt = mask.querySelector('#jsonPaste').value;
            if (!util.normSpace(txt)) { util.toast('内容为空', 'err'); return false; }
            askImportMode(txt);
          }
        });
        break;
      }
      case 'data-clear': {
        util.confirm('清空全部数据', '所有题库、答题记录与考试成绩都会被删除，且无法恢复。确定继续吗？', function () {
          util.confirm('再次确认', '这是最后一次确认，删除后无法找回。', function () {
            store.clearAll();
            A.practice.reset();
            A.exam.quit();
            util.toast('已清空全部数据');
            location.hash = '#/';
            render();
          }, { danger: true, okText: '确认清空' });
        }, { danger: true, okText: '继续' });
        break;
      }
    }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    /* 文件选择框（无 data-act，先于通用分发处理） */
    if (t && t.id === 'fileInput' && t.files && t.files.length) {
      importFiles(t.files);
      t.value = '';
      return;
    }
    if (t && t.id === 'dataFile' && t.files && t.files.length) {
      var df = t.files[0];
      util.readAsText(df).then(function (txt) { askImportMode(txt, df.name); })
        .catch(function (err) { util.toast('读取失败：' + err.message, 'err'); });
      t.value = '';
      return;
    }

    var el = t.closest ? t.closest('[data-act]') : null;
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (act === 'chapter-pick') {
      view.chapter[el.getAttribute('data-id')] = el.value;
      render();
      return;
    }
    if (act === 'e-cfg' || act === 'e-cfg-type') {
      if (curRoute && curRoute.name === 'exam') A.exam.handleSetup(act, el);
      return;
    }
  });

  document.addEventListener('input', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    var act = el.getAttribute('data-act');
    if (act === 'p-input') { A.practice.handle('p-input', el); return; }
    if (act === 'e-input') { A.exam.handleRun('e-input', el); return; }
    if (act === 'e-cfg') {   // 数字配置项：input 事件即更新，避免部分场景下 change 不触发
      if (curRoute && curRoute.name === 'exam') A.exam.handleSetup('e-cfg', el);
      return;
    }
    if (act === 'search-input') {
      var bankId = el.getAttribute('data-bank');
      view.search[bankId] = el.value;
      var box = document.getElementById('searchResults');
      var bank = store.getBank(bankId);
      if (box && bank) box.innerHTML = searchResultsHtml(bank, el.value);
      return;
    }
  });

  /* 键盘快捷键（做题时） */
  document.addEventListener('keydown', function (e) {
    if (!curRoute) return;
    var tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      if (e.key === 'Enter' && tag !== 'textarea' && curRoute.name === 'practice') {
        e.preventDefault();
        var st = A.practice.state();
        if (st) A.practice.handle('p-submit', document.body);
      }
      return;
    }
    if (curRoute.name !== 'practice') return;
    var st = A.practice.state();
    if (!st) return;
    if (e.key === 'ArrowLeft') { A.practice.handle('p-prev', document.body); }
    else if (e.key === 'ArrowRight') { A.practice.handle('p-next', document.body); }
    else if (/^[a-hA-H1-8]$/.test(e.key)) {
      var idx = /[0-9]/.test(e.key) ? (parseInt(e.key, 10) - 1) : (e.key.toUpperCase().charCodeAt(0) - 65);
      var q = st.questions[st.idx];
      if (!q) return;
      var key = String.fromCharCode(65 + idx);
      var fake = document.createElement('button');
      if (q.type === 'judge') {
        if (idx === 0 || idx === 1) { fake.setAttribute('data-act', 'p-opt'); fake.setAttribute('data-val', idx === 0 ? 'true' : 'false'); A.practice.handle('p-opt', fake); }
      } else if (q.options.some(function (o) { return o.key === key; })) {
        fake.setAttribute('data-act', 'p-opt'); fake.setAttribute('data-key', key);
        A.practice.handle('p-opt', fake);
      }
    }
  });

  /* ---------- 小弹窗 ---------- */
  function openPasteImport() {
    util.modal({
      title: '粘贴文本导入',
      wide: true,
      html: '<div class="field"><label>题库名称</label><input type="text" id="pasteName" placeholder="例如：新中国史章节测验"></div>' +
        '<div class="field" style="margin:0"><label>题库内容</label>' +
        '<textarea id="pasteText" style="min-height:200px" placeholder="把题库文字粘贴到这里，格式与 txt 文件一致"></textarea></div>',
      okText: '导入',
      onOk: function (mask) {
        var txt = mask.querySelector('#pasteText').value;
        var nm = util.normSpace(mask.querySelector('#pasteName').value) || '粘贴导入题库';
        if (!util.normSpace(txt)) { util.toast('内容为空', 'err'); return false; }
        importFromText(txt, nm);
        return true;
      }
    });
  }

  function showFormat() {
    var fmt = [
      '【章节：第一章 概述】        ← 章节标记（也支持「第一章 xxx」「1.1 xxx」）',
      '',
      '1. 【单选题】题干文字……',
      'A、 选项一',
      'B、 选项二',
      'C、 选项三',
      'D、 选项四',
      '正确答案：B                ← 也支持「答案：」「标准答案：」',
      '解析：可选，可省略',
      '',
      '【多选题】题干……',
      'A、 ……  B、 ……  C、 ……',
      '答案：ABC                  ← 顺序不敏感，ABC 与 CBA 等价',
      '',
      '【判断题】题干……',
      '答案：正确                 ← 支持 正确/对/√/T 与 错误/错/×/F',
      '',
      '【填空题】题干中的空位用 ____ 表示',
      '答案：写法一|写法二         ← 多个等价写法用 | 分隔，命中任一即算对',
      '',
      '【简答题】题干……',
      '答案：参考答案全文',
      '关键词：关键词1、关键词2    ← 可选，作答后显示命中情况',
      '',
      '容错说明：全角/半角冒号等价；答案前后空格忽略；',
      '字母不区分大小写；选项标记支持 A、 A. A) A：'
    ].join('\n');
    util.modal({
      title: '题库格式说明',
      wide: true,
      html: '<pre class="fmt">' + util.esc(fmt) + '</pre>',
      cancelText: null, okText: '知道了'
    });
  }

  function askImportMode(jsonText, fileName) {
    util.modal({
      title: '导入方式',
      html: '<div class="small">文件' + (fileName ? '「' + util.esc(fileName) + '」' : '') + '中包含题库与学习记录，请选择导入方式：</div>' +
        '<div class="btn-row" style="margin-top:10px;flex-direction:column;gap:8px">' +
        '<button class="btn primary block" data-im="merge">合并导入（保留现有数据，补充缺失内容）</button>' +
        '<button class="btn danger block" data-im="replace">覆盖导入（清空现有数据后导入）</button>' +
        '</div>',
      cancelText: '取消',
      okText: null,
      onMount: function (mask, close) {
        Array.prototype.forEach.call(mask.querySelectorAll('[data-im]'), function (btn) {
          btn.addEventListener('click', function () {
            var mode = btn.getAttribute('data-im');
            close();
            try {
              var r = store.importAll(jsonText, mode);
              util.toast('导入完成' + (r.banks ? '，新增 ' + r.banks + ' 个题库' : ''));
            } catch (err) {
              util.toast('导入失败：' + err.message, 'err');
            }
            A.practice.reset();
            render();
          });
        });
      }
    });
  }

  /* ---------- 主题 ---------- */
  function applyTheme(t) {
    document.documentElement.setAttribute('data-theme', t);
    store.setSetting('theme', t);
  }

  function initTheme() {
    var t = store.getSetting('theme', '');
    if (!t) {
      t = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
    }
    applyTheme(t);
    var btn = document.getElementById('themeBtn');
    if (btn) {
      btn.addEventListener('click', function () {
        var nt = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
        applyTheme(nt);
        var btn2 = document.getElementById('themeBtn');
        if (btn2) btn2.textContent = nt === 'dark' ? '☀' : '◐';
      });
      btn.textContent = t === 'dark' ? '☀' : '◐';
    }
  }

  /* ---------- 启动 ---------- */
  function start() {
    store.load();
    initTheme();
    window.addEventListener('hashchange', render);
    if (!location.hash) location.hash = '#/';
    render();
  }

  app.init = start;
  A.app = app;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})(window.App);
