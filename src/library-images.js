const { randomUUID } = require('crypto');
const fs = require('fs');
const path = require('path');
const { fileURLToPath, pathToFileURL } = require('url');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp', '.avif']);
const MIME_EXTENSIONS = {
  'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp',
  'image/svg+xml': '.svg', 'image/bmp': '.bmp', 'image/avif': '.avif',
};

function localPathFromImageSource(source, baseDirectory = '') {
  const value = String(source || '').trim().replace(/&amp;/g, '&');
  try {
    if (/^file:/i.test(value)) {
      if (/^file:\/\/[A-Za-z]:\//i.test(value)) return decodeURIComponent(value.slice(7)).replace(/\//g, '\\');
      return fileURLToPath(value);
    }
    if (path.isAbsolute(value)) return path.normalize(value);
    if (baseDirectory && value && !/^[a-z][a-z0-9+.-]*:/i.test(value)) return path.resolve(baseDirectory, decodeURIComponent(value));
  } catch (_) {}
  return '';
}

function isWithin(file, directory) {
  const relative = path.relative(path.resolve(directory), path.resolve(file));
  return relative !== '' && !relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative);
}

function storeImageData(data, extension, attachments) {
  const safeExtension = IMAGE_EXTENSIONS.has(String(extension || '').toLowerCase()) ? String(extension).toLowerCase() : '.png';
  fs.mkdirSync(attachments, { recursive: true });
  const destination = path.join(attachments, `image-${Date.now()}-${randomUUID()}${safeExtension}`);
  fs.writeFileSync(destination, data, { flag: 'wx' });
  return pathToFileURL(destination).href;
}

function adoptImageSource(source, attachments, cache, baseDirectory = '') {
  const embedded = String(source || '').match(/^data:(image\/(?:png|jpeg|gif|webp|svg\+xml|bmp|avif))((?:;[^,]*)?),([\s\S]+)$/i);
  if (embedded) {
    if (cache.has(source)) return cache.get(source);
    try {
      const data = /;base64/i.test(embedded[2]) ? Buffer.from(embedded[3], 'base64') : Buffer.from(decodeURIComponent(embedded[3]));
      if (!data.length) return source;
      const normalized = storeImageData(data, MIME_EXTENSIONS[embedded[1].toLowerCase()], attachments);
      cache.set(source, normalized);
      return normalized;
    } catch (_) { return source; }
  }
  const file = localPathFromImageSource(source, baseDirectory);
  const extension = path.extname(file).toLowerCase();
  if (!file || !IMAGE_EXTENSIONS.has(extension) || !fs.existsSync(file)) return source;
  const cacheKey = path.resolve(file).toLowerCase();
  if (cache.has(cacheKey)) return cache.get(cacheKey);
  if (isWithin(file, attachments)) {
    const normalized = pathToFileURL(path.resolve(file)).href;
    cache.set(cacheKey, normalized);
    return normalized;
  }
  try {
    const data = fs.readFileSync(file);
    if (!data.length) return source;
    const normalized = storeImageData(data, extension, attachments);
    cache.set(cacheKey, normalized);
    return normalized;
  } catch (_) { return source; }
}

function documentImageDirectory(attachments, documentId) {
  if (!documentId) throw new Error('图片缺少所属文稿');
  return path.join(attachments, 'doc-' + encodeURIComponent(String(documentId)));
}

function adoptLibraryImageSources(library, attachments, baseDirectory = '') {
  if (Array.isArray(library?.nodes)) {
    const results = library.nodes.filter(node => node.type === 'document').map(node => ({documentId:node.id,...adoptLibraryImageSources(node, documentImageDirectory(attachments,node.id), baseDirectory)}));
    return {changed:results.reduce((sum,item)=>sum+item.changed,0), replacements:results.flatMap(item=>item.replacements), documentReplacements:results.filter(item=>item.replacements.length).map(({documentId,replacements})=>({documentId,replacements}))};
  }
  const replacements = new Map();
  const cache = new Map();
  let changed = 0;

  function adopt(source) {
    const normalized = adoptImageSource(source, attachments, cache, baseDirectory);
    if (normalized !== source) {
      replacements.set(source, normalized);
      changed += 1;
    }
    return normalized;
  }

  function visit(value, key = '') {
    if (typeof value === 'string') {
      if (key === 'src' && value.trim()) return adopt(value);
      return value.replace(/(<img\b[^>]*\bsrc\s*=\s*)(["'])([^"']+)\2/gi, (match, prefix, quote, source) => {
        const normalized = adopt(source);
        return `${prefix}${quote}${normalized}${quote}`;
      });
    }
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) value[index] = visit(value[index], String(index));
      return value;
    }
    if (value && typeof value === 'object') {
      for (const [childKey, child] of Object.entries(value)) value[childKey] = visit(child, childKey);
    }
    return value;
  }

  visit(library);
  return { changed, replacements: [...replacements.entries()] };
}

function collectLibraryImageSources(value, sources, key = '') {
  if (typeof value === 'string') {
    if (key === 'src' && value.trim()) sources.add(value);
    for (const match of value.matchAll(/<img\b[^>]*\bsrc\s*=\s*(["'])([^"']+)\1/gi)) sources.add(match[2].replace(/&amp;/g, '&'));
  } else if (Array.isArray(value)) value.forEach((child) => collectLibraryImageSources(child, sources));
  else if (value && typeof value === 'object') for (const [childKey, child] of Object.entries(value)) collectLibraryImageSources(child, sources, childKey);
}

function replaceLibraryImageSources(value, replacements, key = '') {
  if (typeof value === 'string') {
    if (key === 'src' && replacements.has(value)) return replacements.get(value);
    for (const [source, target] of replacements) {
      value = value.split(source).join(target);
      if (source.includes('&')) value = value.split(source.replace(/&/g, '&amp;')).join(target);
    }
    return value;
  }
  if (Array.isArray(value)) {
    value.forEach((child, index) => value[index] = replaceLibraryImageSources(child, replacements, String(index)));
  } else if (value && typeof value === 'object') {
    for (const childKey of Object.keys(value)) value[childKey] = replaceLibraryImageSources(value[childKey], replacements, childKey);
  }
  return value;
}

async function adoptRemoteLibraryImageSources(library, attachments, fetchImage) {
  if (Array.isArray(library?.nodes)) {
    const results = [];
    for (const node of library.nodes.filter(node => node.type === 'document')) results.push({documentId:node.id,...await adoptRemoteLibraryImageSources(node,documentImageDirectory(attachments,node.id),fetchImage)});
    return {replacements:results.flatMap(item=>item.replacements),failures:results.flatMap(item=>item.failures),documentReplacements:results.filter(item=>item.replacements.length).map(({documentId,replacements})=>({documentId,replacements}))};
  }
  const sources = new Set();
  collectLibraryImageSources(library, sources);
  const replacements = new Map(), failures = [];
  await Promise.all([...sources].filter((source) => /^https?:\/\//i.test(source)).map(async (source) => {
    try {
      const result = await fetchImage(source);
      const mime = String(result.contentType || '').split(';')[0].trim().toLowerCase();
      let extension = MIME_EXTENSIONS[mime];
      if (!extension) {
        try { extension = path.extname(new URL(result.finalUrl || source).pathname).toLowerCase(); } catch (_) {}
      }
      if (!IMAGE_EXTENSIONS.has(extension) || !Buffer.isBuffer(result.data) || !result.data.length) throw new Error('返回内容不是受支持的图片');
      replacements.set(source, storeImageData(result.data, extension, attachments));
    } catch (error) {
      failures.push({ source, message: error?.message || String(error) });
    }
  }));
  replaceLibraryImageSources(library, replacements);
  return { replacements: [...replacements.entries()], failures };
}

function libraryImageIssues(library, attachments) {
  const sources = new Set();
  collectLibraryImageSources(library, sources);
  const issues = [];
  for (const source of sources) {
    const file = localPathFromImageSource(source);
    let readable = false;
    try { const stats = fs.statSync(file); readable = stats.isFile() && stats.size > 0; } catch (_) {}
    if (readable && isWithin(file, attachments)) continue;
    const reason = file && !readable ? 'missing' : 'external';
    issues.push({source, reason, message: reason === 'missing' ? '图片文件缺失或为空' : '图片尚未保存到文稿库'});
  }
  return issues;
}

function describeImageIssues(library, issues) {
  return (library.nodes || []).filter(node => node.type === 'document').map(node => {
    const sources = new Set();
    collectLibraryImageSources({content: node.content, contentJson: node.contentJson}, sources);
    const images = issues.filter(issue => sources.has(issue.source));
    const title = node.title || String(node.content || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0,48) || '未命名文稿';
    return {documentId: node.id, title, images};
  }).filter(item => item.images.length);
}

function removeUnreferencedAttachments(library, attachments, minimumAgeMs = 10 * 60 * 1000, candidateDirectories = [attachments]) {
  const sources = new Set();
  collectLibraryImageSources(library, sources);
  const referenced = new Set();
  for (const source of sources) {
    const file = localPathFromImageSource(source);
    if (file && isWithin(file, attachments)) referenced.add(path.resolve(file).toLowerCase());
  }
  const removed = [];
  function visit(directory) {
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch (_) { return; }
    for (const entry of entries) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) { visit(target); continue; }
      if (!entry.isFile() || !IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) continue;
      let stats;
      try { stats = fs.statSync(target); } catch (_) { continue; }
      if (referenced.has(path.resolve(target).toLowerCase()) || Date.now() - stats.mtimeMs < minimumAgeMs) continue;
      try { fs.unlinkSync(target); removed.push({ path: target, bytes: stats.size }); } catch (_) {}
    }
  }
  for (const directory of candidateDirectories) {
    if (path.resolve(directory) !== path.resolve(attachments) && !isWithin(directory, attachments)) throw new Error('附件清理范围无效');
    visit(directory);
  }
  return removed;
}

module.exports = { documentImageDirectory, libraryImageIssues, describeImageIssues, adoptLibraryImageSources, adoptRemoteLibraryImageSources, collectLibraryImageSources, replaceLibraryImageSources, localPathFromImageSource, removeUnreferencedAttachments };
