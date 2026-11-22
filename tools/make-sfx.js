/* 基岩版主题的界面音效生成器（合成，不依赖任何素材 / 网络）。
 *
 * 基岩版原版 UI 音效是「木头石头按键」那种短促的 click：一段带通噪声 + 一个很短的木质低频，
 * 时长 60~90ms。这里用 WebAudio 的离线思路手写 PCM，导出 44.1kHz / 16bit / 单声道 WAV，
 * 单个文件只有几 KB，进 asar 不心疼。
 *
 * 用法：node tools/make-sfx.js [输出目录，默认 assets/sfx]
 * 产物：click.wav（主按钮）· tick.wav（次要/选项）· back.wav（关闭/返回）· launch.wav（启动游戏）
 */
const fs = require('fs');
const path = require('path');

const SR = 44100;
const OUT = process.argv[2] || path.join(__dirname, '..', 'assets', 'sfx');

function writeWav(file, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
  return buf.length;
}

/* 简易一阶带通（状态变量滤波器）：噪声塑形成「木石敲击」的中频段 */
function bandpass(sig, freq, q) {
  const w0 = 2 * Math.PI * freq / SR, alpha = Math.sin(w0) / (2 * q);
  const b0 = alpha, b2 = -alpha, a0 = 1 + alpha, a1 = -2 * Math.cos(w0), a2 = 1 - alpha;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  const out = new Float32Array(sig.length);
  for (let i = 0; i < sig.length; i++) {
    const x = sig[i];
    const y = (b0 * x + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1; x1 = x; y2 = y1; y1 = y; out[i] = y;
  }
  return out;
}

/* 一次敲击：噪声瞬态 + 两个衰减正弦（木腔共鸣） */
function knock(dur, opt) {
  const o = Object.assign({ noise: 0.55, tone: 190, tone2: 420, gain: 0.9, decay: 0.020 }, opt);
  const n = Math.round(SR * dur);
  const noise = new Float32Array(n);
  let seed = 1234567;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    noise[i] = (seed / 0x3fffffff - 1);
  }
  const bp = bandpass(noise, 1800, 1.1);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const envN = Math.exp(-t / (o.decay * 0.75));
    const envT = Math.exp(-t / (o.decay * 2.4));
    const s = bp[i] * o.noise * envN
      + Math.sin(2 * Math.PI * o.tone * t) * envT * 0.45 * o.tone
      + Math.sin(2 * Math.PI * o.tone2 * t) * envT * 0.22;
    /* 起音淡入 3ms，避免爆音 */
    const atk = Math.min(1, t / 0.003);
    out[i] = s * o.gain * atk * 0.55;
  }
  return out;
}

function concat(parts) {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

fs.mkdirSync(OUT, { recursive: true });
const made = [];

/* click：主按钮（启动游戏 / 大按钮），稍闷、稍长 */
made.push(['click.wav', concat([knock(0.10, { tone: 168, tone2: 380, decay: 0.022, gain: 0.85 })])]);
/* tick：次要按钮 / 列表行，短而脆 */
made.push(['tick.wav', concat([knock(0.065, { tone: 260, tone2: 620, decay: 0.014, gain: 0.6 })])]);
/* back：关闭 / 返回，双音向下 */
made.push(['back.wav', concat([
  knock(0.075, { tone: 240, tone2: 500, decay: 0.016, gain: 0.62 }),
  new Float32Array(Math.round(SR * 0.035)),
  knock(0.09, { tone: 180, tone2: 390, decay: 0.018, gain: 0.7 })
])]);
/* launch：启动游戏，三连上扬 */
made.push(['launch.wav', concat([
  knock(0.08, { tone: 200, tone2: 460, decay: 0.016, gain: 0.7 }),
  new Float32Array(Math.round(SR * 0.02)),
  knock(0.08, { tone: 260, tone2: 560, decay: 0.016, gain: 0.7 }),
  new Float32Array(Math.round(SR * 0.02)),
  knock(0.12, { tone: 330, tone2: 700, decay: 0.024, gain: 0.85 })
])]);

for (const [name, sig] of made) {
  const size = writeWav(path.join(OUT, name), sig);
  console.log('[SFX] ' + name.padEnd(11) + (size / 1024).toFixed(1) + ' KB');
}
console.log('[SFX] → ' + OUT);
