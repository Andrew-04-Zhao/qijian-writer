const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { localPathFromImageSource } = require('../src/library-images');

const libraryRoot = process.argv[2];
const effieRoot = process.argv[3];
const libraryFile = path.join(libraryRoot, 'library.json');
const attachments = path.join(libraryRoot, 'attachments');
const backups = path.join(libraryRoot, 'backups');
const library = JSON.parse(fs.readFileSync(libraryFile, 'utf8'));
const references = new Set();

function collect(value) {
  if (typeof value === 'string') {
    for (const match of value.matchAll(/src=["'](file:[^"'<]*)/gi)) references.add(match[1].replace(/&amp;/g, '&'));
    if (value.startsWith('file:')) references.add(value);
  } else if (Array.isArray(value)) value.forEach(collect);
  else if (value && typeof value === 'object') Object.values(value).forEach(collect);
}

function rewrite(value, replacements) {
  if (typeof value === 'string') {
    for (const [source, target] of replacements) value = value.split(source).join(target);
    return value;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => value[index] = rewrite(child, replacements));
    return value;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) value[key] = rewrite(value[key], replacements);
  }
  return value;
}

collect(library);
fs.mkdirSync(attachments, { recursive: true });
fs.mkdirSync(backups, { recursive: true });
const replacements = new Map();
for (const reference of references) {
  const missing = localPathFromImageSource(reference);
  if (!missing || fs.existsSync(missing)) continue;
  const match = path.basename(missing).match(/^[0-9a-f-]{36}\.([0-9a-f]{32}\.(?:jpe?g|png|gif|webp))$/i);
  if (!match) continue;
  const key = match[1].toLowerCase();
  const hash = key.slice(0, key.indexOf('.'));
  const source = path.join(effieRoot, 'attachments', hash[0], hash[1], hash[2], hash[3], key);
  if (!fs.existsSync(source)) continue;
  const destination = path.join(attachments, `recovered-effie-${key}`);
  if (!fs.existsSync(destination)) fs.copyFileSync(source, destination);
  replacements.set(reference, pathToFileURL(destination).href);
}

if (!replacements.size) throw new Error('没有找到可恢复的 Effie 图片');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const backup = path.join(backups, `library-before-image-recovery-${stamp}.json`);
fs.copyFileSync(libraryFile, backup);
rewrite(library, replacements);
const temporary = `${libraryFile}.recovering-${process.pid}`;
fs.writeFileSync(temporary, JSON.stringify(library, null, 2), 'utf8');
fs.renameSync(temporary, libraryFile);
console.log(JSON.stringify({ recoveredReferences: replacements.size, backup }, null, 2));
