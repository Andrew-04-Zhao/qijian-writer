const fs = require('fs');
const path = require('path');
const { removeUnreferencedAttachments } = require('../src/library-images');

const root = process.argv[2];
const libraryFile = path.join(root, 'library.json');
const library = JSON.parse(fs.readFileSync(libraryFile, 'utf8'));
let removedVersions = 0;
for (const item of library.nodes || []) {
  if (item.type !== 'document') continue;
  removedVersions += Array.isArray(item.versions) ? item.versions.length : 0;
  item.versions = [];
}
library.savedAt = new Date().toISOString();
library.writeRevision = (Number(library.writeRevision) || 0) + 1;
const temporary = `${libraryFile}.history-cleanup-${process.pid}`;
fs.writeFileSync(temporary, JSON.stringify(library, null, 2), 'utf8');
fs.renameSync(temporary, libraryFile);
const removedAttachments = removeUnreferencedAttachments(library, path.join(root, 'attachments'), 0);
console.log(JSON.stringify({
  removedVersions,
  removedAttachments: removedAttachments.length,
  freedBytes: removedAttachments.reduce((total, item) => total + item.bytes, 0),
}, null, 2));
