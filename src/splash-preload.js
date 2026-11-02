const { ipcRenderer } = require('electron');

window.addEventListener('DOMContentLoaded', () => {
  const bar = document.getElementById('startupBar');
  const label = document.getElementById('startupLabel');
  const value = document.getElementById('startupValue');
  ipcRenderer.on('startup-progress', (_event, payload = {}) => {
    const percent = Math.max(0, Math.min(100, Number(payload.percent) || 0));
    if (bar) bar.style.width = `${percent}%`;
    if (label) label.textContent = String(payload.label || '正在启动');
    if (value) value.textContent = `${Math.round(percent)}%`;
  });
});