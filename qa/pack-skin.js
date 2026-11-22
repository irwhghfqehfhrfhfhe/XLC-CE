/* 打包版验收（1.2.6 · 皮肤 3D 舞台）：确认 skin3d.js 与 taunt.m4a 真的进了 asar、
 * 打包版里模型能渲染、动作能切、音频能解码。
 *
 * 用法：LMC_SMOKE_DATA_DIR=<临时> LMC_SMOKE_UI_JS=<本文件绝对路径> "dist/win-unpacked/XLC CE Launcher 1.2.6.exe"
 *
 * 注意：这里验证音频**必须静音**（a.muted = true）。静音不影响解码与 currentTime，
 * 但不会在用户机器上突然放那首 3 分 08 秒的曲子。
 */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const lines = [];
const ok = (c, n, e) => lines.push((c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? ' · ' + e : ''));

ok(!!window.XLC_SKIN3D, 'skin3d.js 已随包加载（window.XLC_SKIN3D 存在）');

/* ---- 进账户页，模型应该自己挂上 ---- */
gotoPage('account');
await sleep(500);
let d = { frames: 0, parts: 0, faces: 0 };
for (let i = 0; i < 40; i++) {
  await sleep(120);
  d = await (async () => { try { return SKIN_STAGE.debug(); } catch (e) { return { frames: 0, parts: 0, faces: 0 }; } })();
  if (d.frames > 4) break;
}
ok(d.frames > 4, '渲染循环在跑（有帧产出）', 'frames=' + d.frames);
ok(d.parts === 6, '骨架 6 段（头/身/双臂/双腿）', String(d.parts));
ok(d.faces >= 20 && d.faces <= 56, '可见面数合理', String(d.faces));

const cv = document.getElementById('skinPreview');
const box = cv.getBoundingClientRect();
ok(box.width > 150 && box.height > 250, '画布尺寸正常', Math.round(box.width) + 'x' + Math.round(box.height));

/* ---- 动作能切 ---- */
document.querySelector('#skinActs [data-act="sit"]').click();
await sleep(260);
let act = '';
try { act = SKIN_STAGE.getAction(); } catch (e) {}
ok(act === 'sit', '能切到「坐下」', act);
document.querySelector('#skinActs [data-act="default"]').click();
await sleep(200);

/* ---- 音频：能解码说明文件真的进了包（静音验证，不出声） ---- */
const audioState = await (async () => {
  const a = new Audio('../assets/taunt.m4a');
  a.muted = true;                       /* 关键：不静音就是在用户电脑上放歌 */
  a.preload = 'auto';
  let played = false;
  try { await a.play(); played = true; } catch (e) {}
  for (let i = 0; i < 25; i++) { await sleep(150); if (a.duration > 0) break; }
  const out = { duration: a.duration || 0, played, t: a.currentTime || 0 };
  try { a.pause(); a.currentTime = 0; } catch (e) {}
  return out;
})();
ok(audioState.duration > 100, 'taunt.m4a 在包内且能解码（静音验证）', 'duration=' + audioState.duration.toFixed(1) + 's played=' + audioState.played);

/* ---- 说话模式（1.2.8）：双击后进入「自转 + 一直 duang」 ---- */
gotoPage('account');
await sleep(420);
document.querySelector('#skinActs [data-act="sit"]').click();
await sleep(320);
const cv2 = document.getElementById('skinPreview');
const r2 = cv2.getBoundingClientRect();
const px = r2.left + r2.width / 2, py = r2.top + r2.height / 2;
const tapEv = (t) => new PointerEvent(t, { bubbles: true, clientX: px, clientY: py, pointerId: 31, button: 0, buttons: t === 'pointerup' ? 0 : 1 });
cv2.dispatchEvent(tapEv('pointerdown')); cv2.dispatchEvent(tapEv('pointerup'));
await sleep(80);
cv2.dispatchEvent(tapEv('pointerdown')); cv2.dispatchEvent(tapEv('pointerup'));
await sleep(500);
let t1 = SKIN_STAGE.debug(), sqMax = 0;
for (let i = 0; i < 14; i++) { await sleep(90); const g = SKIN_STAGE.debug(); if (g.squash > sqMax) sqMax = g.squash; }
const t2 = SKIN_STAGE.debug();
ok(t1.talking === true, '坐下双击 → 进入说话模式', String(t1.talking));
/* 打包版冒烟窗口是隐藏的，rAF 被节流到每秒一两帧，转速只能验「在转」不能验角度；
   真正的「0.7 秒 40°」在 qa/skin3d-ui.js 里验（那里窗口是 offscreen 全速渲染）。 */
const dspin = ((t2.yaw - t1.yaw) % 360 + 360) % 360;
ok(dspin > 0.5, '说话中模型自己在转（不靠鼠标）', t1.yaw + ' → ' + t2.yaw);
ok(sqMax > 0.2, '说话中一直 duang（1.3 秒内出现过压扁）', 'max=' + sqMax.toFixed(2));
try { stopSkinTaunt(); } catch (e) {}     /* 收尾：别让打包版在后台继续放歌 */
await sleep(300);

/* ---- 离开账户页应停止绘制（省电） ---- */
let f1 = 0;
try { f1 = SKIN_STAGE.debug().frames; } catch (e) {}
gotoPage('home');
await sleep(900);
let f2 = f1;
try { f2 = SKIN_STAGE.debug().frames; } catch (e) {}
ok(f2 - f1 <= 2, '离开账户页后不再空转渲染', f1 + ' → ' + f2);

console.log(lines.join('\n'));
return { ok: lines.every(l => !l.startsWith('FAIL')), summary: '打包版验收（皮肤 3D 舞台）', lines };
