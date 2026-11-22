/* 用 Chromium 的 WebAudio 解 mp3（本机没有 ffmpeg），打印时长 / 采样率 / 能量包络里的「敲击段」
 * 用法：./node_modules/.bin/electron tools/mp3-analyze.js <input.mp3>
 */
'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const inPath = process.argv[2];
if (!inPath) { console.error('用法: electron tools/mp3-analyze.js <input.mp3>'); app.exit(2); }

app.disableHardwareAcceleration();
app.commandLine.appendSwitch('mute-audio');

const b64 = fs.readFileSync(inPath).toString('base64');

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
    // 10ms 帧的 RMS
    const hop = Math.round(buf.sampleRate * 0.01);
    const frames = [];
    for (let i = 0; i + hop <= ch.length; i += hop) {
      let s = 0;
      for (let j = 0; j < hop; j++) s += ch[i + j] * ch[i + j];
      frames.push(Math.sqrt(s / hop));
    }
    const peak = Math.max(...frames);
    const thr = Math.max(peak * 0.06, 0.002);
    // 找连续超过阈值的段，间隔 < 60ms 的合并
    const segs = [];
    let cur = null;
    for (let i = 0; i < frames.length; i++) {
      const on = frames[i] > thr;
      if (on && !cur) cur = { s: i, e: i, p: frames[i] };
      else if (on && cur) { cur.e = i; cur.p = Math.max(cur.p, frames[i]); }
      else if (!on && cur) {
        if (i - cur.e > 6) { segs.push(cur); cur = null; } else cur.e = i;
      }
    }
    if (cur) segs.push(cur);
    return JSON.stringify({
      dur: buf.duration, sr: buf.sampleRate, nch: buf.numberOfChannels,
      peak, thr, frames: frames.map(v => +v.toFixed(4)),
      segs: segs.map(s => ({ s: +(s.s * 0.01).toFixed(2), e: +(s.e * 0.01).toFixed(2), p: +s.p.toFixed(4) }))
    });
  })()`);
  const d = JSON.parse(raw);
  console.log(`duration=${d.dur.toFixed(2)}s  sr=${d.sr}  ch=${d.nch}  peak=${d.peak.toFixed(4)}  thr=${d.thr.toFixed(4)}`);
  console.log('段数=' + d.segs.length);
  d.segs.forEach((s, i) => console.log(`  #${i} ${s.s}s → ${s.e}s  长 ${(s.e - s.s).toFixed(2)}s  峰值 ${s.p}`));
  // 粗包络（每秒 20 个点，用于肉眼看节奏）
  const per = 5;
  let line = '';
  for (let i = 0; i < d.frames.length; i += per) {
    const v = Math.max(...d.frames.slice(i, i + per));
    line += ' .:-=+*#%@'[Math.min(9, Math.round(v / d.peak * 9))];
  }
  for (let i = 0; i < line.length; i += 120) console.log(`  t=${(i * 0.05).toFixed(2)}s |${line.slice(i, i + 120)}|`);
  app.exit(0);
}).catch(e => { console.error('ERR', e && e.message); app.exit(1); });
