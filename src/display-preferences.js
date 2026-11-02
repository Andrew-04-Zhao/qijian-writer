const fs = require('fs');
const path = require('path');
const UI_SCALES = [1, 1.1, 1.25, 1.5];
const READING_SCALES = [.75, .9, 1, 1.1, 1.25, 1.5, 1.75, 2];
function createDisplayPreferences(file, screen) {
  let saved = {};
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  let state = {uiScale: UI_SCALES.includes(saved?.uiScale) ? saved.uiScale : 1,
    readingScale: READING_SCALES.includes(saved?.readingScale) ? saved.readingScale : 1};
  const windows = new Map();
  const get = () => ({...state});
  function attach(win, child = false) {
    windows.set(win, child);
    const apply = () => { if (!win.isDestroyed()) win.webContents.setZoomFactor(state.uiScale); };
    apply();
    win.webContents.on('dom-ready', apply);
    win.webContents.on('did-finish-load', apply);
    win.once('closed', () => windows.delete(win));
  }
  function configure(patch) {
    if (!patch || typeof patch !== 'object') throw Error('无效的显示设置');
    const next = {...state};
    for (const [key, allowed] of [['uiScale', UI_SCALES], ['readingScale', READING_SCALES]]) {
      if (Object.hasOwn(patch, key)) {
        if (!allowed.includes(patch[key])) throw Error('不支持的缩放比例');
        next[key] = patch[key];
      }
    }
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file + '.tmp', JSON.stringify(next, null, 2));
    fs.renameSync(file + '.tmp', file);
    const ratio = next.uiScale / state.uiScale;
    state = next;
    for (const [win, child] of windows) {
      if (win.isDestroyed()) continue;
      if (child && ratio !== 1 && !win.isFullScreen() && !win.isMaximized()) {
        const bounds = win.getBounds(), area = screen.getDisplayMatching(bounds).workArea;
        const width = Math.min(area.width, Math.round(bounds.width * ratio));
        const height = Math.min(area.height, Math.round(bounds.height * ratio));
        win.setBounds({width, height,
          x: Math.max(area.x, Math.min(bounds.x, area.x + area.width - width)),
          y: Math.max(area.y, Math.min(bounds.y, area.y + area.height - height))});
      }
      win.webContents.setZoomFactor(state.uiScale);
    }
    return get();
  }
  return {get, attach, configure};
}
module.exports = {createDisplayPreferences, UI_SCALES, READING_SCALES};
