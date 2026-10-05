/* ===== 题库解析：txt / docx → 统一题库结构 =====
 *
 * 支持格式（详见 README）：
 *   【章节：第一章 xxx】 或 第一章 xxx / 1.1 xxx      → 章节归属
 *   1. 【单选题】题干 / A、选项 / 正确答案：D
 *   题型：单选、多选、判断、填空、简答
 */
window.App = window.App || {};
(function (A) {
  'use strict';
  var util = A.util;
  var parser = {};

  /* ---------- 题型 ---------- */
  var TYPE_NAME = {
    single: '单选题', multiple: '多选题', judge: '判断题',
    blank: '填空题', short: '简答题'
  };
  parser.typeName = function (t) { return TYPE_NAME[t] || '未知题型'; };

  function resolveType(name) {
    var n = util.normSpace(name).replace(/[【】\[\]]/g, '');
    if (!n) return null;
    if (/^单选/.test(n)) return 'single';
    if (/^多选/.test(n) || /不定项/.test(n) || /^复选/.test(n)) return 'multiple';
    if (/^判断/.test(n)) return 'judge';
    if (/^填空/.test(n)) return 'blank';
    if (/^简答/.test(n) || /问答/.test(n) || /论述/.test(n) || /名词解释/.test(n)) return 'short';
    return null;
  }

  /* ---------- 行级正则（作用于纯文本） ---------- */
  var RE_CHAPTER_MARK = /^\s*[【\[]\s*章节\s*[:：]?\s*([^】\]]*?)\s*[】\]]\s*(.*)$/;
  var RE_QNUM_TYPE   = /^\s*\d{1,4}\s*[\.．、\)）]\s*[【\[]\s*([^】\]]{1,12}?)\s*[】\]]\s*/;
  var RE_TYPE_ONLY   = /^\s*[【\[]\s*([^】\]]{1,12}?)\s*[】\]]\s*/;
  var RE_OPTION      = /^\s*([A-Ha-h])\s*[\.．、,，:：\)）]\s*/;
  var RE_ANSWER      = /^\s*[【\[]?\s*(正确答案|标准答案|参考答案|答案)\s*[】\]]?\s*[:：]\s*/;
  var RE_KEYWORDS    = /^\s*[【\[]?\s*(关键词|关键字|考点|考察点|评分点)\s*[】\]]?\s*[:：]\s*/;
  var RE_ANALYSIS    = /^\s*[【\[]?\s*(答案解析|试题解析|解析|解答|分析)\s*[】\]]?\s*[:：]\s*/;
  var RE_SECTION_NUM = /^\s*(\d{1,3})\s*[\.．]\s*(\d{1,3})\s*[、\.．:：]?\s*(.*)$/;
  var RE_CHAPTER_CN  = /^\s*第\s*([一二三四五六七八九十百千零〇\d]{1,6})\s*章\s*[、\.．:：]?\s*(.*)$/;
  var RE_SECTION_CN  = /^\s*第\s*([一二三四五六七八九十百千零〇\d]{1,6})\s*节\s*[、\.．:：]?\s*(.*)$/;
  var RE_SCORE_TAIL  = /[（(]\s*本次成绩\s*[:：][^)）]*[)）]\s*$/;
  var RE_NOTE_TAIL   = /[（(]\s*(参考答案[^)）]*|请自行核对[^)）]*|平台未显示[^)）]*)\s*[)）]/g;

  var UNCHAPTERED = '未分章';

  /* ---------- 行准备 ---------- */
  function linesFromText(text) {
    return String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n').map(function (raw) {
      return { text: raw, plain: util.normSpace(raw), rich: false };
    });
  }

  function linesFromHtml(html) {
    var doc;
    try {
      doc = new DOMParser().parseFromString('<div id="__root">' + html + '</div>', 'text/html');
    } catch (e) { return []; }
    var root = doc.getElementById('__root');
    if (!root) return [];
    var out = [];

    function add(rawHtml) {
      var safe = util.sanitize(rawHtml || '').trim();
      var p = util.normSpace(util.plain(safe));
      if (!p && !/<img/i.test(safe)) return;
      out.push({ text: safe, plain: p, rich: true });
    }

    Array.prototype.forEach.call(root.children, function (el) {
      var tag = el.tagName.toLowerCase();
      if (tag === 'ul' || tag === 'ol') {
        Array.prototype.forEach.call(el.children, function (li) { add(li.innerHTML); });
        return;
      }
      if (tag === 'table') {
        Array.prototype.forEach.call(el.querySelectorAll('tr'), function (tr) {
          var cells = Array.prototype.map.call(tr.children, function (td) { return td.innerHTML || ''; });
          add(cells.join(' '));
        });
        return;
      }
      add(el.innerHTML);
    });
    return out;
  }

  /* 依前缀正则取出内容（保留富文本），无匹配返回 null */
  function contentOf(line, prefixRe) {
    var pm = prefixRe.exec(line.plain);
    if (!pm) return null;
    var m = prefixRe.exec(line.text);
    var raw = m ? line.text.slice(m[0].length) : line.plain.slice(pm[0].length);
    raw = raw.trim();
    return line.rich ? util.sanitize(raw) : util.esc(raw);
  }

  /* ---------- 答案归一化 ---------- */
  function lettersOf(str) {
    var s = util.toHalf(util.plain(str)).toUpperCase();
    var m = s.match(/[A-H]/g);
    return m || [];
  }

  function uniqSortedLetters(str) {
    var seen = {}, out = [];
    lettersOf(str).forEach(function (c) { if (!seen[c]) { seen[c] = 1; out.push(c); } });
    return out.sort().join('');
  }

  function normJudge(str) {
    var s = util.normSpace(util.toHalf(util.plain(str)))
      .replace(RE_NOTE_TAIL, '')
      .replace(/[（(][^）)]*[）)]/g, '')
      .replace(/[，,。;；\.].*$/, '')
      .trim().toUpperCase();
    if (!s) return null;
    if (/^(对|正确|是|√|✓|T|TRUE|Y|YES|1)$/.test(s)) return true;
    if (/^(错|错误|否|×|✗|X|F|FALSE|N|NO|0)$/.test(s)) return false;
    if (s.indexOf('正确') >= 0 || s.indexOf('√') >= 0) return true;
    if (s.indexOf('错误') >= 0 || s.indexOf('×') >= 0) return false;
    return null;
  }

  function splitVariants(str) {
    var s = util.normSpace(util.plain(str));
    return s.split(/[|｜]/).map(function (x) { return util.normSpace(x); }).filter(Boolean);
  }

  function normKeywords(str) {
    var s = util.normSpace(util.plain(str));
    return s.split(/[、,，;；|｜\/]+/).map(function (x) { return util.normSpace(x); }).filter(Boolean);
  }

  function normBlank(s) {
    return util.toHalf(util.normSpace(util.plain(s))).toLowerCase();
  }

  /* ---------- 题目组装 ---------- */
  function finalize(cur, ctx) {
    if (!cur) return;
    var stemPlain = util.normSpace(util.plain(cur.stem));
    if (!stemPlain && !/<img/i.test(cur.stem)) {
      // 原文档中题干为空（如只有「2. 【判断题】」没有内容），明确报告而不是静默丢弃
      if (cur.type || cur.options.length || cur.answerLines.length) {
        ctx.report.invalid.push({ num: cur.num, stem: '', reason: '题干为空，已跳过（原文档未填写题干）' });
      }
      return;
    }

    var answerRaw = cur.answerLines.join(' ').trim();
    var note = '';
    if (RE_NOTE_TAIL.test(answerRaw)) {
      var mm = answerRaw.match(RE_NOTE_TAIL);
      note = mm ? mm[0].replace(/[（()）]/g, '') : '';
      RE_NOTE_TAIL.lastIndex = 0;
    }

    var type = cur.type;
    if (!type) {   // 未标注题型时按内容推断
      if (cur.options.length) {
        type = lettersOf(answerRaw).length > 1 ? 'multiple' : 'single';
      } else if (normJudge(answerRaw) !== null) {
        type = 'judge';
      } else {
        type = 'blank';
      }
    }

    var q = {
      id: 'q_' + util.hash(type + '|' + stemPlain),
      type: type,
      num: cur.num || '',
      chapter: cur.chapter || UNCHAPTERED,
      chapterGroup: cur.chapterGroup || UNCHAPTERED,
      stem: cur.stem.trim(),
      stemText: stemPlain,
      options: cur.options.slice(),
      answer: null,
      keywords: cur.keywords.length ? cur.keywords : null,
      analysis: (cur.analysis || '').trim(),
      note: note,
      source: ctx.source || ''
    };

    if (!answerRaw) {
      ctx.report.invalid.push({ num: q.num, stem: stemPlain.slice(0, 48), reason: '缺少答案' });
      return;
    }

    if (type === 'single' || type === 'multiple') {
      var ls = uniqSortedLetters(answerRaw);
      if (!ls) {
        ctx.report.invalid.push({ num: q.num, stem: stemPlain.slice(0, 48), reason: '答案无法识别为选项字母' });
        return;
      }
      if (type === 'single' && ls.length > 1) ls = ls.charAt(0);   // 单选只取第一个字母
      if (!q.options.length) {
        ctx.report.invalid.push({ num: q.num, stem: stemPlain.slice(0, 48), reason: '缺少选项' });
        return;
      }
      // 选项字母越界检查
      var maxKey = String.fromCharCode(64 + q.options.length);
      var bad = ls.split('').some(function (c) { return c > maxKey; });
      if (bad) {
        ctx.report.invalid.push({ num: q.num, stem: stemPlain.slice(0, 48), reason: '答案字母超出选项范围' });
        return;
      }
      q.answer = ls;
    } else if (type === 'judge') {
      var j = normJudge(answerRaw);
      if (j === null) {
        // 判断题给了选项字母（A.正确 B.错误）时按选项文本判定
        var l0 = uniqSortedLetters(answerRaw).charAt(0);
        if (l0) {
          var idx = l0.charCodeAt(0) - 65;
          var opt = q.options[idx];
          if (opt) j = normJudge(util.plain(opt.html));
        }
      }
      if (j === null) {
        ctx.report.invalid.push({ num: q.num, stem: stemPlain.slice(0, 48), reason: '判断题答案无法识别' });
        return;
      }
      q.answer = j;
      q.options = q.options.length ? q.options : [{ key: 'A', html: '正确' }, { key: 'B', html: '错误' }];
    } else if (type === 'blank') {
      var vs = [];
      cur.answerLines.forEach(function (ln) { vs = vs.concat(splitVariants(ln)); });
      if (!vs.length) {
        ctx.report.invalid.push({ num: q.num, stem: stemPlain.slice(0, 48), reason: '填空题缺少答案' });
        return;
      }
      q.answer = vs;
    } else {  // short
      q.answer = util.normSpace(util.plain(answerRaw));
      q.answerHtml = cur.answerLines.map(function (x) {
        return cur.richAns ? x : util.esc(x);
      }).join('<br>');
    }

    ctx.questions.push(q);
    ctx.report.total++;
    ctx.report.byType[q.type] = (ctx.report.byType[q.type] || 0) + 1;
    if (q.note) ctx.report.notes++;
    var ch = ctx.report.chapterMap;
    var key = q.chapterGroup + '||' + q.chapter;
    if (!ch[key]) ch[key] = { group: q.chapterGroup, name: q.chapter, count: 0 };
    ch[key].count++;
  }

  /* ---------- 主解析 ---------- */
  function parseLines(lines, opts) {
    opts = opts || {};
    var ctx = {
      questions: [],
      report: { total: 0, byType: {}, invalid: [], notes: 0, chapterMap: {}, stray: 0 },
      source: opts.source || ''
    };

    var cur = null;
    var chapter = UNCHAPTERED, chapterGroup = UNCHAPTERED;
    var started = false;   // 是否已遇到第一道题

    function newQuestion(type, content, num) {
      cur = {
        type: type, num: num, stem: content || '', options: [],
        answerLines: [], keywords: [], analysis: '', richAns: false,
        chapter: chapter, chapterGroup: chapterGroup
      };
    }

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var p = line.plain;
      if (!p && !/<img/i.test(line.text)) continue;

      /* 1) 显式章节标记 */
      var mCh = RE_CHAPTER_MARK.exec(p);
      if (mCh) {
        finalize(cur, ctx); cur = null;
        var nm = util.normSpace(mCh[1] || mCh[2] || '');
        if (nm) {
          chapter = nm; chapterGroup = nm;
          chapterGroup = util.normSpace(String(mCh[2] || '').replace(RE_SCORE_TAIL, '')) || nm;
          chapter = nm;
        }
        continue;
      }

      /* 2) 中文章标题 */
      var mC = RE_CHAPTER_CN.exec(p);
      if (mC && (!cur || cur.answerLines.length)) {
        finalize(cur, ctx); cur = null;
        var g = util.normSpace(p.replace(RE_SCORE_TAIL, ''));
        if (g && g.length <= 60) { chapterGroup = g; chapter = g; continue; }
      }

      /* 3) 中文节标题 */
      var mS = RE_SECTION_CN.exec(p);
      if (mS && (!cur || cur.answerLines.length)) {
        finalize(cur, ctx); cur = null;
        var sTitle = util.normSpace(p.replace(RE_SCORE_TAIL, ''));
        if (sTitle && sTitle.length <= 60) { chapter = chapterGroup + ' / ' + sTitle; continue; }
      }

      /* 4) 数字小节标题 1.1 xxx */
      var mN = RE_SECTION_NUM.exec(p);
      if (mN && (!cur || cur.answerLines.length) && !RE_TYPE_ONLY.test(p)) {
        var rest = util.normSpace(mN[3] || '');
        // 章节行特征：带小节号，且标题里不含明显题干特征
        if (rest && rest.length <= 60 && !/[（(]\s*[)）]/.test(rest)) {
          finalize(cur, ctx); cur = null;
          var numStr = mN[1] + '.' + mN[2];
          var title = util.normSpace(rest.replace(RE_SCORE_TAIL, '').replace(/[　\s]+（本次成绩[\s\S]*$/, ''));
          chapter = numStr + ' ' + title;
          started = true;
          continue;
        }
      }

      /* 5) 命名小节标题：「导言（本次成绩：100 分）」这类无编号小节 */
      var isScoreLine = /[（(]\s*本次成绩\s*[:：]/.test(p);
      if (!isScoreLine && i + 1 < lines.length) {
        var shortTitle = p.length <= 20 && !/[【】\[\]]/.test(p) && !RE_OPTION.test(p) &&
          !RE_ANSWER.test(p) && !RE_SECTION_NUM.test(p) &&
          !/^(答案|解析|关键词|正确答案)/.test(p);
        if (shortTitle) isScoreLine = /[（(]\s*本次成绩\s*[:：]/.test(lines[i + 1].plain);
      }
      if (isScoreLine && (!cur || cur.answerLines.length)) {
        finalize(cur, ctx); cur = null;
        var ttl = util.normSpace(p.replace(RE_SCORE_TAIL, '').replace(/[（(]\s*本次成绩[\s\S]*$/, ''));
        if (ttl && ttl.length <= 40) {
          chapter = chapterGroup === UNCHAPTERED ? ttl : (chapterGroup + ' / ' + ttl);
          continue;
        }
      }

      /* 6) 题目行：带题号 + 题型 */
      var mQ = RE_QNUM_TYPE.exec(p);
      if (mQ) {
        var t1 = resolveType(mQ[1]);
        if (t1) {
          finalize(cur, ctx);
          var c1 = contentOf(line, RE_QNUM_TYPE);
          newQuestion(t1, c1, (p.match(/^\s*(\d{1,4})/) || [])[1] || '');
          started = true;
          continue;
        }
      }

      /* 6) 题目行：仅题型标记 */
      var mT = RE_TYPE_ONLY.exec(p);
      if (mT) {
        var t2 = resolveType(mT[1]);
        if (t2) {
          finalize(cur, ctx);
          newQuestion(t2, contentOf(line, RE_TYPE_ONLY), '');
          started = true;
          continue;
        }
      }

      if (!cur) {
        if (started || /答案|选项/.test(p)) ctx.report.stray++;
        continue;
      }

      /* 7) 当前题目的字段 */
      var cAns = contentOf(line, RE_ANSWER);
      if (cAns !== null) { cur.answerLines.push(line.rich ? cAns : util.plain(cAns)); cur.richAns = cur.richAns || line.rich; continue; }

      var cKw = contentOf(line, RE_KEYWORDS);
      if (cKw !== null) { cur.keywords = cur.keywords.concat(normKeywords(cKw)); continue; }

      var cAn = contentOf(line, RE_ANALYSIS);
      if (cAn !== null) { cur.analysis = (cur.analysis ? cur.analysis + '<br>' : '') + cAn; continue; }

      var cOp = contentOf(line, RE_OPTION);
      if (cOp !== null && !cur.answerLines.length) {
        var key = (RE_OPTION.exec(p) || ['', ''])[1].toUpperCase();
        // 避免把题干里的 "A、…" 误判：仅在题干已有内容时接受选项
        if (cur.stem) { cur.options.push({ key: key, html: cOp }); continue; }
      }

      /* 8) 续行 */
      var cont = line.rich ? util.sanitize(line.text.trim()) : util.esc(p);
      if (!cur.options.length) {
        cur.stem = cur.stem ? cur.stem + ' ' + cont : cont;
      } else {
        var last = cur.options[cur.options.length - 1];
        last.html = last.html ? last.html + ' ' + cont : cont;
      }
    }

    finalize(cur, ctx);
    return { questions: ctx.questions, report: ctx.report };
  }

  parser.parseText = function (text, opts) {
    return parseLines(linesFromText(text), opts);
  };

  parser.parseDocx = function (arrayBuffer, opts) {
    if (typeof window.mammoth === 'undefined') {
      return Promise.reject(new Error('docx 解析库未加载，请改用 txt 格式导入'));
    }
    var options = {};
    if (window.mammoth.images && window.mammoth.images.imgElement) {
      options.convertImage = window.mammoth.images.imgElement(function (image) {
        return image.read('base64').then(function (b64) {
          return { src: 'data:' + image.contentType + ';base64,' + b64 };
        });
      });
    }
    return window.mammoth.convertToHtml({ arrayBuffer: arrayBuffer }, options)
      .then(function (res) {
        return parseLines(linesFromHtml(res.value || ''), opts);
      });
  };

  parser.parseFile = function (file, opts) {
    opts = opts || {};
    opts.source = file.name;
    var name = (file.name || '').toLowerCase();
    if (/\.docx$/.test(name)) {
      return util.readAsArrayBuffer(file).then(function (buf) { return parser.parseDocx(buf, opts); });
    }
    if (/\.doc$/.test(name)) {
      return Promise.reject(new Error('不支持旧版 .doc，请用 Word 另存为 .docx 或 .txt'));
    }
    return util.readAsText(file).then(function (text) { return parser.parseText(text, opts); });
  };

  /* ---------- 判分 ---------- */
  parser.grade = function (q, resp) {
    if (resp === null || resp === undefined || resp === '') return false;
    if (q.type === 'single') return resp === q.answer;
    if (q.type === 'multiple') return uniqSortedLetters(resp) === q.answer;
    if (q.type === 'judge') return !!resp === !!q.answer;
    if (q.type === 'blank') return q.answer.some(function (a) { return normBlank(a) === normBlank(resp); });
    return null;   // 简答题需自评
  };

  parser.normBlank = normBlank;

  /* ---------- 展示 ---------- */
  function optByKey(q, k) {
    for (var i = 0; i < q.options.length; i++) if (q.options[i].key === k) return q.options[i];
    return null;
  }

  parser.answerText = function (q) {
    if (q.type === 'single' || q.type === 'multiple') {
      var letters = String(q.answer || '').split('');
      var parts = letters.map(function (k) {
        var o = optByKey(q, k);
        return q.type === 'single'
          ? '<b>' + util.esc(k) + '</b>. ' + (o ? o.html : '')
          : '<b>' + util.esc(k) + '</b>. ' + (o ? o.html : '');
      });
      return (q.type === 'multiple' ? '<b>' + util.esc(q.answer) + '</b><br>' : '') + parts.join('<br>');
    }
    if (q.type === 'judge') return '<b>' + (q.answer ? '正确' : '错误') + '</b>';
    if (q.type === 'blank') return q.answer.map(function (v) { return '<b>' + util.esc(v) + '</b>'; }).join(' 或 ');
    if (q.type === 'short') return q.answerHtml || util.esc(q.answer || '');
    return '';
  };

  parser.answerPlain = function (q) {
    if (q.type === 'judge') return q.answer ? '正确' : '错误';
    if (q.type === 'blank') return q.answer.join(' 或 ');
    if (q.type === 'short') return q.answer || '';
    return String(q.answer || '');
  };

  /* 简答题关键词命中 */
  parser.keywordHits = function (q, resp) {
    if (!q.keywords || !q.keywords.length) return null;
    var text = normBlank(resp);
    return q.keywords.map(function (k) {
      return { word: k, hit: normBlank(k) !== '' && text.indexOf(normBlank(k)) >= 0 };
    });
  };

  parser.UNCHAPTERED = UNCHAPTERED;
  A.parser = parser;
})(window.App);
