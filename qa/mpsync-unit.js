/* 联机模组同步的纯逻辑单测：清单编码 / 解码 / 差异判定
   跑法：node qa/mpsync-unit.js */
'use strict';
const assert = require('assert');
const CORE = require('../src/mpsync-core');

let pass = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { console.log('  ✗ ' + name + '\n    ' + (e && e.message)); process.exitCode = 1; }
};

console.log('[mpsync] 清单编码');

t('编码后可原样解回', () => {
  const man = {
    v: 1, inst: '1.21.4-Fabric', mc: '1.21.4', ld: 'Fabric', name: 'Steve', t: 1,
    mods: [
      { f: 'sodium.jar', h: 'a'.repeat(40), s: 1234567, i: 'sodium', v: '0.6.5', p: 123456 },
      { f: 'lithium.jar', h: 'b'.repeat(40), s: 2345, i: 'lithium', v: '0.14', p: 999 }
    ]
  };
  const wire = CORE.encodeManifest(man);
  assert.ok(wire.startsWith(CORE.MP_WIRE_PREFIX), '带版本前缀');
  const back = CORE.decodeManifest(wire);
  assert.deepStrictEqual(back, man);
});

t('编码体积明显小于明文（能塞进信令）', () => {
  const mods = [];
  for (let i = 0; i < 200; i++) {
    mods.push({ f: 'very-long-mod-name-number-' + i + '.jar', h: (i % 10).toString().repeat(40), s: 100000 + i, i: 'mod' + i, v: '1.2.' + i, p: 12345678 });
  }
  const raw = JSON.stringify({ v: 1, mods });
  const wire = CORE.encodeManifest({ v: 1, mods });
  assert.ok(wire.length < raw.length / 2, '压缩后 ' + wire.length + ' 应小于明文一半 ' + Math.round(raw.length / 2));
  console.log('    200 个模组：明文 ' + raw.length + ' 字节 → 信令 ' + wire.length + ' 字节');
});

t('坏数据一律返回 null，不抛异常', () => {
  assert.strictEqual(CORE.decodeManifest(''), null);
  assert.strictEqual(CORE.decodeManifest('z1:not-base64!!'), null);
  assert.strictEqual(CORE.decodeManifest('{"mods":"x"}'), null);
  assert.strictEqual(CORE.decodeManifest(null), null);
  assert.strictEqual(CORE.decodeManifest(123), null);
});

t('明文 JSON 也认（调试用）', () => {
  const o = { v: 1, mods: [{ f: 'a.jar', h: 'c'.repeat(40) }] };
  assert.deepStrictEqual(CORE.decodeManifest(JSON.stringify(o)), o);
});

console.log('[mpsync] 差异判定');

const hostMods = [
  { f: 'sodium.jar', h: 'a'.repeat(40), s: 100, i: 'sodium', v: '0.6.5' },
  { f: 'lithium.jar', h: 'b'.repeat(40), s: 200, i: 'lithium', v: '0.14' },
  { f: 'create.jar', h: 'c'.repeat(40), s: 300, i: 'create', v: '6.0' },
  { f: 'oldmod.jar', h: 'd'.repeat(40), s: 400, i: 'oldmod', v: '1.0' }
];

t('完全一致 → 不算缺（同一份文件，sha1 相同）', () => {
  const d = CORE.diffMods([hostMods[0]], { bySha1: { ['a'.repeat(40)]: 'sodium.jar' }, byId: {} });
  assert.strictEqual(d.missing.length, 0);
  assert.strictEqual(d.outdated.length, 0);
  assert.strictEqual(d.same.length, 1);
});

t('装了但版本不同（modid 相同、sha1 不同）→ 只记 outdated，不要求安装', () => {
  const d = CORE.diffMods([hostMods[2]], {
    bySha1: {},
    byId: { create: { name: 'create-5.1.jar', sha1: 'f'.repeat(40), version: '5.1' } }
  });
  assert.strictEqual(d.missing.length, 0, '已安装不应该进 missing');
  assert.strictEqual(d.outdated.length, 1);
  assert.strictEqual(d.outdated[0].local.version, '5.1');
});

t('真没装 → 进 missing', () => {
  const d = CORE.diffMods(hostMods, {
    bySha1: { ['a'.repeat(40)]: 'sodium.jar' },
    byId: { create: { name: 'create-5.1.jar', sha1: 'f'.repeat(40), version: '5.1' } }
  });
  assert.deepStrictEqual(d.missing.map(m => m.f).sort(), ['lithium.jar', 'oldmod.jar']);
  assert.strictEqual(d.same.length, 1);
  assert.strictEqual(d.outdated.length, 1);
});

t('modid 大小写不敏感（Fabric 里大小写混用很常见）', () => {
  const d = CORE.diffMods([{ f: 'Jei.jar', h: 'e'.repeat(40), i: 'JEI' }], { bySha1: {}, byId: { jei: { name: 'jei.jar' } } });
  assert.strictEqual(d.missing.length, 0);
  assert.strictEqual(d.outdated.length, 1);
});

t('同一个 jar 重复出现只算一次', () => {
  const d = CORE.diffMods([hostMods[1], hostMods[1]], { bySha1: {}, byId: {} });
  assert.strictEqual(d.missing.length, 1);
});

t('没有 sha1 的条目直接跳过（清单残缺时不谎报缺模组）', () => {
  const d = CORE.diffMods([{ f: 'broken.jar' }, null, hostMods[0]], { bySha1: {}, byId: {} });
  assert.strictEqual(d.missing.length, 1);
  assert.strictEqual(d.missing[0].f, 'sodium.jar');
});

t('房主没有模组 → 什么都不缺', () => {
  const d = CORE.diffMods([], { bySha1: {}, byId: {} });
  assert.deepStrictEqual([d.missing.length, d.outdated.length, d.same.length], [0, 0, 0]);
});

t('Map 形式的索引也支持', () => {
  const d = CORE.diffMods([hostMods[0]], { bySha1: new Map([[ 'a'.repeat(40), 'sodium.jar' ]]), byId: new Map() });
  assert.strictEqual(d.same.length, 1);
});

console.log('[mpsync] 房间码规整');

t('U/ 前缀、空格、小写都归一', () => {
  assert.strictEqual(CORE.normRoom('u/ab12-cd34-ef56-gh78'), 'AB12CD34EF56GH78');
  assert.strictEqual(CORE.normRoom('  U/AB12-CD34-EF56-GH78 '), 'AB12CD34EF56GH78');
  assert.strictEqual(CORE.normRoom(''), '');
  assert.strictEqual(CORE.normRoom(null), '');
});

console.log(pass + ' 项通过' + (process.exitCode ? '（有失败）' : ''));
