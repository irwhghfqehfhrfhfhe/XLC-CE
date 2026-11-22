/* 一次性脚本：把 qa 里那些会弹窗的验收脚本改成默认隐藏窗口（配合 qa/_vis.js） */
const fs = require('fs');
const files = ['qa/rail-restore.js', 'qa/rail-pos.js', 'qa/rail-custom.js', 'qa/layout.js', 'qa/changelog.js'];

for (const f of files) {
  let s = fs.readFileSync(f, 'utf8');
  const before = s;
  if (!s.includes("require('./_vis')")) {
    s = s.replace(
      /const OUT = path\.join\(__dirname, 'out'\);/,
      "const OUT = path.join(__dirname, 'out');\nconst { QA_SHOW, shotFile } = require('./_vis'); /* 默认隐藏窗口，QA_SHOW=1 才弹出来看图 */"
    );
  }
  s = s.split('show: true').join('show: QA_SHOW');
  s = s.replace(
    /const shot = async \(name\) => \{ fs\.writeFileSync\(path\.join\(OUT, name\), \(await win\.webContents\.capturePage\(\)\)\.toPNG\(\)\); \};/,
    'const shot = async (name) => { await shotFile(win, path.join(OUT, name)); };'
  );
  s = s.replace(
    /fs\.writeFileSync\((path\.join\(OUT,[^;]*?)\), \(await win\.webContents\.capturePage\(\)\)\.toPNG\(\)\);/g,
    'await shotFile(win, $1);'
  );
  if (s !== before) { fs.writeFileSync(f, s); console.log('patched ' + f); } else console.log('NOCHANGE ' + f);
}
