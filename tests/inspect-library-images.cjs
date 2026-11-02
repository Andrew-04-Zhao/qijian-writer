const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');

const root = process.argv[2];
const library = JSON.parse(fs.readFileSync(path.join(root, 'library.json'), 'utf8'));
const references = [];

function walk(value) {
  if (typeof value === 'string') {
    for (const match of value.matchAll(/src=["']((?:file:|data:image)[^"'<]*)/gi)) references.push(match[1].replace(/&amp;/g, '&'));
    if (/^(?:file:|data:image)/i.test(value)) references.push(value);
  } else if (Array.isArray(value)) {
    value.forEach(walk);
  } else if (value && typeof value === 'object') {
    Object.values(value).forEach(walk);
  }
}

function localPath(url) {
  try {
    if (/^file:\/\/[A-Za-z]:\//i.test(url)) return decodeURIComponent(url.slice(7)).replace(/\//g, '\\');
    return fileURLToPath(url);
  } catch (_) {
    return '';
  }
}

walk(library);
const attachmentRoot = path.join(root, 'attachments').toLowerCase();
const tempRoot = path.resolve(process.env.LOCALAPPDATA, 'Temp').toLowerCase();
const rows = [...new Set(references.filter((source) => source.startsWith('file:')))].map((url) => {
  const file = localPath(url);
  const lower = file.toLowerCase();
  return {
    url,
    file,
    exists: Boolean(file) && fs.existsSync(file),
    where: lower.startsWith(attachmentRoot) ? 'attachments' : lower.startsWith(tempRoot) ? 'temp' : 'other',
  };
});

const summary = Object.fromEntries(['attachments', 'temp', 'other'].map((where) => [where, {
  total: rows.filter((row) => row.where === where).length,
  missing: rows.filter((row) => row.where === where && !row.exists).length,
}]));
console.log(JSON.stringify({ rawReferences: references.length, uniqueFileReferences: rows.length, summary }, null, 2));
console.log('MISSING');
rows.filter((row) => !row.exists).forEach((row) => console.log(`${row.where}\t${row.file}`));
const missingKeys = [...new Set(rows.filter((row) => !row.exists).map((row) => {
  const name = path.basename(row.file);
  return name.includes('.') ? name.slice(name.indexOf('.') + 1) : name;
}))];
console.log(`MISSING_CONTENT_KEYS\t${missingKeys.length}`);
missingKeys.forEach((key) => console.log(key));
console.log('AFFECTED_DOCUMENTS');
for (const item of library.nodes || []) {
  if (item.type !== 'document') continue;
  const current = JSON.stringify({ content: item.content, contentJson: item.contentJson });
  const history = JSON.stringify(item.versions || []);
  const currentKeys = missingKeys.filter((key) => current.includes(key));
  const historyKeys = missingKeys.filter((key) => history.includes(key));
  if (currentKeys.length || historyKeys.length) console.log(JSON.stringify({
    title: item.title || '(未命名)', id: item.id, currentMissing: currentKeys.length, historyMissing: historyKeys.length,
  }));
}
