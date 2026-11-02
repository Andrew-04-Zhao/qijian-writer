const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert/strict');
const {spawn, spawnSync} = require('child_process');

const repo = path.resolve(__dirname, '..');
const cache = path.join(process.env.LOCALAPPDATA, 'electron-builder', 'Cache');
function findFile(dir, suffix) {
  for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { const found = findFile(file, suffix); if (found) return found; }
    else if (file.endsWith(suffix)) return file;
  }
}
const compiler = findFile(cache, path.join('Bin', 'makensis.exe'));
const plugin = findFile(cache, path.join('x86-unicode', 'nsProcess.dll'));
assert(compiler && plugin, 'Build the installer once to populate the NSIS tools cache');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'qijian-installer-process-'));
const processName = `栖简-安装检测-${process.pid}.exe`;
const fixture = path.join(root, processName);
const checker = path.join(root, 'check.exe');
function compile(name, source) {
  const file = path.join(root, name + '.nsi');
  fs.writeFileSync(file, '\ufeff' + source);
  const result = spawnSync(compiler, ['/V2', file], {windowsHide:true, encoding:'utf8', timeout:60000});
  assert.equal(result.status, 0, result.stdout + result.stderr);
}
compile('fixture', `Unicode true
Name "Qijian test process"
OutFile "${fixture}"
RequestExecutionLevel user
SilentInstall silent
Section
  Sleep 60000
SectionEnd
`);
compile('check', `Unicode true
Name "Qijian installer process check"
OutFile "${checker}"
RequestExecutionLevel user
SilentInstall silent
!define BUILD_UNINSTALLER
!define APP_EXECUTABLE_FILENAME "${processName}"
!addplugindir /x86-unicode "${path.dirname(plugin)}"
!include "${path.join(repo, 'build', 'installer.nsh')}"
Section
  !insertmacro customCheckAppRunning
  SetErrorLevel 0
SectionEnd
`);
const observations = [];
function check(expected, label) {
  const started = Date.now();
  const result = spawnSync(checker, ['/S'], {windowsHide:true, timeout:10000});
  assert.equal(result.status, expected, `${label}: ${result.error || result.stderr}`);
  observations.push({label, exitCode:result.status, elapsedMs:Date.now() - started});
}
(async () => {
  check(0, 'Closed app permits installation');
  const running = spawn(fixture, ['/S'], {windowsHide:true, stdio:'ignore'});
  await new Promise((resolve, reject) => {running.once('spawn', resolve); running.once('error', reject);});
  try {
    await new Promise(resolve => setTimeout(resolve, 300));
    check(2, 'Running app blocks installation without waiting');
    assert.equal(running.exitCode, null, 'The installer must not terminate a running app');
  } finally {
    const exited = new Promise(resolve => running.once('exit', resolve));
    running.kill();
    await exited;
  }
  check(0, 'Installation proceeds after the app closes');
  fs.mkdirSync(path.join(repo, 'dist', 'installer-audit'), {recursive:true});
  fs.writeFileSync(path.join(repo, 'dist', 'installer-audit', 'process-check-report.json'), JSON.stringify(observations, null, 2));
  console.log(JSON.stringify(observations, null, 2));
})().catch(error => {console.error(error); process.exitCode = 1;});
