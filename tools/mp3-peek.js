/* 细看 mp3 某一段的波形（5ms RMS）+ 找出最响的若干瞬间
 * 用法：electron tools/mp3-peek.js <input.mp3> [起s] [止s]
 */
'use strict';
const { app, BrowserWindow } = require('electron');
const fs = require('fs');

const [inPath, t0Arg, t1Arg] = process.argv.slice(2);
const T0 = parseFloat(t0Arg || '0'), T1 = parseFloat(t1Arg || '99');
const b64 = fs.readFileSync(inPath).toString('base64');

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
    const hop = Math.round(buf.sampleRate * 0.005);
    const frames = [];
    for (let i = 0; i + hop <= ch.length; i += hop) {
      let s = 0, pk = 0;
      for (let j = 0; j < hop; j++) { const v = ch[i + j]; s += v * v; if (Math.abs(v) > pk) pk = Math.abs(v); }
      frames.push({ t: i / buf.sampleRate, r: Math.sqrt(s / hop), pk });
    }
    return JSON.stringify({ dur: buf.duration, sr: buf.sampleRate, frames });
  })()`);
  const d = JSON.parse(raw);
  const F = d.frames;
  const sorted = F.slice().sort((a, b) => b.r - a.r).slice(0, 20);
  console.log('最响 20 帧：');
  sorted.forEach(f => console.log(`  t=${f.t.toFixed(3)}s  rms=${f.r.toFixed(5)}  pk=${f.pk.toFixed(5)}`));
  const sub = F.filter(f => f.t >= T0 && f.t <= T1);
  const mx = Math.max(...sub.map(f => f.r)) || 1;
  console.log(`\n区间 ${T0}~${T1}s（每行 100 帧 = 0.5s）：`);
  for (let i = 0; i < sub.length; i += 100) {
    const seg = sub.slice(i, i + 100);
    const txt = seg.map(f => ' .:-=+*#%@'[Math.min(9, Math.round(f.r / mx * 9))]).join('');
    console.log(`  ${seg[0].t.toFixed(2)}s |${txt}|`);
  }
  app.exit(0);
}).catch(e => { console.error('ERR', e && e.message); app.exit(1); });
