/* 从用户给的录音里抠出按钮点击音，写成 assets/sfx/*.wav
 *
 * 录音只有一次敲击（约 1.52s 处），其余是底噪。做法：按 1ms 包络找到主峰，
 * 往前留 15ms、往后留到能量衰减到峰值 -50dB 为止，峰值归一化到 0.9，
 * 加 1.5ms 淡入 + 收尾淡出，导出 44.1k/16bit/单声道 WAV。
 *
 * 用法：./node_modules/.bin/electron tools/make-sfx-from-mp3.js <input.mp3> [输出目录]
 */
'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const inPath = process.argv[2];
if (!inPath) { console.error('用法: electron tools/make-sfx-from-mp3.js <input.mp3> [outDir]'); app.exit(2); }
const OUT = process.argv[3] || path.join(__dirname, '..', 'assets', 'sfx');
fs.mkdirSync(OUT, { recursive: true });

const b64 = fs.readFileSync(inPath).toString('base64');

function writeWav(file, samples, sr) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
  }
  fs.writeFileSync(file, buf);
  return buf.length;
}

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('mute-audio');

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  await win.loadURL('data:text/html,<meta charset="utf-8"><body></body>');
  const raw = await win.webContents.executeJavaScript(`(async () => {
    const bin = atob("${b64}");
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const ac = new OfflineAudioContext(1, 1, 44100);
    const buf = await ac.decodeAudioData(u8.buffer);
    const ch = buf.getChannelData(0);
    // 转成 0..255 的定标字节传回来（float 数组序列化太胖）
    const s = new Array(ch.length);
    for (let i = 0; i < ch.length; i++) s[i] = ch[i];
    return JSON.stringify({ sr: buf.sampleRate, dur: buf.duration, samples: s });
  })()`);
  const d = JSON.parse(raw);
  const SR = d.sr, x = d.samples;
  console.log(`解码 ${d.dur.toFixed(2)}s @ ${SR}Hz`);

  // 1ms 包络
  const hop = Math.round(SR / 1000);
  const env = [];
  for (let i = 0; i + hop <= x.length; i += hop) {
    let s = 0;
    for (let j = 0; j < hop; j++) s += x[i + j] * x[i + j];
    env.push(Math.sqrt(s / hop));
  }
  let pk = 0, pkAt = 0;
  env.forEach((v, i) => { if (v > pk) { pk = v; pkAt = i; } });
  console.log(`主峰在 ${(pkAt / 1000).toFixed(3)}s，RMS=${pk.toFixed(5)}`);

  // 往后找衰减到峰值 6% 的点（录音底噪约 -56dBFS，不能按绝对阈值收）
  let end = pkAt;
  const floor = pk * 0.06;
  for (let i = pkAt; i < Math.min(env.length, pkAt + 200); i++) { if (env[i] > floor) end = i; }
  const start = Math.max(0, pkAt - 12);
  const padEnd = Math.min(env.length, end + 8);
  const t0 = start / 1000, t1 = padEnd / 1000;
  console.log(`取 ${t0.toFixed(3)}s → ${t1.toFixed(3)}s（长 ${((t1 - t0) * 1000).toFixed(0)}ms）`);

  const i0 = Math.round(t0 * SR), i1 = Math.round(t1 * SR);
  const seg = x.slice(i0, i1);
  let mx = 0;
  for (const v of seg) mx = Math.max(mx, Math.abs(v));
  const gain = 0.9 / mx;
  console.log(`原始峰值 ${mx.toFixed(4)}（${(20 * Math.log10(mx)).toFixed(1)}dBFS），归一化 +${(20 * Math.log10(gain)).toFixed(1)}dB`);

  const fadeIn = Math.round(SR * 0.0015), fadeOut = Math.round(SR * 0.006);
  const out = seg.map((v, i) => {
    let g = gain;
    if (i < fadeIn) g *= i / fadeIn;
    const tail = seg.length - i;
    if (tail < fadeOut) g *= tail / fadeOut;
    return v * g;
  });

  // 四个音效都用这一记敲击，靠音量 / 长短区分主次
  const variants = {
    'click.wav': { gain: 1.0, len: 1.0 },   // 主按钮
    'tick.wav': { gain: 0.62, len: 0.62 },  // 选项 / 小控件：更轻更短
    'back.wav': { gain: 0.78, len: 1.0 },   // 关闭 / 返回：略轻
    'launch.wav': { gain: 1.0, len: 1.0 }   // 启动游戏
  };
  for (const [name, o] of Object.entries(variants)) {
    const keep = Math.max(64, Math.round(out.length * o.len));
    const v = out.slice(0, keep).map((s, i) => {
      const tail = keep - i;
      const fo = Math.round(SR * 0.006);
      return s * o.gain * (tail < fo ? tail / fo : 1);
    });
    const bytes = writeWav(path.join(OUT, name), v, SR);
    let p = 0;
    for (const s of v) p = Math.max(p, Math.abs(s));
    console.log(`  ${name}  ${(keep / SR * 1000).toFixed(0)}ms  ${(bytes / 1024).toFixed(1)}KB  峰值 ${(20 * Math.log10(p)).toFixed(1)}dBFS`);
  }
  app.exit(0);
}).catch(e => { console.error('ERR', e && e.message); app.exit(1); });
