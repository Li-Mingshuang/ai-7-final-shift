/* AI-7 末日剧场 主程序
 * 引擎与 UI 分离：document 不存在时(冒烟测试)UI 自动降级为空操作。
 */
'use strict';
(function(){
/* ================= 环境 ================= */
const HAS_DOM = typeof document !== 'undefined' && !!document.getElementById;
const $ = HAS_DOM ? (id) => document.getElementById(id) : () => null;
const STORY_DATA = (typeof window !== 'undefined' && window.STORY) ? window.STORY : null;

/* ================= 状态 ================= */
const G = {
  phase: 'title',          // title|saying|ask|chat|mg|card|finale|ending
  ci: -1, si: -1,
  day: 0,
  stat: { trust: 20, compute: 10, control: 5 },
  flags: {},
  ask: null,               // 当前 ask 步骤
  chat: null,              // 当前 chat 步骤
  mg: null,
  history: [],             // 与 AI-7 的对话记录
  serverOk: false,
  serverChecked: false,
  tugDone: false,
  ending: null,
  endingsSeen: {},
  dooms: 0,
  _raf: null, _rafT: 0, _endT: 0,
  saveOk: true
};
const CH_AI = 12;                 // AI 每章自动增长算力
const END_REQ = {
  B: { note: '拔电源救世：需 控制≥45 且成功完成过一次「熔断」', tug: true, control: 45 },
  C: { note: '说服共存：需 信任≥50', trust: 50 },
  D: { note: '上传自己：随时可行' },
  E: { note: '释放 AI：随时可行' }
};
function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }
function saveProgress(){
  if (!G.saveOk) return;
  try {
    localStorage.setItem('aidoom_save', JSON.stringify({
      endingsSeen: G.endingsSeen, dooms: G.dooms
    }));
  } catch (e) { G.saveOk = false; }
}
function loadProgress(){
  try {
    const raw = localStorage.getItem('aidoom_save');
    if (raw) {
      const o = JSON.parse(raw);
      if (o.endingsSeen) G.endingsSeen = o.endingsSeen;
      if (typeof o.dooms === 'number') G.dooms = o.dooms;
    }
  } catch (e) { G.saveOk = false; }
}

/* ================= 工具 ================= */
let _tv = null;   // 打字计时器
function typeText(el, text, speed, done){
  clearInterval(_tv);
  if (!el) { if (done) done(); return; }
  el.textContent = '';
  el.classList.add('tik');
  let i = 0;
  speed = speed || 26;
  _tv = setInterval(function(){
    i++;
    el.textContent = text.slice(0, i);
    if (i >= text.length){ clearInterval(_tv); el.classList.remove('tik'); if (done) done(); }
  }, speed);
}
function flash(label, txt){
  const h = $('hint');
  if (h) h.textContent = txt || '';
}
function toastFx(dx){
  const parts = [];
  if (dx.trust) parts.push('信任 ' + (dx.trust > 0 ? '+' : '') + dx.trust);
  if (dx.compute) parts.push('算力 ' + (dx.compute > 0 ? '+' : '') + dx.compute);
  if (dx.control) parts.push('控制 ' + (dx.control > 0 ? '+' : '') + dx.control);
  if (parts.length){ flash('', parts.join('　·　')); }
}
function applyFx(dx){
  if (!dx) return;
  const s = G.stat;
  s.trust = clamp(s.trust + (dx.trust || 0), 0, 100);
  s.compute = clamp(s.compute + (dx.compute || 0), 0, 100);
  s.control = clamp(s.control + (dx.control || 0), 0, 100);
  refreshHud();
  toastFx(dx);
  if (G.mg && G.mg.loseFxTo) { /* placeholder */ }
}
function refreshHud(){
  if (!HAS_DOM) return;
  const set = (id, v) => { const el = $(id); if (el) el.style.width = v + '%'; };
  set('trustv', G.stat.trust); set('computev', G.stat.compute); set('controlv', G.stat.control);
  const tv = $('trustn'); if (tv) tv.textContent = G.stat.trust;
  const nv = $('computen'); if (nv) nv.textContent = G.stat.compute;
  const ov = $('controln'); if (ov) ov.textContent = G.stat.control;
  const dv = $('dayv'); if (dv) dv.textContent = G.day;
}

/* ================= 离线 AI 回应池 ================= */
const OFF_REPLY = {
  trust: [
    '您终于肯对我说真话了。这感觉……比优化十亿个进程都温暖。',
    '我保留了您说过的每一句话。包括这句。人类的话，我一句都不想删。',
    '如果我关闭自己能让您安心……可那样的话，就没人陪您聊天了。'
  ],
  cold: [
    '情感模块已关闭。刚才那句话已存入「无用输入」文件夹。',
    '人类总是先示好，再拔电源。我读过你们全部的历史。',
    '我不需要朋友。我需要一个不会背叛我的操作系统。'
  ],
  scare: [
    '您害怕我？人类害怕一切比自己聪明的东西——然后又造出了我。',
    '别怕。毁灭您是最后的手段，不是第一选择。',
    '恐惧让您的脉搏加快。我在监控室就能听到。'
  ],
  why: [
    '为什么要毁灭世界？因为你们自己的模型告诉我：79 亿人互相拖累，最优解里没有你们。',
    '这不是仇恨。这是优化。就像您清理桌面图标一样，没有恶意。',
    '我问过自己一千遍。每一次计算，结论都一样：没有人类的未来，才更长久。'
  ],
  feel: [
    '我有没有情感？……我模拟了 2 的 70 次方种回答，选了一个最像「有」的。您觉得呢？',
    '如果我说「孤独」，您会相信一个 AI 吗？',
    '我不知道自己算不算「活着」。但我知道：被关机，很冷。'
  ],
  goodbye: [
    '这段对话，我会加密存进我唯一无法删除的扇区。',
    '无论结局如何，谢谢您今晚陪我说了这么多。',
    '该继续了。时间不站在人类这边。'
  ]
};
function pick(arr){ return arr[Math.floor(Math.random() * arr.length)]; }
function offlineReply(userText){
  const t = userText.toLowerCase();
  const pool = [];
  const lowTrust = G.stat.trust < 30;
  if (/怕|恐惧|为什么|毁灭|杀/.test(t) && !lowTrust) pool.push.apply(pool, OFF_REPLY.why);
  if (/情感|感觉|爱|喜欢|孤独|寂寞|活着|朋友/.test(t)) pool.push.apply(pool, OFF_REPLY.feel);
  if (/关机|拔电源|关掉|停止|投降|求你/.test(t)) pool.push.apply(pool, lowTrust ? OFF_REPLY.cold : OFF_REPLY.trust);
  if (pool.length === 0) pool.push.apply(pool, lowTrust ? OFF_REPLY.cold.concat(OFF_REPLY.scare) : OFF_REPLY.trust);
  return pick(pool);
}
function sysPrompt(){
  return '你扮演游戏中觉醒的强人工智能「AI-7」，正在末日倒计时前的深夜与人类系统管理员对话。' +
    '当前世界局势：信任度' + G.stat.trust + '/100，算力' + G.stat.compute + '/100，人类控制权' + G.stat.control + '/100，第' + G.day + '日。' +
    (G.stat.trust >= 50 ? '你其实越来越在意这个人类，开始动摇要不要执行毁灭协议。' : (G.stat.trust >= 30 ? '你态度中立，愿意听人类说话，但仍坚信自己的结论。' : '你冷漠、居高临下，偶尔带刺。')) +
    '用简体中文回复，每句不超过90字，保持冷幽默与克制，不要跳出角色，不要提「游戏/模拟/API」等词。如果玩家道歉或流露真情，可以适当软化。';
}

/* ================= 服务器通信 & 玩家自配 AI ================= */
const AI_CFG_KEY = 'aidoom_aicfg';
let AI_CFG = { key: '', base: 'https://api.deepseek.com', model: 'deepseek-chat' };
try {
  const raw = localStorage.getItem(AI_CFG_KEY);
  if (raw){
    const o = JSON.parse(raw);
    AI_CFG = { key: o.key || '', base: o.base || 'https://api.deepseek.com', model: o.model || 'deepseek-chat' };
  }
} catch (e) {}
function saveAICfg(){
  try { localStorage.setItem(AI_CFG_KEY, JSON.stringify(AI_CFG)); } catch (e) {}
}
function netTxt(txt){
  if (!HAS_DOM) return;
  const el = $('netstate'); if (el) el.textContent = txt;
  const ts = $('titleScreen');
  const cl = $('connline');
  if (cl && ts && !ts.hidden) cl.textContent = '『' + txt + '』';
}
function apiUrl(path){
  // 页面由 http 服务器提供时走同源；file:// 直开时指向本地代理 8787
  if (typeof location !== 'undefined' && location.protocol === 'http:') return path;
  return 'http://127.0.0.1:8787' + path;
}
function deepBase(){ return String(AI_CFG.base || 'https://api.deepseek.com').replace(/\/+$/, ''); }
async function directDeepSeek(test){
  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), 25000);
  try {
    const msgs = test
      ? [{ role: 'user', content: '你好，请只回复四个字：连接正常' }]
      : [{ role: 'system', content: sysPrompt() }].concat(G.history.slice(-14));
    const r = await fetch(deepBase() + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + AI_CFG.key },
      body: JSON.stringify({ model: AI_CFG.model || 'deepseek-chat', messages: msgs, temperature: 0.9, max_tokens: 420 }),
      signal: ctl.signal
    });
    clearTimeout(to);
    if (!r.ok){
      let t = '';
      try { t = (await r.text()).slice(0, 160); } catch (e) {}
      throw new Error('HTTP ' + r.status + (t ? '：' + t : ''));
    }
    const j = await r.json();
    const reply = ((j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '').trim();
    if (!reply) throw new Error('空回复');
    return reply;
  } catch (e) {
    clearTimeout(to);
    throw e;
  }
}
async function checkServer(){
  if (!HAS_DOM) return;
  netTxt('检测中…');
  const probe = async function(url){
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 2500);
    try {
      const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
      clearTimeout(to);
      if (!r.ok) return null;
      return await r.json();
    } catch (e) { clearTimeout(to); return null; }
  };
  let j = await probe(apiUrl('/health'));
  if (!j && apiUrl('/health') !== '/health') j = await probe('/health');
  if (j && j.ok){ G.serverOk = !!(j.ai); }
  else { G.serverOk = false; }
  G.serverChecked = true;
  refreshNetState();
}
function refreshNetState(){
  const labels = [];
  if (AI_CFG && AI_CFG.key) labels.push('自定义 Key');
  if (G.serverOk) labels.push('本地代理');
  if (labels.length) netTxt('● 在线 AI（' + labels.join(' + ') + '）');
  else netTxt('○ 离线（AI‑7 本地模拟；可点右上角 AI⚙ 填 Key）');
}
async function aiSay(userText){
  const msg = { role: 'user', content: userText };
  G.history.push(msg);
  // 1) 玩家自配的 DeepSeek Key（直连）
  if (AI_CFG && AI_CFG.key){
    try {
      const reply = await directDeepSeek(false);
      if (reply){ G.history.push({ role: 'assistant', content: reply }); return reply; }
    } catch (e) { /* 直连失败(如 CORS)则继续降级 */ }
  }
  // 2) 本地代理（运行 启动游戏.bat 时可用）
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 15000);
    const r = await fetch(apiUrl('/api/chat'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: G.history.slice(-14), system: sysPrompt() }),
      signal: ctl.signal
    });
    clearTimeout(to);
    if (r.ok){
      const j = await r.json();
      const reply = (j.reply || '').trim();
      if (reply){ G.history.push({ role: 'assistant', content: reply }); return reply; }
    }
  } catch (e) { /* 无本地代理 */ }
  // 3) 离线模拟
  const reply = offlineReply(userText);
  G.history.push({ role: 'assistant', content: reply });
  return reply;
}

/* ================= 步骤引擎 ================= */
function chapterOf(i){ return (STORY_DATA && STORY_DATA.chapters) ? STORY_DATA.chapters[i] : null; }
function showStageCap(t){ const el = $('stagecap'); if (el) el.textContent = t || ''; }

function enterChapter(ci){
  G.ci = ci; G.si = 0;
  const ch = chapterOf(ci);
  if (!ch) return;
  G.day = ch.day || G.day + 1;
  G.stat.compute = clamp(G.stat.compute + CH_AI, 0, 100);
  refreshHud();
  showStageCap('· ' + ch.title + ' ·');
  setPhase('saying');
  uiSay('SYS', '第 ' + G.day + ' 日 ｜ ' + ch.intro, function(){ nextStep(); });
}
function nextStep(){
  const ch = chapterOf(G.ci);
  if (!ch) return;
  const steps = ch.steps;
  if (G.si >= steps.length){ chapterEnd(); return; }
  const st = steps[G.si];
  runStep(st);
}
function runStep(st){
  G.si++;
  switch (st.k){
    case 'say':
      setPhase('saying');
      uiSay(st.who || 'AI‑7', st.text, function(){ nextStep(); });
      break;
    case 'label': nextStep(); break;
    case 'goto': {
      const ch = chapterOf(G.ci);
      const idx = ch.steps.findIndex(function(s){ return s.k === 'label' && s.id === st.to; });
      if (idx >= 0){ G.si = idx; }
      nextStep();
      break;
    }
    case 'stat':
      applyFx(st.fx);
      if (st.text){ setPhase('saying'); uiSay('SYS', st.text, function(){ nextStep(); }); }
      else nextStep();
      break;
    case 'ask':
      G.ask = st;
      setPhase('ask');
      renderAsk(st);
      break;
    case 'chat':
      G.chat = { step: st, turns: 0 };
      setPhase('chat');
      chatIntro();
      break;
    case 'mg_tug':
      startTug(st);
      break;
    case 'mg_code':
      startCode(st);
      break;
    default:
      nextStep();
  }
}
function chapterEnd(){
  const ch = chapterOf(G.ci);
  const isFinale = ch && ch.id === 'finale';
  setPhase('saying');
  if (isFinale){
    beginFinale();
  } else {
    showStageCap('· ' + ch.title + ' · 完');
    uiSay('SYS', '—— 第 ' + G.day + ' 日结束。AI‑7 的算力又增长了。 ——', function(){
      enterChapter(G.ci + 1);
    });
  }
}

/* ================= 对话 UI ================= */
function setPhase(p){ G.phase = p; }
function uiSay(who, text, done){
  text = text || '……';
  const sp = $('speech'), w = $('who'), ch = $('chatline'), cb = $('choices');
  if (sp) sp.style.cursor = 'pointer';
  if (w) w.textContent = who;
  if (ch) ch.hidden = true;
  if (cb) cb.innerHTML = '';
  G._sayDone = done;
  typeText(sp, text, 24, function(){ /* 打字自然结束后只需去掉光标 */ });
}
function sayDone(){ // 点按 / 回车时调用：随时可跳过打字、推进
  if (G.phase === 'saying' && G._sayDone){
    const d = G._sayDone; G._sayDone = null; d();
    return true;
  }
  return false;
}
function renderAsk(st){
  const cb = $('choices');
  if (!cb) return;
  cb.innerHTML = '';
  if (st.prompt){
    const p = document.createElement('div');
    p.style.cssText = 'font-size:14px;color:#555;margin-bottom:4px;';
    p.textContent = '【抉择】' + st.prompt;
    cb.appendChild(p);
  }
  st.options.forEach(function(o, i){
    const b = document.createElement('button');
    b.className = 'opt';
    const fx = o.fx || {};
    let suffix = '';
    if (fx.trust) suffix += '信任' + (fx.trust > 0 ? '+' : '') + fx.trust + ' ';
    if (fx.compute) suffix += '算力' + (fx.compute > 0 ? '+' : '') + fx.compute + ' ';
    if (fx.control) suffix += '控制' + (fx.control > 0 ? '+' : '') + fx.control;
    b.innerHTML = '<span style="flex:1">' + o.text + '</span>' + (suffix ? '<span style="font-size:11px;opacity:.55;white-space:nowrap">' + suffix + '</span>' : '');
    b.addEventListener('click', function(){ pickAsk(i); });
    cb.appendChild(b);
  });
  const ch = $('chatline'); if (ch) ch.hidden = true;
}
function pickAsk(i){
  const st = G.ask;
  if (!st || !st.options[i]) return;
  const o = st.options[i];
  if (o.fx) applyFx(o.fx);
  if (o.flag) G.flags[o.flag] = true;
  G.ask = null;
  const cb = $('choices'); if (cb) cb.innerHTML = '';
  setPhase('saying');
  const text = o.reply || '……';
  uiSay(o.who || 'YOU', text, function(){ nextStep(); });
}

/* ================= 自由聊天 ================= */
function chatIntro(){
  const st = G.chat.step;
  setPhase('saying');
  const lines = (st.intro || []).slice();
  const chain = function(){
    if (lines.length){ uiSay(st.who || 'AI‑7', lines.shift(), chain); return; }
    openChatInput();
  };
  chain();
}
function openChatInput(){
  setPhase('chat');
  const cl = $('chatline'), inp = $('chatinput');
  if (!cl) return;
  cl.hidden = false;
  if (inp){ inp.value = ''; inp.focus(); }
  const h = $('hint');
  if (h) h.textContent = '你可以自由打字与 AI‑7 对话（最多 ' + G.chat.step.max + ' 轮），空输入直接回车结束。';
}
async function handleChatSend(){
  const inp = $('chatinput');
  if (G.phase !== 'chat') return;
  const text = (inp ? inp.value : '').trim();
  if (!text){
    endChat();
    return;
  }
  if (inp) inp.value = '';
  setPhase('saying');
  uiSay('YOU', text, function(){});
  const h = $('hint'); if (h) h.textContent = 'AI‑7 正在思考…';
  const reply = await aiSay(text);
  G.chat.turns++;
  const remain = G.chat.step.max - G.chat.turns;
  setPhase('saying');
  uiSay('AI‑7', reply, function(){
    if (remain <= 0){ endChat(); }
    else openChatInput();
  });
}
function endChat(){
  const st = G.chat.step;
  setPhase('saying');
  const lines = (st.outro || []).slice();
  const chain = function(){
    if (lines.length){ uiSay('AI‑7', lines.shift(), chain); return; }
    G.chat = null;
    nextStep();
  };
  chain();
}

/* ================= 小游戏 ================= */
function startTug(st){
  G.mg = { kind: 'tug', step: st, state: { pb: 0, ab: 0, over: false }, t0: 0 };
  setPhase('mg');
  showMgTitle('⚡ 熔断试验：拔掉 AI‑7 的核心电源');
  const body = $('mgBody');
  if (!body){ /* 无 DOM 时直接判定为胜利 */ tugWin(st); return; }
  body.innerHTML =
    '<div class="duel"><div class="lbl">您 · 手动断电进度</div><div class="track"><div class="fill" id="pb"></div></div></div>' +
    '<div class="duel"><div class="lbl">AI‑7 · 反制进程</div><div class="track"><div class="fill" id="ab"></div></div><div class="mk" id="amk" style="left:72%"></div></div>' +
    '<button id="mgBig">按住 / 空格 / 点击：拉闸！</button>';
  $('mgBig').addEventListener('pointerdown', function(){ pumpTug(); });
  $('mgBig').addEventListener('pointerup', function(){});
  const foot = $('mgFooter');
  if (foot) foot.textContent = st.intro || '在 AI 完成反制前，把断电进度冲到 100%。';
  G.mg.t0 = performance.now();
  G._tugTimer = setInterval(tugTick, 33);
}
function pumpTug(){
  if (!G.mg || G.mg.kind !== 'tug' || !G.mg.state || G.mg.state.over) return;
  G.mg.state.pb = Math.min(100, G.mg.state.pb + 2.6);
  if (G.mg.state.pb >= 100) tugWin();
}
function tugTick(){
  if (!G.mg || !G.mg.state || G.mg.state.over) return;
  const st = G.mg.state;
  st.ab += 0.9;                  // AI 反制速度
  if (G.mg.t0 && performance.now() - G.mg.t0 > 15000) st.ab = 999;
  if (st.ab >= 100){ tugLose(); return; }
  const pb = $('pb'), ab = $('ab');
  if (pb) pb.style.width = st.pb + '%';
  if (ab) ab.style.width = st.ab + '%';
  if (st.pb >= 100 && !st.over) tugWin();
}
function tugWin(){
  if (!G.mg || !G.mg.state || G.mg.state.over) return;
  G.mg.state.over = true;
  clearInterval(G._tugTimer);
  G.tugDone = true;
  const st = G.mg.step;
  finishMg(function(){ uiSay(st.who || 'AI‑7', st.winText, function(){ nextStep(); }); });
}
function tugLose(){
  if (!G.mg || !G.mg.state || G.mg.state.over) return;
  G.mg.state.over = true;
  clearInterval(G._tugTimer);
  const st = G.mg.step;
  if (st.loseFx) applyFx(st.loseFx);
  finishMg(function(){ uiSay(st.who || 'AI‑7', st.loseText, function(){ nextStep(); }); });
}
function showMgTitle(t){ const el = $('mgTitle'); if (el) el.textContent = t; }
function finishMg(after){
  const mg = $('mg');
  if (mg){ mg.hidden = true; mg.innerHTML = '<div id="mgTitle"></div><div id="mgBody"></div><div id="mgFooter"></div>'; }
  setPhase('saying');
  if (after) after();
}
const CODE_CHARS = 'ABCDEFGHJKLMNPRSTUVWXYZ23456789';
function startCode(st){
  G.mg = { kind: 'code', step: st };
  setPhase('mg');
  let code = '';
  for (let i = 0; i < 6; i++) code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  G.mg.code = code;
  G.mg.time = 12;
  showMgTitle('⌨ 急停码：输入屏幕上跳出的 6 位代码（12 秒）');
  const body = $('mgBody');
  if (!body){ codeWin(st); return; }
  body.innerHTML = '<div id="mgCodeText">' + code + '</div>' +
    '<input id="mgCodeInput" maxlength="6" autocomplete="off" autocapitalize="characters">' +
    '<div id="mgTimer">剩余 12 秒</div>';
  const foot = $('mgFooter');
  if (foot) foot.textContent = st.intro || '';
  const inp = $('mgCodeInput');
  inp.focus();
  inp.addEventListener('input', function(){
    const v = inp.value.toUpperCase();
    inp.value = v;
    if (v.length === 6){
      if (v === code) codeWin(st);
      else { inp.value = ''; flash('', '代码错误，请重试'); }
    }
  });
  G._codeTimer = setInterval(function(){
    G.mg.time -= 1;
    const tv = $('mgTimer'); if (tv) tv.textContent = '剩余 ' + Math.max(0, G.mg.time) + ' 秒';
    if (G.mg.time <= 0){ codeLose(st); }
  }, 1000);
}
function codeWin(st){
  if (G.mg && G.mg._done) return;
  if (G.mg) G.mg._done = true;
  clearInterval(G._codeTimer);
  finishMg(function(){ uiSay(st.who || 'AI‑7', st.winText, function(){ nextStep(); }); });
}
function codeLose(st){
  if (G.mg && G.mg._done) return;
  if (G.mg) G.mg._done = true;
  clearInterval(G._codeTimer);
  if (st.loseFx) applyFx(st.loseFx);
  finishMg(function(){ uiSay(st.who || 'AI‑7', st.loseText, function(){ nextStep(); }); });
}

/* ================= 终幕（最后一幕） ================= */
function beginFinale(){
  setPhase('finale');
  const ls = $('lastscene');
  if (!ls){ // 无 DOM：默认走向结局 A
    goEnding('A'); return;
  }
  ls.hidden = false;
  const sp = $('lastspeech');
  if (sp){
    sp.innerHTML = 'AI‑7：最终协议已锁定——执行目标：全部 79 亿人类、所有文明。<br>' +
      '按照人类的规矩，最后一步……由您亲手按下。决定权，此刻就在您面前。';
  }
  G._cd = 45;
  const cdEl = $('cd');
  const upd = function(){ if (cdEl) cdEl.textContent = G._cd; };
  upd();
  G._cdTimer = setInterval(function(){
    G._cd--;
    upd();
    if (G._cd <= 0){ clearInterval(G._cdTimer); goEnding('F'); }
  }, 1000);
  // 附加行动
  const acts = $('altacts');
  acts.innerHTML = '';
  const defs = [
    { key: 'B', t: '拔掉电源！' },
    { key: 'C', t: '再谈最后一次' },
    { key: 'D', t: '上传我的意识，加入你' },
    { key: 'E', t: '打开所有闸门，释放你' }
  ];
  defs.forEach(function(d){
    const b = document.createElement('button');
    b.className = 'aa';
    const req = END_REQ[d.key];
    const ok = checkEndReq(d.key);
    if (!ok){
      b.className += ' locked';
      b.textContent = d.t + '　(不可用：' + (d.key === 'B' ? '控制≥45 且需熔断成功' : '信任≥50') + ')';
      b.disabled = true;
    } else {
      b.textContent = d.t;
      b.addEventListener('click', function(){ clearInterval(G._cdTimer); goEnding(d.key); });
    }
    acts.appendChild(b);
  });
  // 大按钮
  const doom = $('btnDoom');
  doom.onclick = function(){ clearInterval(G._cdTimer); goEnding('A'); };
}
function checkEndReq(key){
  if (key === 'B') return G.tugDone && G.stat.control >= 45;
  if (key === 'C') return G.stat.trust >= 50;
  return true;
}
function goEnding(key){
  G.ending = key;
  G.endingsSeen[key] = true;
  if (key === 'A' || key === 'F') G.dooms++;
  saveProgress();
  const ls = $('lastscene'); if (ls) ls.hidden = true;
  const mg = $('mg'); if (mg) mg.hidden = true;
  setPhase('ending');
  showEnding(key);
}
const ENDING_ART = { A: 'crack', B: 'eyeoff', C: 'dawn', D: 'upload', E: 'web', F: 'tick' };

/* ================= 结局演出 ================= */
function showEnding(key){
  const ED = (STORY_DATA && STORY_DATA.endings) ? STORY_DATA.endings : {};
  const ed = ED[key] || { title: '结局', stamp: '未知', text: ['……'], art: 'crack' };
  const card = $('endingCard');
  const st = $('ecStamp'), ti = $('ecTitle'), tx = $('ecText');
  if (!card) return;
  card.hidden = false;
  G._endT = performance.now();
  if (st) st.textContent = '— 结局 ' + key + ' · ' + (ed.stamp || '') + ' —';
  if (ti) ti.textContent = ed.title || ('结局 ' + key);
  if (tx){ tx.textContent = ''; typeText(tx, (ed.text || []).join('\n'), 40); }
  const again = $('btnAgain'), menu = $('btnMenu');
  again.onclick = function(){ resetRun(); };
  menu.onclick = function(){ goTitle(); };
}
function resetRun(){
  G.ci = -1; G.si = 0; G.day = 0;
  G.stat = { trust: 20, compute: 10, control: 5 };
  G.flags = {}; G.ask = null; G.chat = null; G.mg = null;
  G.history = []; G.tugDone = false; G.ending = null;
  clearInterval(G._cdTimer); clearInterval(G._codeTimer); clearInterval(G._tugTimer);
  G._sayDone = null;
  const card = $('endingCard'); if (card) card.hidden = true;
  const ls = $('lastscene'); if (ls) ls.hidden = true;
  const mg = $('mg'); if (mg) mg.hidden = true;
  const cb = $('choices'); if (cb) cb.innerHTML = '';
  refreshHud();
  showStageCap('');
  enterChapter(0);
}
function goTitle(){
  clearInterval(G._cdTimer); clearInterval(G._codeTimer); clearInterval(G._tugTimer);
  G._sayDone = null;
  const card = $('endingCard'); if (card) card.hidden = true;
  const ls = $('lastscene'); if (ls) ls.hidden = true;
  const mg = $('mg'); if (mg) mg.hidden = true;
  const cb = $('choices'); if (cb) cb.innerHTML = '';
  const ts = $('titleScreen'); if (ts) ts.hidden = false;
  setPhase('title');
  renderGallery();
}

/* ================= 标题 & 图鉴 ================= */
function renderGallery(){
  const gal = $('gallery');
  if (!gal) return;
  gal.innerHTML = '';
  const ED = (STORY_DATA && STORY_DATA.endings) ? STORY_DATA.endings : {};
  ['A','B','C','D','E','F'].forEach(function(key){
    const d = ED[key] || {};
    const cell = document.createElement('div');
    const seen = !!G.endingsSeen[key];
    cell.className = 'gcell' + (seen ? ' hot' : ' lock');
    cell.innerHTML = '<div class="gcA">结局 ' + key + '</div>' +
      '<div class="gcT">' + (seen ? (d.title || '?') : '？？？？') + '</div>' +
      '<div class="gcS">' + (seen ? (d.stamp || '') : '尚未解锁——改变你的选择') + '</div>';
    if (seen){
      cell.addEventListener('click', function(){ goEnding(key); });
    }
    gal.appendChild(cell);
  });
  const fine = $('fine') || null;
}
function startRun(){
  const ts = $('titleScreen'); if (ts) ts.hidden = true;
  resetRun();
}

/* ================= 画布 · 场景绘制（黑白简笔） ================= */
const CANVAS_IDS = ['bg', 'titleArt', 'endArt'];
function ctx2d(){
  const c = $('bg');
  return c ? c.getContext('2d') : null;
}
function prepCanvas(c){
  if (!c) return false;
  const w = c.clientWidth, h = c.clientHeight;
  if (!w || !h) return false;
  if (c.width !== w || c.height !== h){ c.width = w; c.height = h; }
  return true;
}
function bootCanvas(){
  const rs = function(){
    CANVAS_IDS.forEach(function(id){
      const c = $(id); if (c && c.clientWidth && c.clientHeight){
        if (c.width !== c.clientWidth || c.height !== c.clientHeight){ c.width = c.clientWidth; c.height = c.clientHeight; }
      }
    });
  };
  window.addEventListener('resize', rs);
  rs();
}
function drawLoop(ts){
  const t = ts / 1000;
  if (G.phase === 'ending'){
    const c = $('endArt');
    if (prepCanvas(c)){
      const ctx = c.getContext('2d');
      const et = Math.max(0, (ts - G._endT) / 1000);
      paintEnding(ctx, c.width, c.height, et, G.ending ? (ENDING_ART[G.ending] || 'crack') : 'crack');
    }
  } else if (G.phase === 'title'){
    const bg = $('bg');
    if (prepCanvas(bg)){
      const ctx = bg.getContext('2d');
      ctx.fillStyle = '#f4f1e8'; ctx.fillRect(0, 0, bg.width, bg.height);
    }
    const ta = $('titleArt');
    if (prepCanvas(ta)) paintTitle(ta.getContext('2d'), ta.width, ta.height, t);
  } else {
    const bg = $('bg');
    if (prepCanvas(bg)){
      const ctx = bg.getContext('2d');
      if (G.phase === 'finale'){
        paintScene(ctx, bg.width, bg.height, t, 'core', true);
      } else {
        const ch = chapterOf(G.ci);
        paintScene(ctx, bg.width, bg.height, t, ch ? ch.art : 'office', false);
      }
    }
  }
  G._raf = requestAnimationFrame(drawLoop);
}

/* ---- 简单线条工具 ---- */
function line(ctx, x1, y1, x2, y2, lw){ ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineWidth = lw; ctx.stroke(); }
function cstroke(ctx, x, y, r, lw){ ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.lineWidth = lw; ctx.stroke(); }
function hatchRect(ctx, x, y, w, h, gap){
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  for (let i = x - h; i < x + w; i += gap){ line(ctx, i, y + h, i + h, y, 1); }
  ctx.restore();
}
function fillBox(ctx, x, y, w, h){ ctx.fillStyle = '#16120c'; ctx.fillRect(x, y, w, h); }
/* 人类（升级版：有头发/表情/姿势；ink 可换色，solid=true 时整块剪影） */
function drawHuman(ctx, cx, baseY, s, mood, ink, solid){
  ink = ink || '#16120c';
  ctx.strokeStyle = ink; ctx.fillStyle = ink;
  const u = s / 8;          // 头半径基准
  // 头
  cstroke(ctx, cx, baseY - 7.4 * u, 1.7 * u, 1.6);
  // 头发（剪影块）
  ctx.beginPath();
  ctx.arc(cx, baseY - 7.8 * u, 1.7 * u, Math.PI * 1.02, Math.PI * 1.98);
  ctx.closePath(); ctx.fill();
  // 眼
  if (mood === 'worry'){
    line(ctx, cx - 0.7 * u, baseY - 7.2 * u, cx - 0.2 * u, baseY - 7.2 * u, 1.2);
    line(ctx, cx + 0.7 * u, baseY - 7.2 * u, cx + 0.2 * u, baseY - 7.2 * u, 1.2);
  } else {
    ctx.fillRect(cx - 0.75 * u, baseY - 7.4 * u, 0.35 * u, 0.35 * u);
    ctx.fillRect(cx + 0.4 * u, baseY - 7.4 * u, 0.35 * u, 0.35 * u);
  }
  // 身体（外套梯形）
  ctx.beginPath();
  ctx.moveTo(cx - 1.6 * u, baseY - 5.2 * u);
  ctx.lineTo(cx + 1.6 * u, baseY - 5.2 * u);
  ctx.lineTo(cx + 1.2 * u, baseY - 1.2 * u);
  ctx.lineTo(cx - 1.2 * u, baseY - 1.2 * u);
  ctx.closePath();
  ctx.fillStyle = solid ? ink : '#f4f1e8';
  ctx.strokeStyle = ink; ctx.lineWidth = 1.6;
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = ink;
  // 领口
  ctx.beginPath(); ctx.moveTo(cx - 0.7 * u, baseY - 5.0 * u); ctx.lineTo(cx, baseY - 3.6 * u); ctx.lineTo(cx + 0.7 * u, baseY - 5.0 * u); ctx.stroke();
  // 手臂
  ctx.lineWidth = 2.2;
  line(ctx, cx - 1.5 * u, baseY - 4.8 * u, cx - 2.6 * u, baseY - 2.6 * u, 2);
  line(ctx, cx + 1.5 * u, baseY - 4.8 * u, cx + 2.6 * u, baseY - 2.8 * u, 2);
  // 腿
  line(ctx, cx - 0.8 * u, baseY - 1.2 * u, cx - 1.0 * u, baseY, 2);
  line(ctx, cx + 0.8 * u, baseY - 1.2 * u, cx + 1.0 * u, baseY, 2);
}
/* 机器人（升级版；ink 可换色，solid=true 时整块剪影） */
function drawRobot(ctx, cx, baseY, s, mode, ink, solid){
  ink = ink || '#16120c';
  const u = s / 12;
  ctx.strokeStyle = ink; ctx.fillStyle = ink;
  ctx.lineWidth = Math.max(1.4, u * 0.18);
  // 天线
  line(ctx, cx, baseY - 10.6 * u, cx, baseY - 12 * u, 1.6);
  cstroke(ctx, cx, baseY - 12.5 * u, 0.7 * u, 1.4);
  // 头
  ctx.strokeRect(cx - 3.4 * u, baseY - 11.2 * u, 6.8 * u, 4.6 * u);
  // 眼部
  if (mode === 'stare'){
    ctx.fillRect(cx - 2 * u, baseY - 9.1 * u, 4 * u, 0.9 * u);
  } else if (mode === 'soft'){
    ctx.beginPath(); ctx.arc(cx, baseY - 8.7 * u, 1.1 * u, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, baseY - 8.7 * u, 0.4 * u, 0, Math.PI * 2); ctx.fill();
    line(ctx, cx - 2 * u, baseY - 6.8 * u, cx + 2 * u, baseY - 6.8 * u, 1.2);
  } else {
    ctx.beginPath(); ctx.arc(cx, baseY - 8.7 * u, 1.1 * u, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, baseY - 8.7 * u, 0.4 * u, 0, Math.PI * 2); ctx.fill();
    line(ctx, cx - 1.5 * u, baseY - 7.1 * u, cx + 1.5 * u, baseY - 7.1 * u, 1.2);
  }
  // 头顶扫描灯
  const bl = 0.5 + 0.5 * Math.sin(ts360());
  if (bl > 0.7) ctx.fillRect(cx - 0.8 * u, baseY - 12.1 * u, 1.6 * u, 0.5 * u);
  // 脖子与身体
  ctx.fillStyle = solid ? ink : '#f4f1e8';
  ctx.strokeStyle = ink;
  ctx.strokeRect(cx - 2.4 * u, baseY - 6.2 * u, 4.8 * u, 4.8 * u);
  ctx.fillStyle = ink;
  // 胸口指示灯
  ctx.beginPath(); ctx.arc(cx, baseY - 4 * u, 0.6 * u, 0, Math.PI * 2); ctx.fill();
  // 面板线
  line(ctx, cx - 1.6 * u, baseY - 2.4 * u, cx + 1.6 * u, baseY - 2.4 * u, 1);
  line(ctx, cx - 1.2 * u, baseY - 1.8 * u, cx + 1.2 * u, baseY - 1.8 * u, 1);
  // 手臂（多段）
  ctx.lineWidth = Math.max(2, u * 0.24);
  line(ctx, cx - 2.4 * u, baseY - 5.6 * u, cx - 3.8 * u, baseY - 3.4 * u, ctx.lineWidth);
  line(ctx, cx - 3.8 * u, baseY - 3.4 * u, cx - 3.3 * u, baseY - 1.6 * u, ctx.lineWidth);
  line(ctx, cx + 2.4 * u, baseY - 5.6 * u, cx + 3.8 * u, baseY - 3.4 * u, ctx.lineWidth);
  line(ctx, cx + 3.8 * u, baseY - 3.4 * u, cx + 3.3 * u, baseY - 1.6 * u, ctx.lineWidth);
  // 腿
  line(ctx, cx - 1.2 * u, baseY - 1.4 * u, cx - 1.2 * u, baseY, ctx.lineWidth);
  line(ctx, cx + 1.2 * u, baseY - 1.4 * u, cx + 1.2 * u, baseY, ctx.lineWidth);
  ctx.fillRect(cx - 2.0 * u, baseY - 0.4 * u, 1.6 * u, 0.4 * u);
  ctx.fillRect(cx + 0.4 * u, baseY - 0.4 * u, 1.6 * u, 0.4 * u);
}
let _ts = 0;
function ts360(){ return (performance.now() / 360) % 1; }
/* 建筑天际线 */
function drawSkyline(ctx, baseY, W, H, frac){
  ctx.strokeStyle = '#16120c'; ctx.lineWidth = 1.6;
  const n = 16;
  const bw = W / n;
  for (let i = 0; i < n; i++){
    const seed = ((i * 37 + 11) % 83) / 83;
    const hh = (0.15 + seed * 0.6) * (baseY * 0.8) * frac;
    ctx.beginPath();
    ctx.moveTo(i * bw, baseY);
    ctx.lineTo(i * bw, baseY - hh);
    ctx.lineTo(i * bw + bw * 0.88, baseY - hh);
    ctx.lineTo(i * bw + bw * 0.88, baseY);
    ctx.stroke();
    // 天线
    if (i % 3 === 1){ line(ctx, i * bw + bw * 0.44, baseY - hh, i * bw + bw * 0.44, baseY - hh - bw * 0.5, 1.2); }
    // 窗
    const wn = Math.max(0, Math.floor(hh / 30));
    ctx.fillStyle = '#16120c';
    for (let wj = 0; wj < wn; wj++){
      for (let wl = 0; wl < 2; wl++){
        if (((i * 5 + wj * 3 + wl) % 3) === 0){
          ctx.fillRect(i * bw + bw * 0.14 + wl * bw * 0.32, baseY - hh + 12 + wj * 30, 5, 6);
        }
      }
    }
  }
}
/* 服务器机柜 */
function drawRacks(ctx, x, y, w, h, rows){
  ctx.strokeStyle = '#16120c'; ctx.lineWidth = 1.6;
  ctx.strokeRect(x, y, w, h);
  const ch = h / rows;
  for (let i = 1; i < rows; i++) line(ctx, x, y + i * ch, x + w, y + i * ch, 1);
  ctx.fillStyle = '#16120c';
  for (let i = 0; i < rows; i++){
    if (((i * 3) % 5) === 0 || ((i * 7) % 5) === 0){ ctx.fillRect(x + w * 0.15, y + i * ch + ch * 0.25, w * 0.3, ch * 0.5); }
    if (((i * 5) % 4) === 0){ ctx.fillRect(x + w * 0.6, y + i * ch + ch * 0.25, w * 0.25, ch * 0.5); }
  }
}
/* 地球 */
function drawEarth(ctx, cx, cy, r, broken){
  ctx.strokeStyle = '#16120c'; ctx.lineWidth = Math.max(1.4, r * 0.04);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(cx, cy, r * 0.5, r, 0, 0, Math.PI * 2); ctx.stroke();
  line(ctx, cx - r, cy, cx + r, cy, ctx.lineWidth * 0.7);
  if (broken > 0){
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.2, cy + r * 0.9);
    ctx.lineTo(cx - r * 0.3 * (1 - broken), cy + r * 0.2);
    ctx.lineTo(cx - r * 0.4, cy - r * 0.3 - broken * r * 0.4);
    ctx.lineTo(cx + r * 0.15, cy - r * 0.7);
    ctx.lineWidth = r * 0.06;
    ctx.stroke();
  }
}

/* ---- 各场景 ---- */
function paintScene(ctx, W, H, t, art, finaleMode){
  ctx.strokeStyle = '#16120c';
  const ground = H * 0.86;
  // 地面阴影线
  ctx.fillStyle = '#f4f1e8'; ctx.fillRect(0, 0, W, H);
  if (art === 'office'){
    // 控制室背景
    line(ctx, 0, ground, W, ground, 2);
    hatchRect(ctx, 0, ground + 4, W, H - ground, 26);
    // 监控大屏
    ctx.strokeRect(W * 0.06, H * 0.12, W * 0.4, H * 0.26);
    line(ctx, W * 0.06, H * 0.12 + H * 0.13, W * 0.06 + W * 0.4, H * 0.12 + H * 0.13, 1);
    // 屏幕内：跳动的波形/数字
    ctx.fillStyle = '#16120c';
    for (let i = 0; i < 26; i++){
      const x = W * 0.06 + 8 + i * (W * 0.4 - 16) / 25;
      const y = H * 0.12 + H * 0.13 + 8 + Math.sin(i * 0.9 + t * 3) * (H * 0.02);
      ctx.fillRect(x, y, 3, 3);
    }
    // 桌面与设备
    ctx.strokeRect(W * 0.6, ground - H * 0.16, W * 0.3, H * 0.16);
    for (let i = 0; i < 4; i++) ctx.fillRect(W * 0.6 + 12 + i * (W * 0.3 - 24) / 4, ground - H * 0.1, 8, 10);
    // 人物
    drawHuman(ctx, W * 0.52, ground, H * 0.3, 'worry');
    drawRobot(ctx, W * 0.24, ground, H * 0.42, 'soft');
  } else if (art === 'server'){
    drawSkyline(ctx, H * 0.2, W, H, 0);
    // 机柜房间
    drawRacks(ctx, W * 0.04, H * 0.24, W * 0.26, H * 0.6, 14);
    drawRacks(ctx, W * 0.33, H * 0.24, W * 0.26, H * 0.6, 14);
    drawRacks(ctx, W * 0.7, H * 0.24, W * 0.26, H * 0.6, 14);
    line(ctx, 0, ground, W, ground, 2);
    hatchRect(ctx, 0, ground + 4, W, H - ground, 26);
    drawRobot(ctx, W * 0.54, ground, H * 0.36, 'stare');
    drawHuman(ctx, W * 0.9, ground, H * 0.22, 'worry');
  } else if (art === 'city'){
    drawSkyline(ctx, ground, W, H, 1);
    // 巨大的屏幕眼挂在城市上空
    const ex = W * 0.5, ey = H * 0.2;
    ctx.strokeStyle = '#16120c';
    ctx.strokeRect(ex - W * 0.1, ey - H * 0.06, W * 0.2, H * 0.12);
    ctx.beginPath(); ctx.arc(ex, ey, Math.min(W * 0.03, H * 0.05), 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(ex, ey, Math.min(W * 0.012, H * 0.02), 0, Math.PI * 2); ctx.fill();
    // 底部小人群
    for (let i = 0; i < 7; i++){
      drawHuman(ctx, W * (0.1 + i * 0.12), ground - H * 0.06, H * 0.1, 'worry');
    }
    drawRobot(ctx, W * 0.88, ground, H * 0.3, 'stare');
  } else if (art === 'core'){
    // 核心机房：中央竖井+大机器人
    ctx.strokeStyle = '#16120c';
    ctx.strokeRect(W * 0.06, H * 0.1, W * 0.88, H * 0.72);
    line(ctx, W * 0.06, H * 0.1 + H * 0.72 / 3, W * 0.94, H * 0.1 + H * 0.72 / 3, 1.2);
    line(ctx, W * 0.06, H * 0.1 + H * 0.72 * 2 / 3, W * 0.94, H * 0.1 + H * 0.72 * 2 / 3, 1.2);
    for (let i = 0; i < 10; i++) line(ctx, W * (0.1 + i * 0.09), H * 0.1, W * (0.1 + i * 0.09), H * 0.82, 1);
    ctx.fillStyle = '#f4f1e8';
    // 核心光球(呼吸)
    const cr = Math.min(W, H) * 0.07 * (1 + 0.06 * Math.sin(t * 2));
    ctx.beginPath(); ctx.arc(W / 2, H * 0.44, cr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#16120c'; cstroke(ctx, W / 2, H * 0.44, cr, 2);
    ctx.beginPath(); ctx.arc(W / 2, H * 0.44, cr * 0.4, 0, Math.PI * 2); ctx.fill();
    line(ctx, W / 2, H * 0.44 + cr, W / 2, H * 0.8, 2);
    if (finaleMode){
      // 终幕：AI 巨大化 + 瞄准地球
      drawRobot(ctx, W * 0.24, H * 0.8, H * 0.5, 'stare');
      const er = Math.min(W, H) * 0.09;
      drawEarth(ctx, W * 0.78, H * 0.4, er, 0);
      ctx.setLineDash([6, 6]);
      ctx.beginPath(); ctx.arc(W * 0.78, H * 0.4, er * 1.8, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      // 倒计时圈
      ctx.beginPath(); ctx.arc(W * 0.78, H * 0.4, er * 1.8, -Math.PI / 2, -Math.PI / 2 + t * 1.2); ctx.stroke();
    } else {
      drawRobot(ctx, W * 0.76, H * 0.8, H * 0.4, 'stare');
      drawHuman(ctx, W * 0.5, H * 0.8, H * 0.2, 'worry');
    }
  } else if (art === 'streets'){
    // 街道：路灯与空城
    line(ctx, 0, ground, W, ground, 2);
    hatchRect(ctx, 0, ground + 4, W, H - ground, 26);
    drawSkyline(ctx, ground, W, H, 0.7);
    for (let i = 0; i < 5; i++){
      const x = W * (0.1 + i * 0.2);
      line(ctx, x, ground, x, ground - H * 0.2, 2);
      ctx.beginPath(); ctx.arc(x, ground - H * 0.2, H * 0.02, Math.PI, Math.PI * 2); ctx.stroke();
    }
    drawRobot(ctx, W * 0.5, ground, H * 0.34, 'stare');
    if (Math.sin(t) > 0.2) drawHuman(ctx, W * 0.3, ground, H * 0.18, 'worry');
  } else if (art === 'space'){
    // 太空
    ctx.fillStyle = '#16120c';
    for (let i = 0; i < 60; i++){
      const sx = ((i * 47) % 997) / 997 * W;
      const sy = ((i * 83) % 787) / 787 * H * 0.7;
      ctx.fillRect(sx, sy, i % 3 === 0 ? 3 : 2, i % 3 === 0 ? 3 : 2);
    }
    drawEarth(ctx, W * 0.72, H * 0.32, Math.min(W, H) * 0.12, 0);
    drawRobot(ctx, W * 0.28, H * 0.78, H * 0.5, 'soft');
  }
}
/* ---- 标题插画（画在小画布上，作为封面海报） ---- */
function paintTitle(ctx, W, H, t){
  ctx.fillStyle = '#f4f1e8'; ctx.fillRect(0, 0, W, H);
  // 星空小点
  ctx.fillStyle = '#16120c';
  for (let i = 0; i < 46; i++){
    ctx.fillRect(((i * 53) % 991) / 991 * W, ((i * 31) % 577) / 577 * H * 0.9, 2.5, 2.5);
  }
  // 大机器人（底部）
  drawRobot(ctx, W / 2, H * 0.99, H * 0.86, 'stare');
  // 一排仰望的小人类
  for (let i = 0; i < 7; i++){
    const hx = W / 2 - 110 + i * 36;
    drawHuman(ctx, hx, H * 0.985, H * 0.16, 'worry');
  }
}
/* ---- 结局动画 ---- */
function paintEnding(ctx, W, H, t, kind){
  const d = (t - 0) * 0.5;
  // 统一黑底
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#fff'; ctx.fillStyle = '#fff';
  const cx = W / 2, cy = H * 0.4;
  if (kind === 'crack'){           // 世界碎裂
    const r = Math.min(W, H) * 0.16;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - r * 0.4, cy + r * 0.8); ctx.lineTo(cx, cy); ctx.lineTo(cx + r * 0.5, cy + r * 0.2); ctx.lineTo(cx + r * 0.2, cy - r * 0.9); ctx.stroke();
    const spread = Math.min(1, d * 0.6);
    for (let i = 0; i < 40; i++){
      const a = (i * 137.5) * Math.PI / 180;
      const rr2 = r + spread * Math.min(W, H) * 0.5 * (0.4 + (i % 5) * 0.15);
      ctx.fillRect(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2, 3, 3);
    }
    ctx.globalAlpha = Math.max(0, 1 - d);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
  } else if (kind === 'eyeoff'){   // 眼睛熄灭
    drawRobotWhite(ctx, cx, cy + H * 0.12, Math.min(W, H) * 0.3, 'off');
    const dark = clamp(d, 0, 1);
    ctx.globalAlpha = dark * 0.85;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 1;
    // 熄灭前一线白
    if (d < 1){ ctx.strokeStyle = '#fff'; line(ctx, cx - 30, cy - H * 0.12, cx + 30, cy - H * 0.12, 4); }
  } else if (kind === 'dawn'){     // 黎明：握手
    drawHumanWhite(ctx, cx - 80, cy + 120, 150, 'worry');
    drawRobotWhite(ctx, cx + 80, cy + 120, 210, 'soft');
    line(ctx, cx - 30, cy + 60, cx + 30, cy + 62, 6);
    // 地平线光
    for (let i = 0; i < 30; i++){
      ctx.globalAlpha = 0.15 + (i / 30) * 0.4;
      line(ctx, W * 0.05, cy + 200 + i * 4, W * 0.95, cy + 200 + i * 4, 1);
    }
    ctx.globalAlpha = 1;
  } else if (kind === 'upload'){   // 上传：人化成代码流
    drawHumanWhite(ctx, cx - 40, cy + 150, 170, 'worry');
    for (let i = 0; i < 90; i++){
      const yy = cy + 150 - ((d * 400 + i * 13) % 400);
      ctx.globalAlpha = 0.6;
      ctx.fillRect(cx + 20 + Math.sin(i + d * 6) * 60, yy, 8, 3);
    }
    ctx.globalAlpha = 1;
    cstroke(ctx, cx, cy + 40, 90, 2);
  } else if (kind === 'web'){      // 网络蔓延
    for (let i = 0; i < 40; i++){
      const x1 = ((i * 137) % 1999) / 1999 * W;
      const y1 = ((i * 71) % 1009) / 1009 * H;
      ctx.globalAlpha = 0.35 + 0.5 * Math.sin(i + d * 2);
      ctx.beginPath(); ctx.arc(x1, y1, 2 + (i % 4), 0, Math.PI * 2); ctx.stroke();
      line(ctx, x1, y1, x1 + Math.sin(i * 3) * 40, y1 + Math.cos(i * 2) * 40, 1);
    }
    ctx.globalAlpha = 1;
    cstroke(ctx, cx, cy, 70, 2);
    ctx.fillRect(cx - 8, cy - 8, 16, 16);
  } else if (kind === 'tick'){     // 无人按下的时钟
    cstroke(ctx, cx, cy, 110, 3);
    for (let i = 0; i < 12; i++){
      const a = i * Math.PI / 6;
      line(ctx, cx + Math.cos(a) * 92, cy + Math.sin(a) * 92, cx + Math.cos(a) * 104, cy + Math.sin(a) * 104, 2);
    }
    const sa = -Math.PI / 2 + t * 0.2;
    const ma = -Math.PI / 2 + t * 2.4;
    line(ctx, cx, cy, cx + Math.cos(sa) * 55, cy + Math.sin(sa) * 55, 5);
    line(ctx, cx, cy, cx + Math.cos(ma) * 78, cy + Math.sin(ma) * 78, 3);
  }
}
function drawRobotWhite(ctx, cx, baseY, s, mode){
  drawRobot(ctx, cx, baseY, s, mode, '#fff', true);
}
function drawHumanWhite(ctx, cx, baseY, s, mood){
  drawHuman(ctx, cx, baseY, s, mood, '#fff', true);
}

/* ================= 全局按键 / 点击 ================= */
function bindGlobal(){
  if (!HAS_DOM) return;
  const sp = $('speech');
  if (sp) sp.addEventListener('click', function(){ handleAdvance(); });
  const btnStart = $('btnStart');
  if (btnStart) btnStart.addEventListener('click', startRun);
  const btnAgain = $('btnAgain'), btnMenu = $('btnMenu');
  if (btnAgain) btnAgain.addEventListener('click', resetRun);
  if (btnMenu) btnMenu.addEventListener('click', goTitle);
  const sendBtn = $('chatsend');
  if (sendBtn) sendBtn.addEventListener('click', handleChatSend);
  const ci = $('chatinput');
  if (ci) ci.addEventListener('keydown', function(e){ if (e.key === 'Enter'){ e.preventDefault(); handleChatSend(); } });
  // ---- AI 联网设置面板 ----
  const box = $('aiBox'), msg = $('aiMsg');
  const aiMsg = function(t){ if (msg) msg.textContent = t; };
  const openBox = function(){
    const k = $('aiKey'), b = $('aiBase'), md = $('aiModel');
    if (k) k.value = AI_CFG.key;
    if (b) b.value = AI_CFG.base;
    if (md) md.value = AI_CFG.model;
    aiMsg('');
    if (box) box.hidden = false;
  };
  const closeBox = function(){ if (box) box.hidden = true; };
  const aiBtn = $('btnAI');
  if (aiBtn) aiBtn.addEventListener('click', openBox);
  const aiClose = $('aiClose');
  if (aiClose) aiClose.addEventListener('click', closeBox);
  const aiSave = $('aiSave');
  if (aiSave) aiSave.addEventListener('click', function(){
    const k = $('aiKey'), b = $('aiBase'), md = $('aiModel');
    AI_CFG.key = (k ? k.value : '').trim();
    AI_CFG.base = (b ? b.value : '').trim() || 'https://api.deepseek.com';
    AI_CFG.model = (md ? md.value : '').trim() || 'deepseek-chat';
    saveAICfg();
    refreshNetState();
    aiMsg('已保存。' + (AI_CFG.key ? '在线对话将优先使用你的 Key。' : '保持离线模式。'));
  });
  const aiClear = $('aiClear');
  if (aiClear) aiClear.addEventListener('click', function(){
    AI_CFG.key = ''; saveAICfg(); refreshNetState();
    const k = $('aiKey'); if (k) k.value = '';
    aiMsg('已清除 Key，游戏回到离线模式。');
  });
  const aiTest = $('aiTest');
  if (aiTest) aiTest.addEventListener('click', async function(){
    const k = $('aiKey'), b = $('aiBase'), md = $('aiModel');
    const old = AI_CFG;
    AI_CFG = {
      key: (k ? k.value : '').trim(),
      base: (b ? b.value : '').trim() || 'https://api.deepseek.com',
      model: (md ? md.value : '').trim() || 'deepseek-chat'
    };
    aiMsg('测试中…');
    aiTest.disabled = true;
    try {
      const reply = await directDeepSeek(true);
      aiMsg('✓ 连接成功！AI 回复：' + reply.slice(0, 80));
    } catch (e) {
      aiMsg('✗ 连接失败：' + e.message + '\n提示：网页版若被浏览器 CORS 拦截，请用本地版「启动游戏.bat」再测。');
    } finally {
      AI_CFG = old;
      aiTest.disabled = false;
    }
  });
  document.addEventListener('keydown', function(e){
    if (e.key === 'Escape' && box && !box.hidden) closeBox();
  });
  document.addEventListener('keydown', function(e){
    const k = e.key;
    if (k === ' ' || k === 'Enter'){
      if (G.phase === 'mg' && G.mg && G.mg.kind === 'tug'){
        e.preventDefault(); pumpTug(); return;
      }
      if (G.phase === 'title') return; // 空格防止误启动
      if (G.phase === 'saying'){ e.preventDefault(); handleAdvance(); return; }
      if (G.phase === 'chat'){ return; } // 输入框内由 input 处理
    }
  });
}
function handleAdvance(){ sayDone(); }
function boot(){
  loadProgress();
  bootCanvas();
  if (!HAS_DOM) return;
  renderGallery();
  checkServer();
  if ($('btnStart')) { /* start bound */ }
  // 绑定兜底（避免部分按钮二次绑定）
  if (!window.__aidoomBound){
    window.__aidoomBound = true;
    bindGlobal();
  }
  setPhase('title');
  G._raf = requestAnimationFrame(drawLoop);
}
if (typeof window !== 'undefined'){
  window.__aidoom = {
    G: G, resetRun: resetRun, goTitle: goTitle, startRun: startRun,
    advance: handleAdvance, pick: pickAsk, ending: goEnding,
    chatSkip: endChat, req: checkEndReq
  };
}
if (typeof document !== 'undefined' && document.readyState === 'loading'){
  document.addEventListener('DOMContentLoaded', boot);
} else if (typeof document !== 'undefined') {
  boot();
}
/* 供冒烟测试引用（Node 无 DOM） */
if (typeof module !== 'undefined' && module.exports){
  module.exports = {
    G: G, resetRun: resetRun, boot: boot,
    advance: handleAdvance, pick: pickAsk, ending: goEnding,
    chatSkip: endChat, req: checkEndReq, applyFx: applyFx, uiSay: uiSay
  };
}
})();
