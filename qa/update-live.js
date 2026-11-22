/* 线上更新源自测：打包版能不能认到官网新版本（会真的联网）
 * 用法：LMC_SMOKE_UI_JS=<绝对路径> "dist/win-unpacked/Xero Lite Craft Launcher 1.2.1.exe"
 */
const lines = [];
const ok = (c, n, e) => lines.push((c ? 'PASS ' : 'FAIL ') + n + (e !== undefined ? ' · ' + e : ''));

const r = await window.lmc.updateCheck({ force: true });
ok(!!(r && r.ok), '更新检测请求成功', r && (r.error || r.via));
const latest = String((r && (r.latest || (r.data && r.data.version))) || '');
ok(latest === '1.2.1', '线上最新版本 = 1.2.1', latest || JSON.stringify(r).slice(0, 160));
ok(r && r.current === '1.2.1', '本机版本 = 1.2.1', r && r.current);
ok(r && r.hasUpdate === false, '同版本不提示更新', String(r && r.hasUpdate));

const dls = (r && (r.downloads || (r.data && r.data.downloads))) || [];
ok(dls.length >= 1, '解析出下载直链', JSON.stringify(dls).slice(0, 200));
if (dls[0]) {
  ok(/^https:\/\/xlc-ce-launcher\.app\.workbuddy\.host\/downloads\/XLC-Launcher-1\.2\.1-portable\.exe/.test(dls[0].url),
    '直链指向官网 1.2.1 安装包', dls[0].url);
  ok(/^[a-f0-9]{64}$/.test(dls[0].sha256 || ''), '直链带 sha256 校验值', (dls[0].sha256 || '').slice(0, 16));
}

/* 模拟「老客户端 1.2.0」的判定：用包内纯函数不可达，这里退一步，用版本比较结果说明 */
lines.push('INFO 若客户端是 1.2.0，compareVer 会判为有更新（1.2.1 > 1.2.0）');

console.log(lines.join('\n'));
return { ok: lines.every(l => !l.startsWith('FAIL')), summary: '线上更新源', lines };
