/* ===== 共享题库池（静态版）=====
 * 共享题库以 JSON 形式放在网站的 shared/ 目录里，随站点一起发布。
 * 任何人可一键加载到自己设备；只有站点维护者能通过修改仓库增删共享题库。
 * 加载使用固定 id：重复加载 = 更新覆盖，且做题记录自动保留（记录按题库 id 存储）。
 */
window.App = window.App || {};
(function (A) {
  'use strict';
  var util = A.util, store = A.store, parser = A.parser;
  var shared = {};

  var MANIFEST_URL = 'shared/manifest.json';
  var cache = null;      // manifest 内容
  var loadErr = null;

  /* manifest 格式：
   * { "banks": [ { "file": "banks/新中国史.json", "name": "新中国史章节测验" } ] }
   * bank JSON 格式：
   * { "sharedId": "xxx", "name": "...", "source": "...", "questions": [ {...} ] }
   */
  shared.loadManifest = function () {
    if (cache || loadErr) return Promise.resolve(cache);
    return fetch(MANIFEST_URL)
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (m) {
        cache = (m && Array.isArray(m.banks)) ? m.banks : [];
        return cache;
      })
      .catch(function (e) {
        loadErr = e;
        return [];
      });
  };

  function sharedBankId(sharedId) { return 'sh_' + util.hash(sharedId); }

  /* 某共享题库在本地是否已加载（返回本地题库或 null） */
  shared.locallyLoaded = function (sharedId) {
    var want = sharedBankId(sharedId);
    var bs = store.banks();
    for (var i = 0; i < bs.length; i++) if (bs[i].id === want) return bs[i];
    return null;
  };

  shared.bankIdFor = sharedBankId;

  /* 拉取并加载/更新一个共享题库到本地 */
  shared.install = function (entry) {
    return fetch('shared/' + entry.file)
      .then(function (r) {
        if (!r.ok) throw new Error('下载题库失败（HTTP ' + r.status + '）');
        return r.json();
      })
      .then(function (data) {
        if (!data || !Array.isArray(data.questions) || !data.questions.length) {
          throw new Error('共享题库文件格式不正确或没有题目');
        }
        var sid = data.sharedId || entry.name;
        var bank = {
          id: sharedBankId(sid),
          name: data.name || entry.name,
          createdAt: Date.now(),
          source: data.source || '共享题库',
          shared: true,
          questions: data.questions
        };
        store.upsertBank(bank);   // 同 id 覆盖，保留做题记录
        return bank;
      });
  };

  /* ---------- 首页渲染 ---------- */
  shared.render = function () {
    var el = document.getElementById('sharedSection');
    if (!el) return;
    shared.loadManifest().then(function (banks) {
      if (!banks.length) {
        el.innerHTML = loadErr
          ? '<div class="card"><div class="card-title">共享题库</div><div class="small muted">共享题库列表不可用（' + util.esc(loadErr.message) + '）</div></div>'
          : '';
        return;
      }
      var h = '<div class="card"><div class="card-title">共享题库' +
        '<span class="spacer"></span><span class="small muted">由站长维护 · 一键加载到本机</span></div>';
      banks.forEach(function (b, idx) {
        var local = shared.locallyLoaded(b.sharedId || b.name);
        var n = b.count ? (' · ' + b.count + ' 题') : '';
        h += '<div class="list-item" style="margin-bottom:8px">' +
          '<div class="li-main">' +
          '<div class="li-title">' + util.esc(b.name) + '</div>' +
          '<div class="li-sub">' + (local ? '已加载 ' + local.questions.length + ' 题' : '点击加载' + n) +
          (local && local.questions.length && b.count && local.questions.length !== b.count ? ' · 有可用更新' : '') + '</div>' +
          '</div>' +
          '<button class="btn sm ' + (local ? '' : 'primary') + '" data-act="sh-load" data-idx="' + idx + '">' +
          (local ? '更新' : '加载') + '</button>' +
          '</div>';
      });
      h += '</div>';
      el.innerHTML = h;
    });
  };

  shared.handle = function (act, el) {
    if (act === 'sh-export') { shared.exportPack(el.getAttribute('data-id')); return true; }
    if (act !== 'sh-load') return false;
    var idx = parseInt(el.getAttribute('data-idx'), 10);
    shared.loadManifest().then(function (banks) {
      var entry = banks[idx];
      if (!entry) { util.toast('共享题库不存在', 'err'); return; }
      el.disabled = true;
      el.textContent = '加载中…';
      shared.install(entry).then(function (bank) {
        util.toast('已加载「' + bank.name + '」共 ' + bank.questions.length + ' 题', 'ok');
        A.app.render();
      }).catch(function (e) {
        util.toast('加载失败：' + e.message, 'err');
        el.disabled = false;
        el.textContent = '重试';
      });
    });
    return true;
  };

  /* 导出共享包 JSON（站长用：导出后放到 shared/banks/ 并更新 manifest） */
  shared.exportPack = function (bankId) {
    var bank = store.getBank(bankId);
    if (!bank) return;
    var pack = {
      sharedId: bank.id,
      name: bank.name,
      source: bank.source || '',
      exportedAt: new Date().toISOString(),
      questions: bank.questions
    };
    var safeName = bank.name.replace(/[\\/:*?"<>|]/g, '_');
    util.download('共享包-' + safeName + '.json', JSON.stringify(pack));
    util.toast('已导出共享包，按「部署步骤.md」上传到 shared/banks/ 即可');
  };

  A.shared = shared;
})(window.App);
