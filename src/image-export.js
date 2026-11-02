const fs = require('fs');
const path = require('path');
const { fileURLToPath } = require('url');

const escapeText = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fonts = { system: 'Microsoft YaHei', serif: 'SimSun', kai: 'KaiTi', mono: 'Consolas', times: 'Times New Roman', arial: 'Arial', georgia: 'Georgia', heiti: 'SimHei', fangsong: 'FangSong', yahei: 'Microsoft YaHei' };
const {latinFonts} = require('./font-catalog');
const chineseFonts = {system:'Microsoft YaHei',yahei:'Microsoft YaHei',serif:'SimSun',kai:'KaiTi',heiti:'SimHei',fangsong:'FangSong'};
const cssFontName = value => /^[\w-]+$/.test(value) ? value : `"${String(value).replace(/["\\]/g, '\\$&')}"`;
function documentFontStack(payload) {
  const settings = payload?.settings || {};
  if (settings.latinFont || settings.chineseFont) {
    const latin = latinFonts[settings.latinFont] || latinFonts.system;
    const chinese = chineseFonts[settings.chineseFont] || chineseFonts.system;
    return `${cssFontName(latin)},${cssFontName(chinese)},serif`;
  }
  return `${cssFontName(fonts[payload?.font] || fonts.system)},serif`;
}
const templates = {
  classic: { background:'#ffffff',paper:'#ffffff',ink:'#303a43',accent:'#287ca6',muted:'#84919a',border:'#e5e9eb',rule:'none' },
  warm: { background:'#f3ead8',paper:'#fffaf0',ink:'#55483d',accent:'#a56a46',muted:'#a49988',border:'#e5d7be',rule:'none' },
  notebook: { background:'#eee1c8',paper:'#fffdf4',ink:'#4e504c',accent:'#627d70',muted:'#929a90',border:'#d9d0b9',rule:'repeating-linear-gradient(to bottom,transparent 0,transparent 43px,#b9c5bb55 44px)' },
  mist: { background:'#dbe9e7',paper:'#f9fdfc',ink:'#29474d',accent:'#327f83',muted:'#829c9d',border:'#bcd4d3',rule:'none' },
};
function decodeHtmlAttribute(value) {
  return String(value || '').replace(/&(?:amp|quot|apos|#39|#x27);/gi, entity => ({
    '&amp;':'&', '&quot;':'"', '&apos;':"'", '&#39;':"'", '&#x27;':"'"
  })[entity.toLowerCase()] || entity);
}
function localPathFromFileUrl(value) {
  const url = decodeHtmlAttribute(value);
  // Early versions wrote Windows drive URLs as file://E:/path. Chromium can
  // display that form, while Node's fileURLToPath correctly requires
  // file:///E:/path. Preserve compatibility with documents saved that way.
  if (/^file:\/\/[a-z]:[\\/]/i.test(url)) {
    const raw = url.slice('file://'.length);
    try { return decodeURIComponent(raw); } catch (_) { return raw; }
  }
  return fileURLToPath(url);
}
function inlineAttachments(html, attachmentRoot, imageSource) {
  // Live export windows use scoped file URLs; standalone callers retain a
  // self-contained data-URL fallback, including legacy local image references.
  return String(html || '').replace(/(src\s*=\s*)(["'])(file:[^"']+)\2/gi, (match, prefix, quote, url) => {
    try {
      const file = path.resolve(localPathFromFileUrl(url));
      if (!fs.statSync(file).isFile()) return match;
      const ext = path.extname(file).toLowerCase();
      const mime = ({'.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.gif':'image/gif','.webp':'image/webp','.svg':'image/svg+xml'})[ext];
      if (!mime) return match;
      if(imageSource)return `${prefix}${quote}${imageSource(file)}${quote}`;
      return `${prefix}${quote}data:${mime};base64,${fs.readFileSync(file).toString('base64')}${quote}`;
    } catch (_) { return match; }
  });
}
function buildImageHtml(payload, attachmentRoot, {imageSource}={}) {
  const choice = templates[payload?.template] || templates.classic;
  const font = documentFontStack(payload);
  const lineHeight = Math.min(2.6, Math.max(1.2, Number(payload?.settings?.lineHeight) || 1.75));
  const size = ({small:22,normal:26,large:30})[payload?.size] || 26;
  const width = [720,1080,1440].includes(Number(payload?.width)) ? Number(payload.width) : 720;
  const layout = width === 720 ? { sheet:34, pageX:49, pageY:48, radius:16, content:35 } : width === 1080 ? { sheet:46, pageX:72, pageY:58, radius:18, content:42 } : { sheet:64, pageX:96, pageY:72, radius:20, content:50 };
  const content = inlineAttachments(payload?.html, attachmentRoot,imageSource).replace(/\sloading=["']lazy["']/gi,'');
  const title = escapeText(payload?.title || '未命名文稿');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: qijian-image:; style-src 'unsafe-inline'"><style>*{box-sizing:border-box}::-webkit-scrollbar{display:none}html{scrollbar-width:none}html,body{margin:0;width:100%;overflow-x:hidden}body{font:${size}px/${lineHeight} ${font};color:${choice.ink};background:${choice.background};overflow-wrap:anywhere}.sheet{width:100%;min-height:100vh;padding:${layout.sheet}px;background:${choice.background}}.page{background:${choice.paper};border:1px solid ${choice.border};border-radius:${layout.radius}px;padding:${layout.pageY}px ${layout.pageX}px ${layout.pageY+10}px;min-height:calc(100vh - ${layout.sheet*2}px);background-image:${choice.rule}}.head{display:flex;align-items:center;justify-content:space-between;gap:18px;padding-bottom:22px;border-bottom:1px solid ${choice.border};color:${choice.muted};font:15px/1.3 "Microsoft YaHei",sans-serif}.brand{display:flex;align-items:center;gap:9px;color:${choice.accent};font-weight:600;letter-spacing:.12em}.mark{display:grid;place-items:center;width:27px;height:27px;border-radius:7px;background:${choice.accent};color:white;font:17px serif}.label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%}.content{padding-top:${layout.content}px}.content p{margin:0 0 25px}.content h1,.content h2,.content h3,.content h4,.content h5,.content h6{color:${choice.accent};line-height:1.4;break-after:avoid}.content h1{font-size:1.45em;margin:1.1em 0 .6em}.content h2{font-size:1.25em;margin:1.1em 0 .55em}.content h3{font-size:1.1em;margin:1em 0 .5em}.content blockquote{margin:1.2em 0;padding:.2em 0;border-left:0;color:${choice.muted}}.content ul,.content ol{padding-left:1.5em}.content li{margin:.4em 0}.content .image-row{display:flex;flex-wrap:wrap;gap:14px;align-items:flex-start;margin:24px 0}.content .image-row figure{flex:0 0 auto;width:calc(50% - 7px);min-width:0;margin:0}.content .image-row figure:only-child{width:100%;max-width:820px}.content figure{width:100%;max-width:100%;margin:24px auto;text-align:center}.content figure img,.content img{width:100%;max-width:100%;height:auto;display:block;margin:0 auto;border-radius:10px;box-shadow:0 5px 18px #0002}.content figure figcaption{margin-top:9px;color:${choice.muted};font:13px/1.5 "Microsoft YaHei",sans-serif;text-align:center}.content .table-block{width:100%;margin:1.2em 0;overflow:hidden}.content table{width:100%;border-collapse:collapse;table-layout:fixed;background:${choice.paper}}.content th,.content td{padding:.35em .55em;border:1px solid ${choice.border};font:inherit;line-height:1.35;text-align:left;vertical-align:top;overflow-wrap:anywhere}.content th{font-weight:700;background:${choice.background}}.content .editor-formula.formula-inline{display:inline-flex;align-items:baseline;margin:0 .08em;vertical-align:-.12em}.content .editor-formula.formula-block{display:flex;justify-content:center;width:100%;margin:1.2em 0;padding:.4em 0;overflow-x:auto}.content .editor-formula math{font-size:1em}.content pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#8882;padding:16px;border-radius:6px;font-size:.78em}.content code{font-size:.85em}.content hr{border:0;border-top:1px solid ${choice.border};margin:2em 0}.foot{margin-top:52px;padding-top:18px;border-top:1px solid ${choice.border};font:13px/1.3 "Microsoft YaHei",sans-serif;color:${choice.muted};text-align:right}</style></head><body><div class="sheet"><article class="page"><header class="head"><span class="brand"><span class="mark">栖</span>栖简</span><span class="label">${title}</span></header><div class="content">${content}</div><footer class="foot">栖简 · 本地写作</footer></article></div></body></html>`;
}
module.exports = { buildImageHtml, documentFontStack, inlineAttachments, localPathFromFileUrl, templates };

