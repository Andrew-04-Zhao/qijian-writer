// Run against the isolated installer built with dist/installer-audit/test-build.json.
// Its app ID, registry entries, installation and library must be test-only.
const fs = require('fs');
const path = require('path');
const assert = require('assert/strict');
const {spawnSync} = require('child_process');
const repo = path.resolve(__dirname, '..');
const audit = path.join(repo, 'dist', 'installer-audit');
const context = JSON.parse(fs.readFileSync(path.join(audit, 'e2e-context.json')));
assert(context.appId.startsWith('com.qijian.installer-smoke.'));
assert(path.basename(context.root).startsWith('qijian-installer-e2e-'));
assert.equal(context.install, path.join(context.root, 'program'));
assert.equal(context.library, path.join(context.root, 'library'));
const libraryFile = path.join(context.library, 'library.json');
const before = fs.readFileSync(libraryFile);
const installer = path.join(audit, 'package', 'qijian-installer-smoke.exe');
const report = [];
function run(file, args, label) {
  console.log('Starting: ' + label);
  const started = Date.now();
  const result = spawnSync(file, args, {windowsHide:true, timeout:90000, encoding:'utf8'});
  assert.equal(result.status, 0, `${label}: ${result.error || result.stderr}`);
  assert(fs.readFileSync(libraryFile).equals(before), label + ' changed the library');
  report.push({label, exitCode:result.status, elapsedMs:Date.now()-started});
  console.log(JSON.stringify(report[report.length-1]));
}
for (const label of ['Fresh installation', 'Install over the existing version']) {
  run(installer, ['/S', '/D=' + context.install], label);
  assert(fs.existsSync(path.join(context.install, '栖简.exe')));
  assert(fs.existsSync(path.join(context.install, 'resources', 'app.asar')));
  const selection = JSON.parse(fs.readFileSync(path.join(context.install, 'library-selection.json'), 'utf8'));
  assert.equal(selection.root, context.library);
}
const uninstaller = fs.readdirSync(context.install).find(file => /^Uninstall .*\.exe$/i.test(file));
assert(uninstaller, 'Generated uninstaller is missing');
run(path.join(context.install, uninstaller), ['/S', '_?=' + context.install], 'Uninstall the test application');
assert(!fs.existsSync(path.join(context.install, '栖简.exe')));
assert(!fs.existsSync(path.join(context.install, 'resources', 'app.asar')));
fs.writeFileSync(path.join(audit, 'e2e-report.json'), JSON.stringify({context, report, libraryPreserved:true}, null, 2));
console.log('Fresh installation, replacement and uninstall passed; test library preserved.');
