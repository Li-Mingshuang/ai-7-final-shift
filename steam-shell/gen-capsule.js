// gen-capsule.js —— 生成 Steam/itch 黑白占位宣传图（纯 Node，无依赖）
// 用法：node gen-capsule.js   产出：capsule_616x353.png / capsule_231x87.png / capsule_460x215.png
'use strict';
const zlib = require('zlib');
const fs = require('fs');

// ---------- 极简 PNG 编码器 ----------
function crc32(buf){
  let c, table = crc32.t || (crc32.t = (function(){
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++){
      c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })());
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data){
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function writePng(path, w, h, rgba){
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8bit RGBA
  const raw = Buffer.alloc(h * (1 + w * 4));
  const src = Buffer.from(rgba.buffer, rgba.byteOffset, rgba.byteLength);
  for (let y = 0; y < h; y++){
    raw[y * (1 + w * 4)] = 0;
    src.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  fs.writeFileSync(path, Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', Buffer.alloc(0))
  ]));
  console.log('  -> ' + path + ' (' + w + 'x' + h + ')');
}

// ---------- 画布（逻辑分辨率 224x128，最近邻放大到任意尺寸） ----------
const LW = 224, LH = 128;
const PAPER = [244, 241, 232], INK = [22, 18, 12];
function makeCanvas(){ return new Uint8Array(LW * LH * 4).fill(255); }
function put(canvas, x, y, col){
  if (x < 0 || y < 0 || x >= LW || y >= LH) return;
  const i = (y * LW + x) * 4;
  canvas[i] = col[0]; canvas[i + 1] = col[1]; canvas[i + 2] = col[2]; canvas[i + 3] = 255;
}
function rect(canvas, x0, y0, x1, y1, col){ // 填充
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) put(canvas, x, y, col);
}
function rectB(canvas, x0, y0, x1, y1, t, col){
  rect(canvas, x0, y0, x1, y0 + t - 1, col);
  rect(canvas, x0, y1 - t + 1, x1, y1, col);
  rect(canvas, x0, y0, x0 + t - 1, y1, col);
  rect(canvas, x1 - t + 1, y0, x1, y1, col);
}
function hline(canvas, x0, x1, y, t, col){ rect(canvas, x0, y, x1, y + t - 1, col); }
function vline(canvas, x, y0, y1, t, col){ rect(canvas, x, y0, x + t - 1, y1, col); }

function drawScene(){
  const c = makeCanvas();
  // 底色
  rect(c, 0, 0, LW - 1, LH - 1, PAPER);
  // 星点
  const stars = [[12,14],[30,22],[200,12],[208,26],[160,8],[48,30],[88,10],[196,40]];
  stars.forEach(s => rect(c, s[0], s[1], s[0] + 1, s[1] + 1, INK));
  const cx = 112;
  // 天线
  vline(c, cx - 1, 18, 30, 2, INK);
  rectB(c, cx - 5, 14, cx + 4, 17, 1, INK);
  // 头(方形屏幕)
  rectB(c, cx - 40, 30, cx + 39, 78, 3, INK);
  // 大眼(凝视横线)
  rect(c, cx - 28, 52, cx + 27, 60, INK);
  // 嘴
  hline(c, cx - 14, cx + 13, 71, 2, INK);
  // 脖子
  rect(c, cx - 6, 79, cx + 5, 84, INK);
  // 身体
  rectB(c, cx - 30, 84, cx + 29, 118, 3, INK);
  // 胸口灯
  rect(c, cx - 5, 94, cx + 4, 101, INK);
  // 手臂(左右横臂)
  hline(c, cx - 52, cx - 40, 88, 6, INK);
  hline(c, cx + 39, cx + 51, 88, 6, INK);
  // 脚座
  rect(c, cx - 34, 118, cx - 4, 124, INK);
  rect(c, cx + 3, 118, cx + 33, 124, INK);
  // 底部一排小人头(仰望)
  for (let i = 0; i < 9; i++){
    const hx = cx - 88 + i * 22;
    put(c, hx, 116, INK); put(c, hx, 117, INK);
  }
  return c;
}
function upscale(canvas, w, h){
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++){
    const sy = Math.min(LH - 1, Math.floor(y * LH / h));
    for (let x = 0; x < w; x++){
      const sx = Math.min(LW - 1, Math.floor(x * LW / w));
      const si = (sy * LW + sx) * 4, di = (y * w + x) * 4;
      out[di] = canvas[si]; out[di + 1] = canvas[si + 1];
      out[di + 2] = canvas[si + 2]; out[di + 3] = 255;
    }
  }
  return out;
}

const scene = drawScene();
writePng('capsule_616x353.png', 616, 353, upscale(scene, 616, 353));
writePng('capsule_231x87.png', 231, 87, upscale(scene, 231, 87));
writePng('capsule_460x215.png', 460, 215, upscale(scene, 460, 215));
console.log('占位宣传图已生成。建议之后用 Canva/PS 替换为带游戏名的正式图。');
