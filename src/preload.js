const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('qijian', {
  displayPreferences: () => ipcRenderer.invoke('display:get'),
  configureDisplay: preferences => ipcRenderer.invoke('display:configure', preferences),
  loadLibrary: () => ipcRenderer.invoke('library:load'),
  spellcheckStatus: () => ipcRenderer.invoke('spellcheck:status'),
  configureSpellcheck: preferences => ipcRenderer.invoke('spellcheck:configure', preferences),
  onSpellcheckStatus: callback => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('spellcheck:status-changed', listener);
    return () => ipcRenderer.removeListener('spellcheck:status-changed', listener);
  },
  saveLibrary: (library, options) => ipcRenderer.invoke('library:save', library, options),
  saveLibrarySync: (library) => ipcRenderer.sendSync('library:save-sync', library),
  backupLibrary: () => ipcRenderer.invoke('library:backup'),
  backupLibraryInfo: () => ipcRenderer.invoke('library:backup-info'),
  restoreLibraryBackup: backupId => ipcRenderer.invoke('library:restore-backup', backupId),
  libraryStorageInfo: () => ipcRenderer.invoke('library:storage-info'),
  chooseLibraryLocation: () => ipcRenderer.invoke('library:choose-location'),
  migrateLibrary: (targetRoot, library) => ipcRenderer.invoke('library:migrate', { targetRoot, library }),
  onLibraryMigrationProgress: callback => {
    const listener = (_event, progress) => callback(progress);
    ipcRenderer.on('library:migration-progress', listener);
    return () => ipcRenderer.removeListener('library:migration-progress', listener);
  },
  adoptImageSources: (sources, baseDirectory = '', documentId = '') => ipcRenderer.invoke('attachment:adopt-sources', {sources, baseDirectory, documentId}),
  addAttachment: documentId => ipcRenderer.invoke('attachment:add', documentId),
  addAttachmentData: (dataUrl, name, documentId) => ipcRenderer.invoke('attachment:add-data', { dataUrl, name, documentId }),
  copyImage: source => ipcRenderer.invoke('clipboard:copy-image', source),
  openExternal: url => ipcRenderer.invoke('system:open-external', url),
  openImage: source => ipcRenderer.invoke('system:open-image', source),
  importMarkdown: () => ipcRenderer.invoke('document:import-markdown'),
  exportMarkdown: (payload) => ipcRenderer.invoke('document:export-markdown', payload),
  exportText: (payload) => ipcRenderer.invoke('document:export-text', payload),
  exportDocx: (payload) => ipcRenderer.invoke('document:export-docx', payload),
  exportPdf: (payload) => ipcRenderer.invoke('document:export-pdf', payload),
  exportPng: (payload) => ipcRenderer.invoke('document:export-png', payload),
  imagePreview: (payload) => ipcRenderer.invoke('document:image-preview', payload),
  releaseImagePreview: () => ipcRenderer.send('document:release-preview'),
  showLibrary: () => ipcRenderer.invoke('path:show-library'),
  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  toggleMaximizeWindow: () => ipcRenderer.send('window:toggle-maximize'),
  toggleDetachedFullscreen: title => ipcRenderer.invoke('window:toggle-detached-fullscreen', title),
  closeWindow: () => ipcRenderer.send('window:close'),
  startupProgress: (percent, label) => ipcRenderer.send('startup:progress', { percent, label }),
  startupReady: () => ipcRenderer.send('startup:ready'),
});
