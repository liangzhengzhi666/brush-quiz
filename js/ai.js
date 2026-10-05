/* ===== AI 解析（智谱 GLM 等OpenAI兼容接口，浏览器直连）=====
 * 密钥只存在本机浏览器，调用时从浏览器直接发往 AI 服务商。
 * 生成的解析按题目缓存（存答题记录的 exp 字段），随数据导出/导入一起迁移。
 */
window.App = window.App || {};
(function (A) {
  'use strict';
  var util = A.util, store = A.store;
  var ai = {};

  var DEFAULT_URL = 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
  var DEFAULT_MODEL = 'glm-4-flash';

  ai.getConfig = function () {
    return {
      url: store.getSetting('aiUrl', DEFAULT_URL) || DEFAULT_URL,
      model: store.getSetting('aiModel', DEFAULT_MODEL) || DEFAULT_MODEL,
      key: store.getSetting('aiKey', '') || ''
    };
  };

  ai.saveConfig = function (url, model, key) {
    store.setSetting('aiUrl', util.normSpace(url) || DEFAULT_URL);
    store.setSetting('aiModel', util.normSpace(model) || DEFAULT_MODEL);
    store.setSetting('aiKey', util.normSpace(key));
  };

  ai.configured = function () { return !!ai.getConfig().key; };

  /* 测试连通性与密钥 */
  ai.test = function () {
    return ai.chat([
      { role: 'user', content: '请只回复两个字：正常' }
    ], { maxTokens: 10 });
  };

  function buildPrompt(q) {
    var type = A.parser.typeName(q.type);
    var lines = ['题型：' + type, '题干：' + util.plain(q.stem).trim()];
    if (q.type === 'single' || q.type === 'multiple') {
      q.options.forEach(function (o) {
        lines.push('选项' + o.key + ': ' + util.plain(o.html).trim());
      });
    }
    lines.push('正确答案：' + A.parser.answerPlain(q));
    if (q.type === 'short' && q.keywords) lines.push('答题要点：' + q.keywords.join('、'));
    return lines.join('\n');
  }

  /* 生成一道题的解析（resolve 解析文本） */
  ai.explain = function (q) {
    var sys = '你是一位耐心细致的考试辅导老师，用中文向学生解析题目。要求：' +
      '先用一两句话点明正确答案的核心依据，再逐项简要说明错误选项错在哪里（判断题、填空题、简答题则说明判断/作答依据和易错点）。' +
      '总共不超过150字，不要重复题干，不要寒暄，直接输出解析正文。';
    return ai.chat([
      { role: 'system', content: sys },
      { role: 'user', content: buildPrompt(q) }
    ], { maxTokens: 400, temperature: 0.4 });
  };

  /* 底层对话调用 */
  ai.chat = function (messages, opts) {
    opts = opts || {};
    var cfg = ai.getConfig();
    if (!cfg.key) {
      return Promise.reject(new Error('尚未配置 AI 密钥'));
    }
    var t0 = Date.now();
    return fetch(cfg.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + cfg.key
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: messages,
        temperature: opts.temperature === undefined ? 0.4 : opts.temperature,
        max_tokens: opts.maxTokens || 400
      })
    }).then(function (r) {
      return r.text().then(function (txt) {
        var data = null;
        try { data = JSON.parse(txt); } catch (e) { }
        if (!r.ok) {
          var msg = (data && data.error && (data.error.message || data.error.msg)) || ('HTTP ' + r.status);
          if (r.status === 401) msg = 'API 密钥无效或未填（' + msg + '）';
          else if (r.status === 429) msg = '请求过于频繁被限流，稍后再试（' + msg + '）';
          throw new Error(msg);
        }
        if (data && data.choices && data.choices[0] && data.choices[0].message) {
          return String(data.choices[0].message.content || '').trim();
        }
        throw new Error('返回内容无法解析：' + txt.slice(0, 120));
      });
    }).catch(function (e) {
      if (e instanceof TypeError) {
        throw new Error('网络请求失败：接口地址不可达或浏览器阻止了跨域请求');
      }
      throw e;
    });
  };

  ai.sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  A.ai = ai;
})(window.App);
