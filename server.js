/*
 * AI-7 本地代理服务器
 * 作用：1) 托管游戏静态页面  2) 转发聊天到 DeepSeek API
 * 你的 API Key 只存在本机这个文件 / 环境变量里，绝不会进入玩家浏览器。
 * 运行：node server.js   （然后浏览器打开 http://127.0.0.1:8787）
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8787;
const ROOT = __dirname;

// ---- API Key：优先环境变量，其次本目录 config.json ----
function loadApiKey() {
  if (process.env.DEEPSEEK_API_KEY) return process.env.DEEPSEEK_API_KEY;
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8'));
    return cfg.apiKey || '';
  } catch (e) { return ''; }
}
const API_KEY = loadApiKey();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.md': 'text/plain; charset=utf-8'
};

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', c => { data += c; if (data.length > 1e6) { reject(new Error('body too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(data ? JSON.parse(data) : {}); } catch (e) { reject(new Error('bad json')); } });
    req.on('error', reject);
  });
}

async function proxyChat(messages, system) {
  const url = 'https://api.deepseek.com/chat/completions';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 25000);
  try {
    const body = {
      model: 'deepseek-chat',
      messages: (system ? [{ role: 'system', content: system }] : []).concat(messages),
      temperature: 0.9,
      max_tokens: 420,
      stream: false
    };
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + API_KEY
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!resp.ok) {
      let detail = '';
      try { detail = (await resp.text()).slice(0, 300); } catch (e) {}
      throw new Error('deepseek http ' + resp.status + ' ' + detail);
    }
    const json = await resp.json();
    const reply = (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content) || '';
    return String(reply).trim();
  } finally {
    clearTimeout(timer);
  }
}

const server = http.createServer(async (req, res) => {
  // CORS（便于 file:// 直接打开页面时也能访问）
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);

  if (urlPath === '/health') {
    return sendJson(res, 200, { ok: true, ai: !!API_KEY });
  }

  if (urlPath === '/api/chat' && req.method === 'POST') {
    if (!API_KEY) return sendJson(res, 503, { error: '服务器未配置 DEEPSEEK_API_KEY（见 config.json）' });
    let body;
    try { body = await readBody(req); }
    catch (e) { return sendJson(res, 400, { error: 'bad request' }); }
    const msgs = Array.isArray(body.messages) ? body.messages : [];
    if (!msgs.length) return sendJson(res, 400, { error: 'no messages' });
    try {
      const reply = await proxyChat(msgs, body.system);
      return sendJson(res, 200, { reply });
    } catch (e) {
      console.error('[chat]', e.message);
      return sendJson(res, 502, { error: 'proxy failed: ' + e.message });
    }
  }

  // ---- 静态文件 ----
  let filePath = path.normalize(path.join(ROOT, urlPath === '/' ? 'index.html' : urlPath));
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
  fs.stat(filePath, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('404 not found'); }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log('==============================================');
  console.log('  AI-7 本地服务器已启动');
  console.log('  浏览器打开:  http://127.0.0.1:' + PORT);
  console.log('  DeepSeek 接入: ' + (API_KEY ? '已配置(在线AI可用)' : '未配置 —— 编辑 config.json 填入 apiKey'));
  console.log('==============================================');
});
