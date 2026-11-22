/* ============================================================
   账户页皮肤 3D 舞台（无第三方依赖）
   ------------------------------------------------------------
   这是一只「方块人」的正交投影渲染器：把 64×64 皮肤贴到 6 个长方体上，
   按关节角度摆姿势，再用 canvas 2D 的 setTransform 把每个面的贴图
   仿射映射到投影后的平行四边形上。不引 WebGL / three.js，
   打包体积一分不涨，离线也能用。

   几何必须严格照 Minecraft 官方骨骼来，差一点都不像史蒂夫：
     头    8×8×8    头心 y=28（顶 32、颈 24）
     躯干  8×12×4   腰 12、肩 24
     手臂  4×12×4   肩关节 (±6, 24, 0)，苗条 3×12×4 时 (±5.5, 24, 0)
     腿    4×12×4   髋关节 (±2, 12, 0)，脚底 y=0
   单位都是「皮肤像素」，y 轴朝上，脚底为 0。
   早期版本把腿画成 12 高却又用 20 当髋高、部件尺寸各自缩放，
   于是人变成「大脑袋粗短腿」；坐下更是把小腿压进了地底下。
   现在所有部件共用同一套尺寸与关节，姿势只改旋转角。
   ============================================================ */
(() => {
  'use strict';

  const DEG = Math.PI / 180;
  const VIEW_DEF = { yaw: -22, pitch: 8 };          /* 默认 3/4 侧身，比正面有立体感 */
  /* Q 弹弹簧：欠阻尼，按一下会连着颤两下才停（k 大 = 弹得快，c 小 = 颤得久） */
  const SQ_WIDE = 0.30, SQ_SHORT = 0.42, SQ_K = 175, SQ_C = 6, SQ_STRETCH = 0.40;
  /* 「说话」状态：一边放着音频，一边自己转圈 + 一直 duang（参考视频里的效果） */
  const TALK_SPIN = 60;                             /* 自转角速度（度/秒）—— 6 秒转一圈，肉眼能看清 */
  const TALK_DUANG = 0.9;                           /* 每次压扁的力度（1 = 一次满按） */
  const TALK_GAP = 620;                             /* 两次 duang 的间隔（毫秒），弹簧近静止就按下一记 */

  /* ---------------- 旋转（角度制，绕 X → Y → Z） ---------------- */
  function rot3(p, ax, ay, az) {
    let x = p[0], y = p[1], z = p[2];
    if (ax) { const r = ax * DEG, c = Math.cos(r), s = Math.sin(r); const y2 = y * c - z * s; z = y * s + z * c; y = y2; }
    if (ay) { const r = ay * DEG, c = Math.cos(r), s = Math.sin(r); const x2 = x * c + z * s; z = -x * s + z * c; x = x2; }
    if (az) { const r = az * DEG, c = Math.cos(r), s = Math.sin(r); const x2 = x * c - y * s; const y2 = x * s + y * c; x = x2; y = y2; }
    return [x, y, z];
  }

  /* 六个面：c = 面中心方向，r = 贴图 +u 方向，u = 贴图 +v 的反方向。
     r × u 就是外法线 —— 背面剔除和明暗都靠它。 */
  const FACE = {
    front:  { c: [0, 0, 1],  r: [1, 0, 0],  u: [0, 1, 0] },
    back:   { c: [0, 0, -1], r: [-1, 0, 0], u: [0, 1, 0] },
    right:  { c: [-1, 0, 0], r: [0, 0, 1],  u: [0, 1, 0] },
    left:   { c: [1, 0, 0],  r: [0, 0, -1], u: [0, 1, 0] },
    top:    { c: [0, 1, 0],  r: [1, 0, 0],  u: [0, 0, -1] },
    bottom: { c: [0, -1, 0], r: [1, 0, 0],  u: [0, 0, 1] }
  };

  /* ---------------- 骨骼 + UV ----------------
     right / left 指「角色自己的右 / 左」（不是屏幕左右）。
     第二层（帽子 / 外套 / 袖子 / 裤腿）：头在 u+32，其余在 v+16。 */
  /* 骨架在每帧都会被取用，这里按「模型 + 皮肤格式」缓存，别每帧重建 6 个部件 */
  const MODEL_CACHE = new Map();
  function rigModel(model, legacy) {
    const key = model + '|' + (legacy ? 'old' : 'new');
    const hit = MODEL_CACHE.get(key);
    if (hit) return hit;
    const built = buildModel(model, legacy);
    MODEL_CACHE.set(key, built);
    return built;
  }
  function buildModel(model, legacy) {
    const slim = model === 'slim';
    const aw = slim ? 3 : 4;
    const ax = 4 + aw / 2;                          /* 肩关节离中轴：经典 6、苗条 5.5 */
    const sh = (o, du, dv) => {
      const out = {};
      for (const k of Object.keys(o)) out[k] = [o[k][0] + du, o[k][1] + dv, o[k][2], o[k][3]];
      return out;
    };
    const armR = slim
      ? { right: [40, 20, 4, 12], front: [44, 20, 3, 12], left: [47, 20, 4, 12], back: [51, 20, 3, 12], top: [44, 16, 3, 4], bottom: [47, 16, 3, 4] }
      : { right: [40, 20, 4, 12], front: [44, 20, 4, 12], left: [48, 20, 4, 12], back: [52, 20, 4, 12], top: [44, 16, 4, 4], bottom: [48, 16, 4, 4] };
    const armL = slim
      ? { right: [32, 52, 4, 12], front: [36, 52, 3, 12], left: [39, 52, 4, 12], back: [43, 52, 3, 12], top: [36, 48, 3, 4], bottom: [39, 48, 3, 4] }
      : { right: [32, 52, 4, 12], front: [36, 52, 4, 12], left: [40, 52, 4, 12], back: [44, 52, 4, 12], top: [36, 48, 4, 4], bottom: [40, 48, 4, 4] };
    const legR = { right: [0, 20, 4, 12], front: [4, 20, 4, 12], left: [8, 20, 4, 12], back: [12, 20, 4, 12], top: [4, 16, 4, 4], bottom: [8, 16, 4, 4] };
    const legL = { right: [16, 52, 4, 12], front: [20, 52, 4, 12], left: [24, 52, 4, 12], back: [28, 52, 4, 12], top: [20, 48, 4, 4], bottom: [24, 48, 4, 4] };

    const M = {
      head: { size: [8, 8, 8], pivot: [0, 24, 0], off: [0, 4, 0],
        uv: { front: [8, 8, 8, 8], back: [24, 8, 8, 8], left: [16, 8, 8, 8], right: [0, 8, 8, 8], top: [8, 0, 8, 8], bottom: [16, 0, 8, 8] },
        ov: { front: [40, 8, 8, 8], back: [56, 8, 8, 8], left: [48, 8, 8, 8], right: [32, 8, 8, 8], top: [40, 0, 8, 8], bottom: [48, 0, 8, 8] } },
      body: { size: [8, 12, 4], pivot: [0, 24, 0], off: [0, -6, 0],
        uv: { right: [16, 20, 4, 12], front: [20, 20, 8, 12], left: [28, 20, 4, 12], back: [32, 20, 8, 12], top: [20, 16, 8, 4], bottom: [28, 16, 8, 4] },
        ov: sh({ right: [16, 20, 4, 12], front: [20, 20, 8, 12], left: [28, 20, 4, 12], back: [32, 20, 8, 12], top: [20, 16, 8, 4], bottom: [28, 16, 8, 4] }, 0, 16) },
      armR: { size: [aw, 12, 4], pivot: [-ax, 24, 0], off: [0, -6, 0], uv: armR, ov: sh(armR, 0, 16) },
      armL: { size: [aw, 12, 4], pivot: [ax, 24, 0], off: [0, -6, 0], uv: armL, ov: sh(armL, 0, 16) },
      legR: { size: [4, 12, 4], pivot: [-2, 12, 0], off: [0, -6, 0], uv: legR, ov: sh(legR, 0, 16) },
      legL: { size: [4, 12, 4], pivot: [2, 12, 0], off: [0, -6, 0], uv: legL, ov: sh(legL, 0, 16) }
    };

    /* 64×32 的老皮肤只有正脸那一圈，侧面 / 背面 / 顶底都没有贴图。
       直接按 3D 画会整块透明、看着像人被削掉一半 —— 这里把缺的面全部退回
       正面那一块（左右肢本来就是镜像复用），牺牲一点细节换「完整的人」。 */
    if (legacy) {
      for (const k of Object.keys(M)) {
        const part = M[k];
        const front = (part.uv && part.uv.front) || (part.uv && part.uv[Object.keys(part.uv)[0]]);
        const filled = {};
        for (const f of Object.keys(FACE)) filled[f] = part.uv[f] || front;
        part.uv = filled;
        delete part.ov;                             /* 老皮肤没有第二层 */
      }
    }
    return M;
  }

  /* ---------------- 姿势 ----------------
     约定：四肢挂在关节下方，绕 X 负角 = 往镜头这边摆（正面看就是「往前」）。 */
  function pose3D(pose, phase, look) {
    const s = Math.sin(phase);
    const P = { head: [0, 0, 0], body: [0, 0, 0], armR: [0, 0, 0], armL: [0, 0, 0], legR: [0, 0, 0], legL: [0, 0, 0] };
    let modelPitch = 0;
    if (pose === 'walk') {
      const a = s * 32;
      P.armR[0] = a; P.armL[0] = -a; P.legR[0] = -a; P.legL[0] = a;
      P.head[1] = Math.sin(phase * 0.5) * 4;
    } else if (pose === 'run') {
      const a = s * 58;
      P.armR[0] = a; P.armL[0] = -a; P.legR[0] = -a; P.legL[0] = a;
      P.body[0] = 13; P.head[0] = -9;               /* 前倾，跑起来才有冲劲 */
      P.head[1] = Math.sin(phase * 0.5) * 6;
      P.armR[2] = -6; P.armL[2] = 6;                /* 手臂别贴身体穿模 */
    } else if (pose === 'swim') {
      modelPitch = 86;                              /* 整个人趴平 */
      P.head[0] = -74;                              /* 抬头换气，别把脸埋进水里 */
      const a = Math.sin(phase);
      P.armR[0] = -96 + a * 72; P.armL[0] = -96 - a * 72;
      P.armR[2] = -15; P.armL[2] = 15;
      P.legR[0] = Math.sin(phase * 2) * 15; P.legL[0] = -P.legR[0];
    } else if (pose === 'sit') {
      /* 坐着：髋不动、大腿抬平往前伸（-84°），两腿微微分开别叠在一起，
         手臂略微前搭。脚离地是正常的 —— 现实里坐地上脚也不会笔直贴地。 */
      P.legR[0] = -84; P.legL[0] = -84;
      P.legR[1] = -15; P.legL[1] = 15;
      P.armR[0] = -42; P.armL[0] = -42;
    } else {
      P.armR[0] = s * 2.5; P.armL[0] = -s * 2.5;    /* 站立：轻微呼吸 */
      P.head[1] = Math.sin(phase * 0.5) * 3;
    }
    if (look) { P.head[1] += look.yaw || 0; P.head[0] += look.pitch || 0; }
    return { P, modelPitch };
  }

  /* ---------------- 3D 绘制 ---------------- */
  function draw3D(ctx, W, H, img, pose, phase, model, view, look, sq, zoom) {
    const legacy = img.width === 64 && img.height === 32;
    const U = Math.min(W / 26, H / 42) * (zoom || 1);   /* 1 皮肤像素 = U 画布像素（留旋转余量） */
    const cx = W / 2, cy = H / 2 + 3 * U;
    const yaw = view.yaw, pitch = view.pitch;
    const M = rigModel(model, legacy);
    const { P, modelPitch } = pose3D(pose, phase, look);
    const sqX = 1 + sq * SQ_WIDE, sqY = 1 - sq * SQ_SHORT;
    const footY = cy + 16 * U;                          /* 世界 y=0 投影到屏幕的 y，恒等于这个值 */
    const spin = (p, yawA, pitchA, pivot) => {
      let q = [p[0] - pivot[0], p[1] - pivot[1], p[2] - pivot[2]];
      q = rot3(q, pitchA, yawA, 0);
      return [q[0] + pivot[0], q[1] + pivot[1], q[2] + pivot[2]];
    };
    const toWorld = (part, p) => {
      const rot = P[part] || [0, 0, 0];
      const local = rot3([M[part].off[0] + p[0], M[part].off[1] + p[1], M[part].off[2] + p[2]], rot[0], rot[1], rot[2]);
      return [M[part].pivot[0] + local[0], M[part].pivot[1] + local[1], M[part].pivot[2] + local[2]];
    };
    /* Q 弹只能作用在屏幕坐标上：每个面都要 setTransform 做仿射映射，
       外面套一层 ctx.scale 会被它直接清掉。 */
    const toScreen = (w) => {
      let q = spin(w, yaw, pitch, [0, 16, 0]);
      if (modelPitch) q = spin(q, 0, modelPitch, [0, 16, 0]);
      return [cx + q[0] * U * sqX, footY + (cy - (q[1] - 16) * U - footY) * sqY, q[2]];
    };
    const LIGHT = (() => { const v = [0.32, 0.86, 0.4], n = Math.hypot(v[0], v[1], v[2]); return [v[0] / n, v[1] / n, v[2] / n]; })();
    const quads = [];
    for (const part of Object.keys(M)) {
      const box = M[part];
      const [w, h, d] = box.size;
      const half = [w / 2, h / 2, d / 2];
      for (const ov of [false, true]) {
        const rects = ov ? box.ov : box.uv;
        if (!rects) continue;
        const scale = ov ? 1.05 : 1;                  /* 第二层略大，跟游戏里一样浮在外面 */
        for (const face of Object.keys(rects)) {
          const f = FACE[face], rect = rects[face];
          if (!rect) continue;
          const ext = (v) => Math.abs(v[0]) * half[0] + Math.abs(v[1]) * half[1] + Math.abs(v[2]) * half[2];
          const hw = ext(f.r) * scale, hh = ext(f.u) * scale;
          const cvec = [f.c[0] * half[0] * scale, f.c[1] * half[1] * scale, f.c[2] * half[2] * scale];
          const mk = (sr, su) => toWorld(part, [
            cvec[0] + f.r[0] * hw * sr + f.u[0] * hh * su,
            cvec[1] + f.r[1] * hw * sr + f.u[1] * hh * su,
            cvec[2] + f.r[2] * hw * sr + f.u[2] * hh * su]);
          const s0 = toScreen(mk(-1, 1)), s1 = toScreen(mk(1, 1)), s2 = toScreen(mk(1, -1)), s3 = toScreen(mk(-1, -1));
          /* 外法线：模型空间算 r×u，跟着部件旋转与整体旋转转过去，再看它在相机 z 上的分量 */
          const rot = P[part] || [0, 0, 0];
          const rw = rot3(rot3(f.r, rot[0], rot[1], rot[2]), pitch, yaw, 0);
          const uw = rot3(rot3(f.u, rot[0], rot[1], rot[2]), pitch, yaw, 0);
          let n = [rw[1] * uw[2] - rw[2] * uw[1], rw[2] * uw[0] - rw[0] * uw[2], rw[0] * uw[1] - rw[1] * uw[0]];
          if (modelPitch) n = rot3(n, modelPitch, 0, 0);
          if (n[2] <= 0.01) continue;                  /* 背面直接跳过 */
          const nl = Math.hypot(n[0], n[1], n[2]) || 1;
          const lit = Math.max(0, (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]) / nl);
          quads.push({
            rect, pts: [s0, s1, s2, s3],
            z: (s0[2] + s1[2] + s2[2] + s3[2]) / 4 + (ov ? 0.08 : 0),
            shade: (1 - (0.6 + 0.4 * lit)) * 0.5      /* 顶面最亮、侧面稍暗、底面最暗 */
          });
        }
      }
    }
    /* 越界兜底：侧身 + 压扁时腿会顶出画布左右边。整体平移回画面内，
       只在越界时动，平时构图完全不变。 */
    let mnx = Infinity, mxx = -Infinity;
    for (const q of quads) for (const p of q.pts) { if (p[0] < mnx) mnx = p[0]; if (p[0] > mxx) mxx = p[0]; }
    let dx = 0;
    if (mxx > W - 2) dx = W - 2 - mxx;
    if (mnx + dx < 2) dx = 2 - mnx;
    if (dx) for (const q of quads) for (const p of q.pts) p[0] += dx;

    /* 脚下阴影：没有它，人像是浮在卡片中间 */
    const feet = toScreen([0, 0, 0]);
    feet[0] += dx;
    const shW = 17 * U, shH = 3.6 * U;
    const sg = ctx.createRadialGradient(feet[0], feet[1], 0, feet[0], feet[1], shW);
    sg.addColorStop(0, 'rgba(0,0,0,.30)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.save();
    ctx.translate(feet[0], feet[1]);
    ctx.scale(1, shH / shW);
    ctx.beginPath(); ctx.arc(0, 0, shW, 0, Math.PI * 2);
    ctx.fillStyle = sg; ctx.fill();
    ctx.restore();

    quads.sort((a, b) => a.z - b.z);                  /* 画家算法：远的先画 */
    for (const q of quads) {
      const [p0, p1, , p3] = q.pts;
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]);
      ctx.lineTo(q.pts[2][0], q.pts[2][1]); ctx.lineTo(p3[0], p3[1]);
      ctx.closePath();
      ctx.clip();                                     /* 裁掉斜边外的采样溢出 */
      const ex0 = (p1[0] - p0[0]) / q.rect[2], ex1 = (p1[1] - p0[1]) / q.rect[2];
      const ey0 = (p3[0] - p0[0]) / q.rect[3], ey1 = (p3[1] - p0[1]) / q.rect[3];
      ctx.setTransform(ex0, ex1, ey0, ey1, p0[0], p0[1]);
      ctx.drawImage(img, q.rect[0], q.rect[1], q.rect[2], q.rect[3], 0, 0, q.rect[2], q.rect[3]);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      if (q.shade > 0.01) { ctx.fillStyle = 'rgba(0,0,0,' + q.shade.toFixed(3) + ')'; ctx.fill(); }
      ctx.restore();
    }
    return quads.length;
  }

  /* ---------------- 挂载 ---------------- */
  function mount(cv, opts) {
    opts = opts || {};
    let img = null, model = 'classic', legacy = false;
    let action = 'default';
    let phase = 0;
    let raf = 0, dead = false, frames = 0, facesLast = 0;
    let last = 0;
    const view = { yaw: VIEW_DEF.yaw, pitch: VIEW_DEF.pitch };
    let zoom = 1, zoomGoal = 1;
    const look = { tx: 0, ty: 0, yaw: 0, pitch: 0 };
    const sq = { v: 0, vel: 0 };
    const talk = { on: false, nextDuang: 0 };       /* 说话中：自转 + 连续 duang */
    const ctx = cv.getContext('2d');

    const visible = () => {
      if (dead || !cv.isConnected) return false;
      const pg = cv.closest('.page');
      if (pg && !pg.classList.contains('active')) return false;
      return true;
    };

    function draw() {
      const W = cv.width, H = cv.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, W, H);
      if (!img) return 0;
      return draw3D(ctx, W, H, img, action, phase, model, view, look, sq.v, zoom);
    }

    /* ---- 拖动转视角 ----
       增量式：每帧自转和拖动都往同一个 yaw 上叠，所以「转着的时候拖」两者都成立 ——
       拖是加在自转之上的偏移，松手后自转从你停下的角度继续转（以前的写法是
       「绝对角度 = 按下时角度 + 位移」，会把自转整个抹掉）。 */
    let dragging = false, sx = 0, sy = 0, dx0 = 0, dy0 = 0, moved = 0, t0 = 0, lastTap = 0;
    const onDown = (e) => {
      dragging = true; sx = e.clientX; sy = e.clientY; dx0 = e.clientX; dy0 = e.clientY;
      moved = 0; t0 = performance.now();
      cv.classList.add('dragging');
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    };
    const onMove = (e) => {
      if (!dragging) return;
      moved = Math.max(moved, Math.hypot(e.clientX - dx0, e.clientY - dy0));
      view.yaw += (e.clientX - sx) * 0.55;
      view.pitch = Math.max(-42, Math.min(62, view.pitch + (e.clientY - sy) * 0.35));
      sx = e.clientX; sy = e.clientY;
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      cv.classList.remove('dragging');
      /* 位移小、时间短 → 算「点了一下」而不是拖动 */
      if (moved >= 6 || performance.now() - t0 >= 600) return;
      const now = performance.now();
      /* 连击自己数，不依赖 DOM 的 dblclick：指针事件被合成时浏览器不会补 dblclick。
         坐着连点两下 = 说话；其它姿势连点两下 = 视角复位。 */
      if (now - lastTap < 320) { lastTap = 0; onDbl(); } else { lastTap = now; poke(); }
    };
    function poke() {
      if (action !== 'sit') return;                  /* 只有坐着才 Q 弹，别的姿势点一下什么都不发生 */
      sq.v = Math.min(1, sq.v + 1);
      sq.vel = 0;
    }
    const onWheel = (e) => {
      e.preventDefault();
      zoomGoal = Math.max(0.72, Math.min(1.7, zoomGoal * (e.deltaY > 0 ? 0.92 : 1.08)));
    };
    const onDbl = () => {
      if (action === 'sit' && opts.onDoubleTap) { opts.onDoubleTap(action); return; }
      view.yaw = VIEW_DEF.yaw; view.pitch = VIEW_DEF.pitch; zoomGoal = 1;
    };
    cv.addEventListener('pointerdown', onDown);
    cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp);
    cv.addEventListener('pointercancel', onUp);
    cv.addEventListener('wheel', onWheel, { passive: false });

    /* ---- 头跟鼠标：整窗口监听，鼠标挪到侧栏头也朝那边转 ---- */
    const aim = (e) => {
      if (dragging) return;
      const r = cv.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const nx = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2)));
      const ny = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2)));
      look.tx = nx * 46;
      look.ty = ny * 26;
    };
    const back = () => { look.tx = 0; look.ty = 0; };
    window.addEventListener('pointermove', aim, { passive: true });
    document.documentElement.addEventListener('pointerleave', back);
    window.addEventListener('blur', back);

    function loop(t) {
      if (dead) return;
      raf = requestAnimationFrame(loop);
      if (!visible()) { last = 0; return; }
      const dt = last ? Math.min(80, t - last) : 16;
      last = t;
      const speed = action === 'run' ? 0.0105 : action === 'walk' ? 0.0068
        : action === 'swim' ? 0.0115 : action === 'sit' ? 0.0016 : 0.0021;
      phase = (phase + dt * speed) % (Math.PI * 2);
      look.yaw += (look.tx - look.yaw) * 0.18;       /* 缓动，鼠标甩得快也不会硬拐 */
      look.pitch += (look.ty - look.pitch) * 0.18;
      zoom += (zoomGoal - zoom) * 0.2;
      const dts = Math.min(0.05, dt / 1000);
      /* 「说话」中：自己转圈 + 一直 duang。
         转是直接叠在 view.yaw 上 —— 鼠标拖拽也是往这里加，所以拖完照样接着转；
         duang 不等用户点，弹簧快停了就再按一记，看着像一直在弹（参考视频）。 */
      if (talk.on) {
        view.yaw = (view.yaw + (dt / 1000) * TALK_SPIN) % 360;
        /* 到点就再按一记（不等弹簧完全停下）—— 弹簧本来就会颤两下，
           按压间隔比它衰减更快，看起来才是「一直在弹」而不是弹一下歇一会儿。 */
        if (t >= talk.nextDuang) {
          sq.v = TALK_DUANG; sq.vel = 0;
          talk.nextDuang = t + TALK_GAP * (0.85 + Math.random() * 0.3);
        }
      }
      sq.vel += (-SQ_K * sq.v - SQ_C * sq.vel) * dts;
      sq.v += sq.vel * dts;
      if (sq.v < -SQ_STRETCH) { sq.v = -SQ_STRETCH; if (sq.vel < 0) sq.vel = 0; }
      facesLast = draw();
      frames++;
    }
    raf = requestAnimationFrame(loop);

    return {
      setImage(im, md) {
        img = im || null;
        model = md === 'slim' ? 'slim' : 'classic';
        legacy = !!img && img.width === 64 && img.height === 32;
        facesLast = draw();
      },
      setAction(a) {
        action = a || 'default';
        if (action !== 'sit') { sq.v = 0; sq.vel = 0; }
        if (action !== 'sit') talk.on = false;      /* 别的动作没有「说话」这回事 */
        phase = 0;
      },
      /* 说话开 / 关：开着就自转 + 一直 duang；用户拖动只改「转到哪」，不自转停 */
      setTalking(on) {
        talk.on = !!on && action === 'sit';
        if (talk.on) {
          talk.nextDuang = performance.now() + 220;  /* 开口就弹一下，别等半秒空白 */
          sq.v = Math.max(sq.v, TALK_DUANG); sq.vel = 0;
        }
      },
      isTalking: () => talk.on,
      getAction: () => action,
      reset: () => { view.yaw = VIEW_DEF.yaw; view.pitch = VIEW_DEF.pitch; zoomGoal = 1; look.tx = 0; look.ty = 0; },
      /* 给 QA 用：把内部状态摊出来，不然只能靠看图猜 */
      debug: () => ({
        action, slim: model === 'slim', legacy, hasImage: !!img,
        parts: 6,                                   /* 头 / 身 / 双臂 / 双腿 */
        yaw: +view.yaw.toFixed(3), pitch: +view.pitch.toFixed(3), zoom: +zoom.toFixed(3),
        squash: +sq.v.toFixed(3), hop: 0, talking: talk.on,
        frames, faces: facesLast,
        view: { cx: cv.width / 2, cy: cv.height / 2, w: cv.width, h: cv.height },
      }),
      destroy() {
        dead = true;
        cancelAnimationFrame(raf);
        cv.removeEventListener('pointerdown', onDown);
        cv.removeEventListener('pointermove', onMove);
        cv.removeEventListener('pointerup', onUp);
        cv.removeEventListener('pointercancel', onUp);
        cv.removeEventListener('wheel', onWheel);
        window.removeEventListener('pointermove', aim);
        document.documentElement.removeEventListener('pointerleave', back);
        window.removeEventListener('blur', back);
      }
    };
  }

  window.XLC_SKIN3D = { mount };
})();
