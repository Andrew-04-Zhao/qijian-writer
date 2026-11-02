import {Fragment, Schema, DOMParser as PMDOMParser, DOMSerializer, Slice} from 'prosemirror-model';
import {AllSelection, EditorState, NodeSelection, Plugin, TextSelection} from 'prosemirror-state';
import {EditorView} from 'prosemirror-view';
import {schema as basicSchema} from 'prosemirror-schema-basic';
import {history, undo, redo, closeHistory} from 'prosemirror-history';
import {keymap} from 'prosemirror-keymap';
import {
  baseKeymap,
  createParagraphNear,
  deleteSelection,
  exitCode,
  joinBackward,
  joinForward,
  liftEmptyBlock,
  selectNodeBackward,
  selectNodeForward,
  setBlockType,
  splitBlock,
  toggleMark
} from 'prosemirror-commands';
import {addListNodes, liftListItem, sinkListItem, splitListItem, wrapInList} from 'prosemirror-schema-list';
import {gapCursor} from 'prosemirror-gapcursor';
import {inputRules, textblockTypeInputRule, undoInputRule, wrappingInputRule} from 'prosemirror-inputrules';

const STRUCTURED_CLIPBOARD = 'application/x-qijian-fragment+json';

function safeJson(value, fallback) {
  try { return JSON.parse(value); } catch (_) { return fallback; }
}

function alignmentAttrs(dom) {
  const align = dom.style?.textAlign || dom.getAttribute?.('align') || '';
  return {align: /^(left|center|right|justify)$/.test(align) ? align : null};
}

function alignedBlockSpec(base, tagName) {
  return {
    ...base,
    attrs: {...(base.attrs || {}), align: {default: null}},
    parseDOM: [{tag: tagName, getAttrs: alignmentAttrs}],
    toDOM(node) {
      const attrs = node.attrs.align ? {style: `text-align:${node.attrs.align}`} : {};
      return [tagName, attrs, 0];
    }
  };
}

function tableRows(matrix) {
  const rows = Array.isArray(matrix) && matrix.length ? matrix : [['']];
  return ['tbody', {}, ...rows.map((row, rowIndex) => [
    'tr', {}, ...row.map(value => [rowIndex === 0 ? 'th' : 'td', {}, String(value ?? '')])
  ])];
}

function tableAttrs(dom) {
  const table = dom.matches?.('table') ? dom : dom.querySelector?.('table');
  const matrix = table ? [...table.rows].map(row => [...row.cells].map(cell => cell.textContent || '')) : [['']];
  const fontSize = parseFloat(dom.style?.fontSize || table?.style?.fontSize || '') || 15;
  return {matrix: JSON.stringify(matrix), fontSize};
}

function imageAttrs(dom) {
  const figure = dom.matches?.('figure') ? dom : dom.closest?.('figure');
  const image = dom.matches?.('img') ? dom : figure?.querySelector?.('img');
  const width = parseFloat(figure?.style?.width || image?.getAttribute?.('width') || '') || null;
  return {
    src: image?.getAttribute?.('src') || '',
    alt: image?.getAttribute?.('alt') || '',
    title: image?.getAttribute?.('title') || '',
    caption: figure?.querySelector?.('figcaption')?.textContent || '',
    width,
    id: figure?.dataset?.imageId || ''
  };
}

let nodes = addListNodes(basicSchema.spec.nodes.remove('image'), 'block+', 'block');
nodes = nodes.update('paragraph', alignedBlockSpec(nodes.get('paragraph'), 'p'));
nodes = nodes.update('heading', {
  ...nodes.get('heading'),
  attrs: {level: {default: 1}, align: {default: null}},
  parseDOM: [1, 2, 3, 4, 5, 6].map(level => ({tag: `h${level}`, attrs: {level}, getAttrs: dom => ({level, ...alignmentAttrs(dom)})})),
  toDOM(node) {
    const attrs = node.attrs.align ? {style: `text-align:${node.attrs.align}`} : {};
    return [`h${node.attrs.level}`, attrs, 0];
  }
});
nodes = nodes.update('bullet_list', {
  ...nodes.get('bullet_list'),
  attrs: {outlineId: {default: null}},
  parseDOM: [{tag: 'ul', getAttrs: dom => ({outlineId: dom.dataset?.outlineId || null})}],
  toDOM(node) { return ['ul', {class: 'outline-list', 'data-outline-id': node.attrs.outlineId || null}, 0]; }
});
nodes = nodes.update('ordered_list', {
  ...nodes.get('ordered_list'),
  attrs: {order: {default: 1}, outlineId: {default: null}},
  parseDOM: [{tag: 'ol', getAttrs: dom => ({order: dom.hasAttribute('start') ? +dom.getAttribute('start') : 1, outlineId: dom.dataset?.outlineId || null})}],
  toDOM(node) {
    const attrs = {class: 'outline-list', 'data-outline-id': node.attrs.outlineId || null};
    if (node.attrs.order !== 1) attrs.start = node.attrs.order;
    return ['ol', attrs, 0];
  }
});
nodes = nodes.update('list_item', {
  ...nodes.get('list_item'),
  attrs: {collapsed: {default: false}},
  parseDOM: [{tag: 'li', getAttrs: dom => ({collapsed: dom.classList.contains('outline-collapsed')})}],
  toDOM(node) { return ['li', node.attrs.collapsed ? {class: 'outline-collapsed'} : {}, 0]; }
});
nodes = nodes.addBefore('horizontal_rule', 'note', {
  group: 'block', content: 'inline*', defining: true,
  parseDOM: [{tag: 'aside.editor-note'}, {tag: 'aside'}],
  toDOM() { return ['aside', {class: 'editor-note'}, 0]; }
});
nodes = nodes.addBefore('horizontal_rule', 'formula_block', {
  group: 'block', atom: true, selectable: true,
  attrs: {latex: {default: ''}, sourceText: {default: ''}},
  parseDOM: [{tag: '.editor-formula.formula-block', getAttrs: dom => ({latex: dom.dataset.latex || dom.textContent || '', sourceText: dom.dataset.formulaSource || ''})}],
  toDOM(node) { return ['div', {class: 'editor-formula formula-block', 'data-latex': node.attrs.latex, 'data-formula-source': node.attrs.sourceText || null, contenteditable: 'false'}, ['span', {class: 'formula-render'}, node.attrs.latex]]; }
});
nodes = nodes.addBefore('horizontal_rule', 'image_row', {
  group: 'block', content: 'image_item+', isolating: true,
  parseDOM: [{tag: 'div.image-row'}],
  toDOM() { return ['div', {class: 'image-row'}, 0]; }
});
nodes = nodes.addBefore('horizontal_rule', 'image_item', {
  group: 'image_item', atom: true, selectable: true, draggable: true,
  attrs: {
    src: {default: ''}, alt: {default: ''}, title: {default: ''}, caption: {default: ''},
    width: {default: null}, id: {default: ''}
  },
  parseDOM: [
    {tag: 'figure.editor-image', getAttrs: imageAttrs},
    {tag: 'img[src]', getAttrs: imageAttrs}
  ],
  toDOM(node) {
    const figure = {class: 'editor-image', tabindex: '0', 'data-image-id': node.attrs.id || null};
    if (node.attrs.width) figure.style = `width:${node.attrs.width}px`;
    const image = {src: node.attrs.src, alt: node.attrs.alt || '', title: node.attrs.title || null, draggable: 'false'};
    return ['figure', figure, ['img', image], ['figcaption', {}, node.attrs.caption || '']];
  }
});
nodes = nodes.addBefore('horizontal_rule', 'table_block', {
  group: 'block', atom: true, selectable: true, isolating: true,
  attrs: {matrix: {default: '[[""]]'}, fontSize: {default: 15}},
  parseDOM: [
    {tag: 'div.table-block', getAttrs: tableAttrs},
    {tag: 'table', getAttrs: tableAttrs}
  ],
  toDOM(node) {
    const matrix = safeJson(node.attrs.matrix, [['']]);
    return ['div', {class: 'table-block', style: `font-size:${node.attrs.fontSize}px`, tabindex: '0', contenteditable: 'false'},
      ['table', {}, tableRows(matrix)],
      ['button', {class: 'table-edit-button', type: 'button', title: '编辑表格', 'aria-label': '编辑表格'}, '✎']
    ];
  }
});
nodes = nodes.addBefore('text', 'formula_inline', {
  inline: true, group: 'inline', atom: true, selectable: true,
  attrs: {latex: {default: ''}, sourceText: {default: ''}},
  parseDOM: [{tag: '.editor-formula.formula-inline', getAttrs: dom => ({latex: dom.dataset.latex || dom.textContent || '', sourceText: dom.dataset.formulaSource || ''})}],
  toDOM(node) { return ['span', {class: 'editor-formula formula-inline', 'data-latex': node.attrs.latex, 'data-formula-source': node.attrs.sourceText || null, contenteditable: 'false'}, ['span', {class: 'formula-render'}, node.attrs.latex]]; }
});

let marks = basicSchema.spec.marks;
marks = marks.addToEnd('strike', {
  parseDOM: [{tag: 's'}, {tag: 'strike'}, {tag: 'del'}],
  toDOM() { return ['s', 0]; }
});
marks = marks.addToEnd('annotation', {
  parseDOM: [{tag: 'mark'}, {tag: '.editor-annotation'}, {tag: '[data-qijian-mark="annotation"]'}],
  toDOM() { return ['mark', {class: 'editor-annotation'}, 0]; }
});
marks = marks.addToEnd('comment', {
  parseDOM: [{tag: '.editor-comment'}],
  toDOM() { return ['span', {class: 'editor-comment'}, 0]; }
});

const schema = new Schema({nodes, marks});

function normalizeLegacyHtml(html) {
  const holder = document.createElement('div');
  holder.innerHTML = html || '<p><br></p>';
  holder.querySelectorAll('ul,ol').forEach(list => list.classList.add('outline-list'));
  holder.querySelectorAll('p').forEach(paragraph => {
    const children = [...paragraph.childNodes].filter(node => !(node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) && !(node.nodeType === Node.ELEMENT_NODE && node.tagName === 'BR'));
    if (children.length !== 1 || children[0].nodeType !== Node.ELEMENT_NODE || children[0].tagName !== 'IMG') return;
    const image = children[0];
    const row = document.createElement('div');
    row.className = 'image-row';
    const figure = document.createElement('figure');
    figure.className = 'editor-image';
    figure.append(image.cloneNode(true), document.createElement('figcaption'));
    row.appendChild(figure);
    paragraph.replaceWith(row);
  });
  holder.querySelectorAll(':scope > figure.editor-image').forEach(figure => {
    const row = document.createElement('div');
    row.className = 'image-row';
    figure.replaceWith(row); row.appendChild(figure);
  });
  holder.querySelectorAll(':scope > table').forEach(table => {
    const block = document.createElement('div');
    block.className = 'table-block'; table.replaceWith(block); block.appendChild(table);
  });
  return holder;
}

function docFromHtml(html) {
  const holder = normalizeLegacyHtml(html);
  const parsed = PMDOMParser.fromSchema(schema).parse(holder);
  return parsed.childCount ? parsed : schema.topNodeType.createAndFill();
}

function nodeViewForFormula(node, inline) {
  const dom = document.createElement(inline ? 'span' : 'div');
  dom.className = `editor-formula formula-${inline ? 'inline' : 'block'}`;
  dom.dataset.latex = node.attrs.latex;
  if (node.attrs.sourceText) dom.dataset.formulaSource = node.attrs.sourceText;
  dom.contentEditable = 'false';
  dom.tabIndex = 0;
  const render = document.createElement('span');
  render.className = 'formula-render'; dom.appendChild(render);
  try {
    if (window.katex) window.katex.render(node.attrs.latex, render, {displayMode: !inline, throwOnError: false, strict: 'warn', trust: false});
    else render.textContent = node.attrs.latex;
  } catch (_) { render.textContent = node.attrs.latex; }
  return {dom, update(next) { if (next.type !== node.type) return false; if(next.attrs.latex===node.attrs.latex&&next.attrs.sourceText===node.attrs.sourceText){node=next;return true} node = next; dom.dataset.latex = next.attrs.latex; if (next.attrs.sourceText) dom.dataset.formulaSource = next.attrs.sourceText; else delete dom.dataset.formulaSource; render.textContent = next.attrs.latex; try { window.katex?.render(next.attrs.latex, render, {displayMode: !inline, throwOnError: false, strict: 'warn', trust: false}); } catch (_) {} return true; }};
}

function nodeViewForImage(node) {
  const dom = document.createElement('figure');
  dom.className = 'editor-image';
  dom.tabIndex = 0;
  dom.dataset.imageId = node.attrs.id || '';
  dom.setAttribute('aria-label', '图片，按 Delete 或 Backspace 删除，按 Enter 在旁边新建空行');
  const image = document.createElement('img');
  image.draggable = false;
  image.loading = 'lazy';
  image.decoding = 'async';
  const caption = document.createElement('figcaption');
  caption.contentEditable = 'false';
  const grip = document.createElement('span');
  grip.className = 'image-drag-grip';
  grip.contentEditable = 'false';
  grip.textContent = '•••';
  dom.append(image, caption, grip);
  for (const corner of ['nw', 'ne', 'sw', 'se']) {
    const handle = document.createElement('span');
    handle.className = 'image-resize-handle';
    handle.dataset.corner = corner;
    handle.contentEditable = 'false';
    dom.appendChild(handle);
  }
  const render = current => {
    node = current;
    image.src = current.attrs.src;
    image.alt = current.attrs.alt || '';
    if (current.attrs.title) image.title = current.attrs.title;
    else image.removeAttribute('title');
    caption.textContent = current.attrs.caption || '';
    dom.dataset.imageId = current.attrs.id || '';
    if (current.attrs.width) dom.style.width = `${current.attrs.width}px`;
    else dom.style.removeProperty('width');
  };
  render(node);
  return {dom, update(next) { if (next.type !== node.type) return false; render(next); return true; }, ignoreMutation: () => true};
}

function headingEnter(state, dispatch) {
  const {$from, empty} = state.selection;
  if (!empty || $from.parent.type !== schema.nodes.heading) return false;
  const parent = $from.parent;
  const offset = $from.parentOffset;
  const start = $from.before();
  const end = $from.after();
  const paragraph = schema.nodes.paragraph;
  let tr = state.tr;
  if (offset === 0) {
    tr = tr.insert(start, paragraph.create()).setSelection(TextSelection.create(tr.doc, start + 1));
  } else {
    const before = parent.content.cut(0, offset);
    const after = parent.content.cut(offset);
    const replacement = [parent.type.create(parent.attrs, before, parent.marks), paragraph.create(null, after)];
    tr = tr.replaceWith(start, end, replacement).setSelection(TextSelection.create(tr.doc, start + replacement[0].nodeSize + 1));
  }
  dispatch?.(tr.scrollIntoView());
  return true;
}

function markForName(name) {
  return ({bold: schema.marks.strong, italic: schema.marks.em, strikeThrough: schema.marks.strike,
    annotation: schema.marks.annotation, comment: schema.marks.comment, codeInline: schema.marks.code})[name] || null;
}

function blockAtDom(view, dom, typeName = null) {
  if (!dom || !view.dom.contains(dom)) return null;
  let pos;
  try { pos = view.posAtDOM(dom, 0); } catch (_) { return null; }
  for (let depth = view.state.doc.resolve(Math.max(0, pos)).depth; depth >= 0; depth--) {
    const $pos = view.state.doc.resolve(Math.max(0, pos));
    const node = $pos.node(depth);
    if (!typeName || node.type.name === typeName) return {node, pos: depth ? $pos.before(depth) : 0};
  }
  return null;
}

function imageFileData(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
    const mimeByExtension = {png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',bmp:'image/bmp',avif:'image/avif'};
    const mime = String(file.type || '').startsWith('image/') ? file.type : mimeByExtension[String(file.name || '').split('.').pop().toLowerCase()];
    reader.readAsDataURL(mime ? new Blob([file], {type:mime}) : file);
  });
}

function clipboardTableElement(matrix) {
  const block = document.createElement('div');
  block.className = 'table-block';
  const table = document.createElement('table'), body = document.createElement('tbody');
  matrix.forEach((row, rowIndex) => {
    const tr = document.createElement('tr');
    row.forEach(value => {
      const cell = document.createElement(rowIndex === 0 ? 'th' : 'td');
      cell.textContent = String(value ?? ''); tr.appendChild(cell);
    });
    body.appendChild(tr);
  });
  table.appendChild(body); block.appendChild(table); return block;
}

function clipboardInlineMarkdownHtml(text) {
  if (typeof window.parseMarkdown !== 'function') return document.createTextNode(String(text || '')).textContent;
  const holder = document.createElement('div');
  holder.innerHTML = window.parseMarkdown(String(text || ''));
  return holder.firstElementChild?.innerHTML || holder.innerHTML;
}

function clipboardOutlineElement(lines) {
  const root = document.createElement('div'), stack = [];
  const parsed = lines.map(line => {
    const match = String(line).match(/^([ \t]*)([-+*]|(\d+)[.)])\s+(.+)$/);
    if (!match) return null;
    const width = [...match[1]].reduce((total, character) => total + (character === '\t' ? 2 : 1), 0);
    return {width, ordered: !!match[3], order: Number(match[3]) || 1, text: match[4]};
  });
  const positive = parsed.filter(Boolean).map(item => item.width).filter(Boolean);
  const unit = positive.length ? Math.max(1, Math.min(...positive)) : 2;
  for (const item of parsed) {
    if (!item) continue;
    let depth = Math.max(0, Math.round(item.width / unit));
    depth = Math.min(depth, stack.length);
    const tag = item.ordered ? 'ol' : 'ul';
    let list = stack[depth];
    if (!list || list.tagName.toLowerCase() !== tag) {
      list = document.createElement(tag); list.className = 'outline-list';
      if (item.ordered && item.order !== 1) list.start = item.order;
      if (!depth) root.appendChild(list);
      else {
        const parentItem = stack[depth - 1]?.lastElementChild;
        if (parentItem) parentItem.appendChild(list);
        else { depth = 0; root.appendChild(list); }
      }
      stack[depth] = list;
    }
    stack.length = depth + 1;
    const listItem = document.createElement('li'), paragraph = document.createElement('p');
    paragraph.innerHTML = clipboardInlineMarkdownHtml(item.text);
    listItem.appendChild(paragraph); list.appendChild(listItem);
  }
  return root;
}

function plainClipboardHolder(text) {
  const source = String(text || '').replace(/\r\n?/g, '\n'), lines = source.split('\n');
  const holder = document.createElement('div'); let prose = [];
  const flushProse = () => {
    if (!prose.length) return;
    const value = prose.join('\n'); prose = [];
    if (!value.trim()) return;
    const part = document.createElement('div');
    part.innerHTML = typeof window.parseMarkdown === 'function' ? window.parseMarkdown(value) : value.split('\n').map(line => `<p>${line}</p>`).join('');
    holder.append(...part.childNodes);
  };
  const pipeCells = line => String(line).trim().replace(/^\||\|$/g, '').split(/(?<!\\)\|/).map(cell => cell.replace(/\\\|/g, '|').trim());
  const pipeSeparator = line => {
    const cells = pipeCells(line);
    return cells.length > 1 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
  };
  for (let index = 0; index < lines.length;) {
    if (index + 1 < lines.length && lines[index].includes('|') && pipeSeparator(lines[index + 1])) {
      flushProse(); const rows = [pipeCells(lines[index])]; index += 2;
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) rows.push(pipeCells(lines[index++]));
      const width = Math.max(...rows.map(row => row.length));
      holder.appendChild(clipboardTableElement(rows.map(row => [...row, ...Array(width - row.length).fill('')]))); continue;
    }
    const tabWidth = lines[index].split('\t').length;
    if (tabWidth > 1) {
      const rows = []; let end = index;
      while (end < lines.length && lines[end].trim() && lines[end].split('\t').length === tabWidth) rows.push(lines[end++].split('\t'));
      if (rows.length >= 2) { flushProse(); holder.appendChild(clipboardTableElement(rows)); index = end; continue; }
    }
    if (/^[ \t]*(?:[-+*]|\d+[.)])\s+\S/.test(lines[index])) {
      flushProse(); const outline = [];
      while (index < lines.length && /^[ \t]*(?:[-+*]|\d+[.)])\s+\S/.test(lines[index])) outline.push(lines[index++]);
      holder.append(...clipboardOutlineElement(outline).childNodes); continue;
    }
    prose.push(lines[index++]);
  }
  flushProse();
  if (!holder.childNodes.length) holder.innerHTML = '<p><br></p>';
  return holder;
}

function defaultFormulaSource(latex, mode = 'inline') {
  return mode === 'block' ? `\\[\n${latex}\n\\]` : `\\(${latex}\\)`;
}

function formulaRenders(latex, displayMode = false) {
  const source = String(latex || '').trim();
  if (!source || source.length > 20000) return false;
  try {
    if (window.katex?.renderToString) window.katex.renderToString(source, {displayMode, throwOnError: true, strict: 'ignore', trust: false, maxExpand: 1000});
    return true;
  } catch (_) { return false; }
}

const likelyInlineLatex = /\\(?:boldsymbol|mathbf|mathrm|mathit|mathcal|mathbb|frac|dfrac|tfrac|sqrt|sum|prod|int|lim|left|right|vec|hat|bar|overline|underline|operatorname|exp|max|min|times|cdot|circ|mu|alpha|beta|gamma|delta|theta|lambda|sigma|omega|Delta|Gamma|Theta|Lambda|Sigma|Omega)(?![A-Za-z])|[_^=+\-*/<>]/;
const likelyBlockStart = /^\\[A-Za-z]+(?:\b|(?=[{[(\\]))/;

function inferredInlineFormulaLooksLikely(latex) {
  const source = String(latex || '');
  return /\\(?:boldsymbol|mathbf|mathrm|mathit|mathcal|mathbb|frac|dfrac|tfrac|sqrt|sum|prod|int|lim|left|right|vec|hat|bar|overline|underline|operatorname|exp|max|min|times|cdot|circ|mu|alpha|beta|gamma|delta|theta|lambda|sigma|omega|Delta|Gamma|Theta|Lambda|Sigma|Omega)(?![A-Za-z])/.test(source)
    || /[_^](?:\{[^{}\n]+\}|[A-Za-z0-9])/.test(source);
}

function blockFormulaAt(lines, index) {
  const first = String(lines[index] || '').trim();
  const single = [
    first.match(/^\$\$\s*([\s\S]+?)\s*\$\$$/),
    first.match(/^\\\[\s*([\s\S]+?)\s*\\\]$/),
    first.match(/^\[\s*([\s\S]*\\[A-Za-z]+[\s\S]*?)\s*\]$/)
  ];
  for (const match of single) if (match && formulaRenders(match[1], true)) return {latex: match[1].trim(), sourceText: lines[index], end: index};

  const wrapped = [
    {open: '$$', close: '$$', plain: false},
    {open: '\\[', close: '\\]', plain: false},
    {open: '[', close: ']', plain: true}
  ].find(spec => first === spec.open || first.startsWith(spec.open));
  if (wrapped) {
    const body = [first.slice(wrapped.open.length)];
    for (let end = index + 1; end < Math.min(lines.length, index + 80); end++) {
      const value = String(lines[end] || ''), trimmed = value.trim();
      if (trimmed === wrapped.close || trimmed.endsWith(wrapped.close)) {
        body.push(trimmed === wrapped.close ? '' : value.slice(0, value.lastIndexOf(wrapped.close)));
        const latex = body.join('\n').trim();
        if ((!wrapped.plain || /\\[A-Za-z]+/.test(latex)) && formulaRenders(latex, true)) return {latex, sourceText: lines.slice(index, end + 1).join('\n'), end};
        break;
      }
      body.push(value);
    }
  }

  if (likelyBlockStart.test(first)) {
    for (let end = index + 1; end < Math.min(lines.length, index + 80); end++) {
      if (String(lines[end] || '').trim() !== ']') continue;
      const latex = lines.slice(index, end).join('\n').trim();
      if (formulaRenders(latex, true)) return {latex, sourceText: lines.slice(index, end + 1).join('\n'), end};
      break;
    }
  }
  return null;
}

function clipboardFormulaElement(latex, mode, sourceText) {
  const formula = document.createElement(mode === 'block' ? 'div' : 'span');
  formula.className = `editor-formula formula-${mode}`;
  formula.dataset.latex = latex;
  formula.dataset.formulaSource = sourceText || defaultFormulaSource(latex, mode);
  formula.contentEditable = 'false';
  const render = document.createElement('span'); render.className = 'formula-render'; formula.appendChild(render);
  return formula;
}

function sanitizeClipboardHolder(holder) {
  const walker = document.createTreeWalker(holder, NodeFilter.SHOW_COMMENT), comments = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  comments.forEach(comment => comment.remove());
  holder.querySelectorAll('script,style,meta,link,iframe,object,embed').forEach(node => node.remove());
  holder.querySelectorAll('*').forEach(node => {
    for (const attribute of [...node.attributes]) if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
    for (const property of ['font-family', 'font-size', 'line-height', 'letter-spacing']) node.style?.removeProperty(property);
    if (node.hasAttribute('style') && !node.getAttribute('style').trim()) node.removeAttribute('style');
  });
  holder.querySelectorAll('font').forEach(node => node.replaceWith(...node.childNodes));
  holder.querySelectorAll('b').forEach(node => { const strong = document.createElement('strong'); strong.append(...node.childNodes); node.replaceWith(strong); });
  holder.querySelectorAll('i').forEach(node => { const emphasis = document.createElement('em'); emphasis.append(...node.childNodes); node.replaceWith(emphasis); });
  holder.querySelectorAll('ul,ol').forEach(list => list.classList.add('outline-list'));
  holder.querySelectorAll('.outline-control-hover,.outline-collapsed').forEach(node => node.classList.remove('outline-control-hover', 'outline-collapsed'));
  holder.querySelectorAll('.image-resize-handle,.image-drag-grip,.table-edit-button').forEach(node => node.remove());
  return holder;
}

function normalizeClipboardTables(holder) {
  for (const table of [...holder.querySelectorAll('table')]) {
    if (table.closest('.table-block')) continue;
    const block = document.createElement('div'); block.className = 'table-block';
    table.replaceWith(block); block.appendChild(table);
  }
}

function meaningfulClipboardNode(node) {
  return node.nodeType === Node.ELEMENT_NODE || (node.nodeType === Node.TEXT_NODE && node.textContent.trim());
}

function normalizeClipboardImages(holder) {
  for (const image of [...holder.querySelectorAll('img')]) {
    if (image.closest('figure.editor-image')) continue;
    const figure = document.createElement('figure'); figure.className = 'editor-image';
    image.replaceWith(figure); figure.append(image, document.createElement('figcaption'));
  }
  for (const figure of [...holder.querySelectorAll('figure.editor-image')]) {
    if (figure.parentElement?.classList.contains('image-row')) continue;
    const row = document.createElement('div'); row.className = 'image-row';
    const parent = figure.parentElement;
    if (parent?.matches('p,h1,h2,h3,h4,h5,h6,blockquote,aside') && [...parent.childNodes].filter(meaningfulClipboardNode).length > 1) {
      parent.parentElement?.insertBefore(row, parent.nextSibling); row.appendChild(figure); continue;
    }
    if (parent?.matches('p,h1,h2,h3,h4,h5,h6,blockquote,aside') && parent.parentElement) {
      parent.replaceWith(row); row.appendChild(figure); continue;
    }
    figure.replaceWith(row); row.appendChild(figure);
  }
}

function clipboardTextBlocks(parent) {
  return [...parent.children].map(node => {
    const eligible = node.matches('p,div') && !node.matches('.editor-formula,.image-row,.table-block') && !node.querySelector('table,img,.editor-formula');
    return {node, eligible, text: eligible ? node.textContent || '' : ''};
  });
}

function normalizeClipboardBlockFormulas(holder) {
  const parents = [holder, ...holder.querySelectorAll('li,blockquote')].reverse();
  for (const parent of parents) {
    let changed = true;
    while (changed) {
      changed = false; const blocks = clipboardTextBlocks(parent);
      for (let index = 0; index < blocks.length; index++) {
        if (!blocks[index].eligible) continue;
        const run = [];
        for (let cursor = index; cursor < Math.min(blocks.length, index + 80) && blocks[cursor].eligible; cursor++) run.push(blocks[cursor].text);
        const formula = blockFormulaAt(run, 0);
        if (!formula) continue;
        const replacement = clipboardFormulaElement(formula.latex, 'block', formula.sourceText);
        blocks[index].node.replaceWith(replacement);
        for (let offset = 1; offset <= formula.end; offset++) blocks[index + offset].node.remove();
        changed = true; break;
      }
    }
  }
}

function normalizeClipboardInlineFormulas(holder) {
  const blocks = [...holder.querySelectorAll('p,h1,h2,h3,h4,h5,h6,aside,blockquote')];
  if (!blocks.length) blocks.push(holder);
  for (const block of blocks) {
    for (let attempts = 0; attempts < 200; attempts++) {
      const walker = document.createTreeWalker(block, NodeFilter.SHOW_TEXT), entries = [];
      let source = '', textNode;
      while ((textNode = walker.nextNode())) {
        if (textNode.parentElement?.closest('pre,code,.editor-formula,.table-block')) continue;
        entries.push({node: textNode, start: source.length, end: source.length + textNode.textContent.length});
        source += textNode.textContent;
      }
      const pattern = /\\\((.+?)\\\)|(?<!\\)\$([^$\n]+?)(?<!\\)\$|\(([^()\n]+)\)/g;
      let match, accepted = null;
      while ((match = pattern.exec(source))) {
        const latex = String(match[1] ?? match[2] ?? match[3] ?? '').trim(), inferred = match[3] !== undefined;
        if (!latex || (inferred && !inferredInlineFormulaLooksLikely(latex)) || !formulaRenders(latex, false)) continue;
        accepted = {match, latex}; break;
      }
      if (!accepted) break;
      const start = accepted.match.index, end = start + accepted.match[0].length;
      const startEntry = entries.find(entry => start >= entry.start && start < entry.end) || entries.find(entry => start === entry.end);
      const endEntry = [...entries].reverse().find(entry => end > entry.start && end <= entry.end) || entries.find(entry => end === entry.start);
      if (!startEntry || !endEntry) break;
      const range = document.createRange();
      range.setStart(startEntry.node, Math.max(0, start - startEntry.start));
      range.setEnd(endEntry.node, Math.max(0, end - endEntry.start));
      range.deleteContents(); range.insertNode(clipboardFormulaElement(accepted.latex, 'inline', accepted.match[0]));
    }
  }
}

function plainTextSuggestsStructure(text) {
  const source = String(text || '');
  return /(?:^|\n)\s*(?:#{1,6}\s+|[-+*]\s+|\d+[.)]\s+|>\s+|```|%%\s+|\$\$|\\\[|\[\s*\\[A-Za-z])/.test(source)
    || /(?:^|\n)[^\n]*\|[^\n]*\n\s*\|?\s*:?-{3,}/.test(source)
    || /(?:^|\n)[^\n]*\t[^\n]*(?:\n[^\n]*\t[^\n]*)/.test(source);
}

function plainTextHasExplicitFormulaSyntax(text) {
  const source = String(text || '').replace(/\r\n?/g, '\n');
  return /\\\([\s\S]+?\\\)|\\\[[\s\S]+?\\\]|\$\$[\s\S]+?\$\$/.test(source);
}

function htmlHasClipboardStructure(html) {
  return /<(?:table|ul|ol|h[1-6]|blockquote|pre|figure|img)\b|class\s*=\s*["'][^"']*(?:editor-formula|image-row|table-block)/i.test(String(html || ''));
}

function htmlCarriesContentMissingFromPlain(html, plainText) {
  const htmlSource = String(html || ''), plain = String(plainText || '');
  if (/<(?:figure|img)\b|class\s*=\s*["'][^"']*image-row/i.test(htmlSource)) return true;
  if (/<table\b/i.test(htmlSource) && !/(?:^|\n)[^\n]*\t[^\n]*(?:\n[^\n]*\t[^\n]*)|(?:^|\n)[^\n]*\|[^\n]*\n\s*\|?\s*:?-{3,}/.test(plain)) return true;
  if (/<(?:ul|ol)\b/i.test(htmlSource) && !/(?:^|\n)[ \t]*(?:[-+*]|\d+[.)])\s+\S/.test(plain)) return true;
  if (/<(?:strong|b)\b/i.test(htmlSource) && !/\*\*[^*]+\*\*/.test(plain)) return true;
  if (/<(?:em|i)\b/i.test(htmlSource) && !/(?:^|[^*])\*[^*\n]+\*/.test(plain)) return true;
  if (/<(?:s|strike|del)\b/i.test(htmlSource) && !/~~[^~]+~~/.test(plain)) return true;
  if (/<mark\b|editor-annotation/i.test(htmlSource) && !/::[^:]+::/.test(plain)) return true;
  if (/<code\b/i.test(htmlSource) && !/`[^`\n]+`/.test(plain)) return true;
  if (/<a\b/i.test(htmlSource) && !/\[[^\]]+\]\(https?:\/\/[^\s)]+\)/.test(plain)) return true;
  return false;
}

async function adoptImageElements(holder, baseDirectory = '', documentId = window.currentImageDocumentId?.()) {
  const images = [...holder.querySelectorAll('img')].filter(image => (image.getAttribute('src') || '').trim());
  if (!images.length) return;
  for (const image of images) {
    const source = image.getAttribute('src');
    if (/^blob:/i.test(source)) {
      const response = await fetch(source);
      image.setAttribute('src', await imageFileData(await response.blob()));
    }
  }
  const result = await window.qijian.adoptImageSources(images.map(image => image.getAttribute('src')), baseDirectory, documentId);
  const replacements = new Map(result.replacements);
  for (const image of images) {
    const source = image.getAttribute('src');
    image.setAttribute('src', replacements.get(source) || source);
    image.removeAttribute('srcset');
  }
}
window.adoptImageElements = adoptImageElements;

async function adoptClipboardImages(holder, imageItems = []) {
  try { await adoptImageElements(holder); }
  catch (error) {
    const images = [...holder.querySelectorAll('img')];
    const file = imageItems.length === 1 ? imageItems[0].getAsFile?.() : null;
    if (images.length !== 1 || !file) throw error;
    // A single clipboard bitmap is an exact fallback for its single HTML image.
    images[0].setAttribute('src', await imageFileData(file));
    await adoptImageElements(holder);
  }
  if (holder.querySelector('img') || !imageItems.length) return;
  const images = [];
  for (const item of imageItems) {
    const file = item.getAsFile?.(); if (!file) continue;
    const data = await imageFileData(file), attachment = await window.qijian.addAttachmentData(data, file.name || 'clipboard-image', window.currentImageDocumentId?.());
    const image = document.createElement('img'); image.src = attachment.url; image.alt = file.name || '插图'; images.push(image);
  }
  if (!images.length) return;
  const row = document.createElement('div'); row.className = 'image-row';
  for (const image of images) {
    const figure = document.createElement('figure'); figure.className = 'editor-image'; figure.dataset.imageId = 'img-' + Date.now().toString(36) + '-' + row.childElementCount;
    figure.append(image, document.createElement('figcaption')); row.appendChild(figure);
  }
  holder.appendChild(row);
}

async function pasteStructuredImages(view, slice) {
  const saved = {doc: view.state.doc, from: view.state.selection.from, to: view.state.selection.to};
  const data = slice.toJSON(), attrs = [];
  const collect = value => {
    if (value?.type === 'image_item' && value.attrs?.src) attrs.push(value.attrs);
    if (Array.isArray(value?.content)) value.content.forEach(collect);
  };
  collect(data);
  const holder = document.createElement('div');
  for (const item of attrs) { const image = document.createElement('img'); image.setAttribute('src',item.src); holder.appendChild(image); }
  await adoptImageElements(holder);
  [...holder.children].forEach((image,index) => attrs[index].src = image.getAttribute('src'));
  if (view.state.doc !== saved.doc) throw new Error('粘贴期间文稿已发生变化，请重新粘贴');
  view.dispatch(closeHistory(view.state.tr.replaceRange(saved.from, saved.to, Slice.fromJSON(schema, data))).scrollIntoView());
}

function clipboardSliceFromHolder(holder, plainText, forceBlocks = false) {
  const parsed = docFromHtml(holder.innerHTML);
  const inline = !forceBlocks && !/[\r\n\u2028\u2029]/.test(String(plainText || '')) && parsed.childCount === 1 && parsed.firstChild.type === schema.nodes.paragraph;
  return inline ? new Slice(parsed.firstChild.content, 0, 0) : new Slice(parsed.content, 0, 0);
}

async function pasteExternalClipboard(view, event, imageItems, clipboardHtml, plainText, targetRange = view.state.selection) {
  const saved = {doc: view.state.doc, from: targetRange.from, to: targetRange.to};
  const explicitFormulaText = plainTextHasExplicitFormulaSyntax(plainText);
  const usePlain = !clipboardHtml || (explicitFormulaText && !htmlCarriesContentMissingFromPlain(clipboardHtml, plainText)) || (plainTextSuggestsStructure(plainText) && !htmlHasClipboardStructure(clipboardHtml));
  const holder = usePlain ? plainClipboardHolder(plainText) : sanitizeClipboardHolder(Object.assign(document.createElement('div'), {innerHTML: clipboardHtml}));
  const forceBlocks = !!holder.querySelector('[data-qijian-clipboard-blocks="true"]');
  holder.querySelectorAll('[data-qijian-clipboard-blocks]').forEach(node => node.removeAttribute('data-qijian-clipboard-blocks'));
  sanitizeClipboardHolder(holder); normalizeClipboardTables(holder); normalizeClipboardImages(holder);
  normalizeClipboardBlockFormulas(holder); normalizeClipboardInlineFormulas(holder);
  await adoptClipboardImages(holder, imageItems);
  normalizeClipboardImages(holder);
  if (view.state.doc !== saved.doc) throw new Error('粘贴期间文稿已发生变化，请重新粘贴');
  const slice = clipboardSliceFromHolder(holder, plainText, forceBlocks);
  let tr = view.state.tr.replaceRange(saved.from, saved.to, slice);
  view.dispatch(closeHistory(tr.scrollIntoView()));
}

function editorInputRules() {
  return inputRules({rules: [
    textblockTypeInputRule(/^(#{1,6})\s$/, schema.nodes.heading, match => ({level: match[1].length})),
    wrappingInputRule(/^\s*>\s$/, schema.nodes.blockquote),
    wrappingInputRule(/^\s*([-+*])\s$/, schema.nodes.bullet_list),
    wrappingInputRule(/^(\d+)\.\s$/, schema.nodes.ordered_list, match => ({order: Number(match[1]) || 1}), (match, node) => node.childCount + node.attrs.order === Number(match[1])),
    textblockTypeInputRule(/^``\s$/, schema.nodes.code_block),
    textblockTypeInputRule(/^%%\s$/, schema.nodes.note)
  ]});
}

function clipboardPayload(state) {
  const {selection} = state;
  const payload = {slice: selection.content(), cutFrom: selection.from, cutTo: selection.to};
  if (selection instanceof NodeSelection && selection.node.type === schema.nodes.image_item && selection.$from.parent.type === schema.nodes.image_row && selection.$from.parent.childCount === 1) {
    // An image row requires at least one image. Cutting its last child must remove
    // the row as well, otherwise ProseMirror inserts an empty image to fill it.
    payload.cutFrom = selection.$from.before();
    payload.cutTo = selection.$from.after();
  }
  if (!(selection instanceof TextSelection) || selection.empty || !selection.$from.sameParent(selection.$to)) return payload;
  const {$from, $to} = selection;
  if ($from.parentOffset !== 0 || $to.parentOffset !== $from.parent.content.size) return payload;
  if ($from.parent.type === schema.nodes.heading) {
    payload.slice = new Slice(Fragment.from($from.parent), 0, 0);
    payload.cutFrom = $from.before(); payload.cutTo = $from.after();
    return payload;
  }
  if ($from.parent.type !== schema.nodes.paragraph) return payload;
  for (let depth = $from.depth - 1; depth > 0; depth--) {
    const item = $from.node(depth);
    if (item.type !== schema.nodes.list_item) continue;
    const list = $from.node(depth - 1);
    if (![schema.nodes.bullet_list, schema.nodes.ordered_list].includes(list.type)) return payload;
    payload.slice = new Slice(Fragment.from(list.type.create(list.attrs, item)), 0, 0);
    if (list.childCount === 1) {
      payload.cutFrom = $from.before(depth - 1); payload.cutTo = $from.after(depth - 1);
    } else {
      payload.cutFrom = $from.before(depth); payload.cutTo = $from.after(depth);
    }
    return payload;
  }
  return payload;
}

function qijianClipboardPlugin() {
  return new Plugin({props: {
    clipboardTextSerializer(slice) {
      const render = (node, depth = 0) => {
        if (node.isText) return node.text || '';
        if (node.type === schema.nodes.hard_break) return '\n';
        if (node.type === schema.nodes.formula_inline) return node.attrs.sourceText || `$${node.attrs.latex}$`;
        if (node.type === schema.nodes.formula_block) return node.attrs.sourceText || `$$\n${node.attrs.latex}\n$$`;
        if (node.type === schema.nodes.image_item) return node.attrs.alt || '[图片]';
        if (node.type === schema.nodes.table_block) return safeJson(node.attrs.matrix, [['']]).map(row => row.join('\t')).join('\n');
        if (node.type === schema.nodes.bullet_list || node.type === schema.nodes.ordered_list) {
          return [...Array(node.childCount)].map((_, index) => {
            const item = node.child(index);
            const prefix = node.type === schema.nodes.ordered_list ? `${(node.attrs.order || 1) + index}. ` : '- ';
            const body = render(item, depth + 1).replace(/\n/g, `\n${'  '.repeat(depth + 1)}`);
            return `${'  '.repeat(depth)}${prefix}${body}`;
          }).join('\n');
        }
        const separator = node.isBlock && node.type !== schema.nodes.list_item ? '\n' : '';
        return [...Array(node.childCount)].map((_, index) => render(node.child(index), depth)).join(separator);
      };
      return [...Array(slice.content.childCount)].map((_, index) => render(slice.content.child(index))).join('\n');
    },
    handleDOMEvents: {
      drop(view, event) {
        if (view.dragging || event.defaultPrevented) return false;
        const transfer = event.dataTransfer;
        const imageItems = [...(transfer?.items || [])].filter(item => String(item.type || '').startsWith('image/') || /\.(png|jpe?g|webp|gif|svg|bmp|avif)$/i.test(item.getAsFile?.()?.name || ''));
        const html = transfer?.getData('text/html') || '';
        if (!imageItems.length && !/<img\b/i.test(html)) return false;
        const target = view.posAtCoords({left:event.clientX,top:event.clientY});
        if (!target) return false;
        event.preventDefault();
        pasteExternalClipboard(view, event, imageItems, html, transfer?.getData('text/plain') || '', {from:target.pos,to:target.pos}).catch(error => window.toast?.(error?.message || '图片拖入失败'));
        return true;
      },
      copy(view, event) {
        const {selection} = view.state;
        if (selection.empty || !event.clipboardData) return false;
        const {slice} = clipboardPayload(view.state);
        const serialized = view.serializeForClipboard(slice);
        event.preventDefault();
        event.clipboardData.clearData();
        event.clipboardData.setData('text/html', serialized.dom.innerHTML);
        event.clipboardData.setData('text/plain', serialized.text);
        event.clipboardData.setData(STRUCTURED_CLIPBOARD, JSON.stringify(serialized.slice.toJSON()));
        return true;
      },
      cut(view, event) {
        const {selection} = view.state;
        if (selection.empty || !event.clipboardData) return false;
        const payload = clipboardPayload(view.state);
        const serialized = view.serializeForClipboard(payload.slice);
        event.preventDefault();
        event.clipboardData.clearData();
        event.clipboardData.setData('text/html', serialized.dom.innerHTML);
        event.clipboardData.setData('text/plain', serialized.text);
        event.clipboardData.setData(STRUCTURED_CLIPBOARD, JSON.stringify(serialized.slice.toJSON()));
        view.dispatch(closeHistory(view.state.tr.delete(payload.cutFrom, payload.cutTo)).scrollIntoView());
        return true;
      },
      paste(view, event) {
        const structured = event.clipboardData?.getData(STRUCTURED_CLIPBOARD);
        if (structured) {
          try {
            const slice = Slice.fromJSON(schema, JSON.parse(structured));
            event.preventDefault();
            let hasImage = false;
            slice.content.descendants(node => { if (node.type === schema.nodes.image_item) hasImage = true; });
            if (hasImage) pasteStructuredImages(view, slice).catch(error => window.toast?.(error?.message || '图片粘贴失败'));
            else view.dispatch(closeHistory(view.state.tr.replaceSelection(slice)).scrollIntoView());
            return true;
          } catch (_) {}
        }
        const imageItems = [...(event.clipboardData?.items || [])].filter(item => String(item.type || '').startsWith('image/'));
        const clipboardHtml = event.clipboardData?.getData('text/html') || '';
        const plainText = event.clipboardData?.getData('text/plain') || '';
        if (!clipboardHtml && !plainText && !imageItems.length) return false;
        event.preventDefault();
        pasteExternalClipboard(view, event, imageItems, clipboardHtml, plainText).catch(error => window.toast?.(error?.message || '粘贴失败'));
        return true;
      }
    }
  }});
}

function createEditor(mount) {
  if (!mount) throw new Error('找不到正文编辑区域');
  let suppressChange = false;
  const retainedImageSources = new Set();
  const retainImages = doc => doc.descendants(node => { if (node.type === schema.nodes.image_item && node.attrs.src) retainedImageSources.add(node.attrs.src); });
  let selectedAtomSide = 'after';
  const atomEnter = (state, dispatch) => {
    const {selection} = state;
    if (!(selection instanceof NodeSelection) || !['image_item', 'table_block', 'formula_block'].includes(selection.node.type.name)) return false;
    let from = selection.from, to = selection.to;
    if (selection.node.type === schema.nodes.image_item) {
      const $from = state.doc.resolve(selection.from);
      for (let depth = $from.depth; depth > 0; depth--) {
        if ($from.node(depth).type === schema.nodes.image_row) { from = $from.before(depth); to = $from.after(depth); break; }
      }
    }
    const pos = selectedAtomSide === 'before' ? from : to;
    let tr = state.tr.insert(pos, schema.nodes.paragraph.create());
    tr = tr.setSelection(TextSelection.create(tr.doc, pos + 1));
    dispatch?.(closeHistory(tr).scrollIntoView());
    return true;
  };
  const deleteSelectedAtom = (state, dispatch) => {
    const {selection} = state;
    if (!(selection instanceof NodeSelection) || !['image_item', 'table_block', 'formula_inline', 'formula_block'].includes(selection.node.type.name)) return false;
    if (selection.node.type === schema.nodes.image_item) {
      const $from = state.doc.resolve(selection.from);
      for (let depth = $from.depth; depth > 0; depth--) {
        const parent = $from.node(depth);
        if (parent.type === schema.nodes.image_row && parent.childCount === 1) {
          dispatch?.(closeHistory(state.tr.delete($from.before(depth), $from.after(depth))).scrollIntoView());
          return true;
        }
      }
    }
    dispatch?.(closeHistory(state.tr.deleteSelection()).scrollIntoView());
    return true;
  };
  const plugins = [
    history(), gapCursor(), editorInputRules(),
    keymap({
      'Mod-z': undo,
      'Mod-y': redo,
      'Mod-Shift-z': redo,
      'Enter': (state, dispatch, view) => atomEnter(state, dispatch) || headingEnter(state, dispatch) || splitListItem(schema.nodes.list_item)(state, dispatch, view) || createParagraphNear(state, dispatch, view) || liftEmptyBlock(state, dispatch, view) || splitBlock(state, dispatch, view),
      'Tab': sinkListItem(schema.nodes.list_item),
      'Shift-Tab': liftListItem(schema.nodes.list_item),
      'Backspace': (state, dispatch, view) => deleteSelectedAtom(state, dispatch) || undoInputRule(state, dispatch, view) || deleteSelection(state, dispatch, view) || joinBackward(state, dispatch, view) || selectNodeBackward(state, dispatch, view),
      'Delete': (state, dispatch, view) => deleteSelectedAtom(state, dispatch) || deleteSelection(state, dispatch, view) || joinForward(state, dispatch, view) || selectNodeForward(state, dispatch, view),
      'Mod-Enter': exitCode
    }),
    keymap(baseKeymap),
    qijianClipboardPlugin()
  ];
  const state = EditorState.create({schema, doc: schema.topNodeType.createAndFill(), plugins});
  const view = new EditorView({mount}, {
    state,
    nodeViews: {
      image_item: node => nodeViewForImage(node),
      formula_inline: node => nodeViewForFormula(node, true),
      formula_block: node => nodeViewForFormula(node, false)
    },
    dispatchTransaction(transaction) {
      retainImages(view.state.doc);
      const next = view.state.apply(transaction);
      retainImages(next.doc);
      view.updateState(next);
      requestAnimationFrame(() => window.syncFormulaQuickActions?.());
      if (transaction.docChanged && !suppressChange) {
        window.persist?.(true);
        window.scheduleEditorRefresh?.({outline: true, mindmap: true});
        window.updateWordStats?.();
        window.updateFindStatus?.();
        requestAnimationFrame(() => window.showSlashPanel?.());
      }
    },
    handleClickOn(view, pos, node, nodePos, event) {
      if (!['image_item', 'table_block', 'formula_inline', 'formula_block'].includes(node.type.name)) return false;
      const rect = event.target.closest?.('figure.editor-image,.table-block,.editor-formula')?.getBoundingClientRect?.();
      selectedAtomSide = rect && event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, nodePos)));
      view.focus();
      if (node.type.name === 'table_block' && event.target.closest?.('.table-edit-button')) {
        event.preventDefault();
        window.openTableEditor?.(event.target.closest('.table-block'));
      }
      return true;
    }
  });

  function notifyRefresh() {
    requestAnimationFrame(() => {
      window.numbers?.(); window.renderOutline?.(); window.refreshMindmapWindows?.();
    });
  }

  function setContent(html, stored) {
    let doc = null;
    if (stored?.schemaVersion === 2 && stored.doc) {
      try { doc = schema.nodeFromJSON(stored.doc); } catch (_) { doc = null; }
    }
    if (!doc) doc = docFromHtml(html);
    retainedImageSources.clear();
    retainImages(doc);
    suppressChange = true;
    view.updateState(EditorState.create({schema, doc, plugins}));
    suppressChange = false;
    notifyRefresh();
  }

  function replaceImageSources(replacements) {
    const map = replacements instanceof Map ? replacements : new Map(replacements || []);
    if (!map.size) return 0;
    let tr = view.state.tr, count = 0;
    view.state.doc.descendants((node, pos) => {
      if (node.type !== schema.nodes.image_item || !map.has(node.attrs.src)) return;
      tr = tr.setNodeMarkup(pos, undefined, {...node.attrs, src: map.get(node.attrs.src)});
      count += 1;
    });
    if (!count) return 0;
    suppressChange = true;
    try { view.dispatch(tr.setMeta('addToHistory', false)); }
    finally { suppressChange = false; }
    return count;
  }

  function getHTML() {
    const holder = document.createElement('div');
    holder.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(view.state.doc.content));
    holder.querySelectorAll('[data-outline-id="null"],[data-image-id="null"],[title="null"]').forEach(node => {
      node.removeAttribute('data-outline-id'); node.removeAttribute('data-image-id');
      if (node.getAttribute('title') === 'null') node.removeAttribute('title');
    });
    return holder.innerHTML || '<p><br></p>';
  }

  function setBlock(tag) {
    const command = tag === 'p' ? setBlockType(schema.nodes.paragraph) : /^h[1-6]$/.test(tag) ? setBlockType(schema.nodes.heading, {level: Number(tag.slice(1))}) : tag === 'blockquote' ? wrapBlockquote : tag === 'pre' ? setBlockType(schema.nodes.code_block) : null;
    if (!command) return false;
    const changed = command(view.state, transaction => view.dispatch(closeHistory(transaction)), view); if (changed) view.focus(); return changed;
  }

  function wrapBlockquote(state, dispatch) {
    const {$from, $to} = state.selection;
    const range = $from.blockRange($to);
    if (!range) return false;
    const wrapping = [{type: schema.nodes.blockquote, attrs: null}];
    try { dispatch?.(state.tr.wrap(range, wrapping).scrollIntoView()); return true; } catch (_) { return false; }
  }

  function setOutline(ordered = false) {
    const type = ordered ? schema.nodes.ordered_list : schema.nodes.bullet_list;
    const {$from} = view.state.selection;
    for (let depth = $from.depth; depth > 0; depth--) {
      const node = $from.node(depth);
      if (![schema.nodes.bullet_list, schema.nodes.ordered_list].includes(node.type)) continue;
      if (node.type === type) return true;
      const attrs = type === schema.nodes.ordered_list ? {order: 1, outlineId: node.attrs.outlineId || null} : {outlineId: node.attrs.outlineId || null};
      view.dispatch(closeHistory(view.state.tr.setNodeMarkup($from.before(depth), type, attrs)).scrollIntoView());
      view.focus(); return true;
    }
    const changed = wrapInList(type)(view.state, transaction => view.dispatch(closeHistory(transaction)), view);
    if (changed) view.focus(); return changed;
  }

  function insertSpecialBlock(kind) {
    if (kind === 'hr') return insertNode(schema.nodes.horizontal_rule.create());
    if (kind !== 'note') return false;
    const {selection} = view.state;
    const content = selection.$from.parent.isTextblock ? selection.$from.parent.content : null;
    const note = schema.nodes.note.create(null, content);
    const start = selection.$from.before(selection.$from.depth);
    const end = selection.$from.after(selection.$from.depth);
    let tr = view.state.tr.replaceWith(start, end, note);
    tr = tr.setSelection(TextSelection.near(tr.doc.resolve(start + 1)));
    view.dispatch(closeHistory(tr).scrollIntoView());
    view.focus();
    return true;
  }

  function toggleTextMark(name) {
    const mark = markForName(name); if (!mark) return false;
    const changed = toggleMark(mark)(view.state, transaction => view.dispatch(closeHistory(transaction)), view); if (changed) view.focus(); return changed;
  }

  function clearFormatting() {
    const {from, to, empty} = view.state.selection;
    if (empty) return false;
    let tr = view.state.tr.removeMark(from, to);
    view.state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.type === schema.nodes.heading || node.type === schema.nodes.code_block) tr = tr.setNodeMarkup(pos, schema.nodes.paragraph);
    });
    view.dispatch(closeHistory(tr).scrollIntoView()); view.focus(); return true;
  }

  function insertNode(node, replaceSelection = true) {
    let tr = view.state.tr;
    if (replaceSelection) tr = tr.replaceSelectionWith(node, false);
    else tr = tr.insert(tr.selection.to, node);
    view.dispatch(closeHistory(tr).scrollIntoView()); view.focus(); return true;
  }

  function insertText(text) {
    view.dispatch(view.state.tr.insertText(String(text ?? '')).scrollIntoView());
    view.focus(); return true;
  }

  function deleteTextBefore(count = 1) {
    const {from, to} = view.state.selection;
    const start = Math.max(0, from - Math.max(1, Number(count) || 1));
    const end = from === to ? from : to;
    view.dispatch(closeHistory(view.state.tr.delete(start, end)).scrollIntoView());
    view.focus(); return true;
  }

  function insertLink(href) {
    const link = schema.marks.link.create({href});
    const {from, to, empty} = view.state.selection;
    let tr = view.state.tr;
    if (empty) tr = tr.insertText(href, from, to).addMark(from, from + href.length, link).setSelection(TextSelection.create(tr.doc, from + href.length));
    else tr = tr.addMark(from, to, link);
    view.dispatch(closeHistory(tr).scrollIntoView()); view.focus(); return true;
  }

  function insertImage(attrs) {
    const image = schema.nodes.image_item.create({...attrs, id: attrs.id || `img-${Date.now().toString(36)}`});
    return insertNode(schema.nodes.image_row.create(null, image));
  }

  function insertTable(matrix, fontSize = 15) {
    return insertNode(schema.nodes.table_block.create({matrix: JSON.stringify(matrix), fontSize}));
  }

  function insertFormula(latex, mode = 'block', sourceText = '') {
    return insertNode(schema.nodes[mode === 'inline' ? 'formula_inline' : 'formula_block'].create({latex, sourceText: sourceText || defaultFormulaSource(latex, mode)}));
  }

  function replaceSelectedNode(typeName, attrs) {
    const {selection} = view.state;
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== typeName) return false;
    view.dispatch(closeHistory(view.state.tr.setNodeMarkup(selection.from, selection.node.type, {...selection.node.attrs, ...attrs})).scrollIntoView());
    view.focus(); return true;
  }

  function updateFormulaFromDOM(dom, latex, mode, sourceText = '') {
    selectDomNode(dom);
    const {selection} = view.state;
    if (!(selection instanceof NodeSelection) || !['formula_inline', 'formula_block'].includes(selection.node.type.name)) return false;
    const target = schema.nodes[mode === 'inline' ? 'formula_inline' : 'formula_block'].create({latex, sourceText: sourceText || defaultFormulaSource(latex, mode)});
    view.dispatch(closeHistory(view.state.tr.replaceSelectionWith(target, false)).scrollIntoView());
    view.focus(); return true;
  }

  function restoreFormulaFromDOM(dom) {
    selectDomNode(dom);
    const {selection} = view.state;
    if (!(selection instanceof NodeSelection) || !['formula_inline', 'formula_block'].includes(selection.node.type.name)) return false;
    const mode = selection.node.type.name === 'formula_block' ? 'block' : 'inline';
    const sourceText = selection.node.attrs.sourceText || defaultFormulaSource(selection.node.attrs.latex, mode);
    let tr = view.state.tr;
    if (mode === 'inline') {
      tr = tr.replaceSelectionWith(schema.text(sourceText), false);
      tr = tr.setSelection(TextSelection.create(tr.doc, selection.from + sourceText.length));
    } else {
      const paragraphs = sourceText.replace(/\r\n?/g, '\n').split('\n').map(line => schema.nodes.paragraph.create(null, line ? schema.text(line) : null));
      const content = Fragment.fromArray(paragraphs);
      tr = tr.replaceWith(selection.from, selection.to, content);
      tr = tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(tr.doc.content.size, selection.from + content.size)), -1));
    }
    view.dispatch(closeHistory(tr).scrollIntoView());
    view.focus(); return true;
  }

  function atomPositionFromDOM(dom, typeName = null) {
    if (!dom || !view.dom.contains(dom)) return false;
    try {
      const pos = view.posAtDOM(dom, 0);
      for (const candidate of [pos, pos - 1]) {
        if (candidate < 0) continue;
        const direct = view.state.doc.nodeAt(candidate);
        if (direct?.type.spec.selectable !== false && direct?.type.spec.atom && (!typeName || direct.type.name === typeName)) return candidate;
      }
      const $pos = view.state.doc.resolve(pos);
      for (let depth = $pos.depth; depth > 0; depth--) {
        const before = $pos.before(depth), node = view.state.doc.nodeAt(before);
        if (node?.type.spec.selectable !== false && node?.type.spec.atom && (!typeName || node.type.name === typeName)) return before;
      }
    } catch (_) {}
    return null;
  }

  function selectDomNode(dom) {
    const pos = atomPositionFromDOM(dom);
    if (pos === null || pos === false) return false;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
    // Pointer-based image selection prevents the browser's default mouse focus.
    // Keep native copy/cut and arrow keys attached to this selection.
    view.focus();
    return true;
  }

  function moveImageFromDOM(sourceDom, targetDom, after = false) {
    const sourcePos = atomPositionFromDOM(sourceDom, 'image_item'), targetPos = atomPositionFromDOM(targetDom, 'image_item');
    if (!Number.isInteger(sourcePos) || !Number.isInteger(targetPos) || sourcePos === targetPos) return false;
    const doc = view.state.doc, sourceResolved = doc.resolve(sourcePos), targetResolved = doc.resolve(targetPos);
    if (sourceResolved.parent.type !== schema.nodes.image_row || targetResolved.parent.type !== schema.nodes.image_row) return false;
    const sourceRow = sourceResolved.parent, targetRow = targetResolved.parent;
    const sourceRowPos = sourceResolved.before(sourceResolved.depth), targetRowPos = targetResolved.before(targetResolved.depth);
    const sourceIndex = sourceResolved.index(), targetIndex = targetResolved.index(), moved = doc.nodeAt(sourcePos);
    if (!moved || moved.type !== schema.nodes.image_item) return false;
    let tr = view.state.tr;
    if (sourceRowPos === targetRowPos) {
      const images = [...Array(sourceRow.childCount)].map((_, index) => sourceRow.child(index));
      images.splice(sourceIndex, 1);
      const adjustedTarget = targetIndex - (sourceIndex < targetIndex ? 1 : 0);
      images.splice(adjustedTarget + (after ? 1 : 0), 0, moved);
      if (images.every((image, index) => image === sourceRow.child(index))) return false;
      tr = tr.replaceWith(sourceRowPos, sourceRowPos + sourceRow.nodeSize, sourceRow.type.create(sourceRow.attrs, images));
    } else {
      const sourceImages = [...Array(sourceRow.childCount)].map((_, index) => sourceRow.child(index)).filter((_, index) => index !== sourceIndex);
      const targetImages = [...Array(targetRow.childCount)].map((_, index) => targetRow.child(index));
      targetImages.splice(targetIndex + (after ? 1 : 0), 0, moved);
      const edits = [
        {pos: targetRowPos, old: targetRow, next: targetRow.type.create(targetRow.attrs, targetImages)},
        {pos: sourceRowPos, old: sourceRow, next: sourceImages.length ? sourceRow.type.create(sourceRow.attrs, sourceImages) : null}
      ].sort((a, b) => b.pos - a.pos);
      for (const edit of edits) tr = edit.next ? tr.replaceWith(edit.pos, edit.pos + edit.old.nodeSize, edit.next) : tr.delete(edit.pos, edit.pos + edit.old.nodeSize);
    }
    let movedPos = null;
    tr.doc.descendants((node, pos) => { if (movedPos === null && node === moved) movedPos = pos; });
    if (movedPos !== null) tr = tr.setSelection(NodeSelection.create(tr.doc, movedPos));
    view.dispatch(closeHistory(tr).scrollIntoView());
    view.focus(); return true;
  }

  function moveImageToBlockFromDOM(sourceDom, targetDom, after = false) {
    const sourcePos = atomPositionFromDOM(sourceDom, 'image_item');
    if (!Number.isInteger(sourcePos) || !targetDom || !view.dom.contains(targetDom)) return false;
    const doc = view.state.doc, sourceResolved = doc.resolve(sourcePos);
    if (sourceResolved.parent.type !== schema.nodes.image_row) return false;
    const sourceRow = sourceResolved.parent, sourceRowPos = sourceResolved.before(sourceResolved.depth), sourceIndex = sourceResolved.index(), moved = doc.nodeAt(sourcePos);
    if (!moved || moved.type !== schema.nodes.image_item) return false;
    let targetPos;
    try { targetPos = view.posAtDOM(targetDom, 0); } catch (_) { return false; }
    const $target = doc.resolve(Math.max(0, Math.min(doc.content.size, targetPos)));
    let boundary = null;
    for (let depth = $target.depth; depth > 0; depth--) {
      const targetNode = $target.node(depth), parent = $target.node(depth - 1);
      if (!targetNode.isBlock) continue;
      const index = $target.index(depth - 1), insertIndex = index + (after ? 1 : 0);
      if (!parent.canReplaceWith(insertIndex, insertIndex, schema.nodes.image_row)) continue;
      boundary = after ? $target.after(depth) : $target.before(depth); break;
    }
    if (boundary === null) return false;
    const sourceImages = [...Array(sourceRow.childCount)].map((_, index) => sourceRow.child(index)).filter((_, index) => index !== sourceIndex);
    let tr = view.state.tr;
    tr = sourceImages.length ? tr.replaceWith(sourceRowPos, sourceRowPos + sourceRow.nodeSize, sourceRow.type.create(sourceRow.attrs, sourceImages)) : tr.delete(sourceRowPos, sourceRowPos + sourceRow.nodeSize);
    const insertPos = tr.mapping.map(boundary, after ? 1 : -1), row = schema.nodes.image_row.create(null, moved);
    try { tr = tr.insert(insertPos, row); } catch (_) { return false; }
    let movedPos = null;
    tr.doc.descendants((node, pos) => { if (movedPos === null && node === moved) movedPos = pos; });
    if (movedPos === null) return false;
    tr = tr.setSelection(NodeSelection.create(tr.doc, movedPos));
    view.dispatch(closeHistory(tr).scrollIntoView());
    view.focus(); return true;
  }

  function updateTableFromDOM(dom, matrix, fontSize = 15) {
    selectDomNode(dom);
    return replaceSelectedNode('table_block', {matrix: JSON.stringify(matrix), fontSize});
  }

  function updateImageFromDOM(dom, width) {
    selectDomNode(dom);
    return replaceSelectedNode('image_item', {width});
  }

  function removeDomNode(dom) {
    selectDomNode(dom);
    const {selection} = view.state;
    if (!(selection instanceof NodeSelection)) return false;
    view.dispatch(closeHistory(view.state.tr.deleteSelection()).scrollIntoView()); view.focus(); return true;
  }

  function insertBoundaryParagraph(dom, side = 'after') {
    selectDomNode(dom);
    const {selection} = view.state;
    if (!(selection instanceof NodeSelection)) return false;
    const pos = side === 'before' ? selection.from : selection.to;
    let tr = view.state.tr.insert(pos, schema.nodes.paragraph.create());
    tr = tr.setSelection(TextSelection.create(tr.doc, pos + 1));
    view.dispatch(closeHistory(tr).scrollIntoView()); view.focus(); return true;
  }

  function animateOutlineBranch(pos, collapsing, height) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches || height < 1) return;
    // Updating the collapsed attribute can replace the list item's DOM node. Wait
    // until the replacement is installed, then animate the live branch.
    requestAnimationFrame(() => {
      if (view.state.doc.nodeAt(pos)?.attrs.collapsed !== collapsing) return;
      const mapped = view.domAtPos(Math.min(pos + 1, view.state.doc.content.size));
      const anchor = mapped.node.nodeType === Node.ELEMENT_NODE ? mapped.node : mapped.node.parentElement;
      const item = anchor?.closest?.('li');
      if (!(item instanceof HTMLElement) || !item.isConnected) return;
      const branch = [...item.children].find(child => ['UL', 'OL'].includes(child.tagName));
      if (!branch || typeof branch.animate !== 'function') return;
      // Clip only during motion. Open branches must let image handles and shadows
      // extend outside their bounds; a larger z-index cannot escape clipping.
      const open = {height: `${height}px`, opacity: 1, transform: 'translateY(0)', visibility: 'visible', overflow: 'clip'};
      const closed = {height: '0px', opacity: 0, transform: 'translateY(-0.28em)', visibility: 'visible', overflow: 'clip'};
      branch.animate(collapsing ? [open, closed] : [closed, open], {
        duration: 200,
        easing: 'cubic-bezier(.2,.75,.2,1)'
      });
      try {
        item.animate(
          collapsing
            ? [{opacity: .28, transform: 'scaleY(1)'}, {opacity: 0, transform: 'scaleY(0)'}]
            : [{opacity: 0, transform: 'scaleY(0)'}, {opacity: .28, transform: 'scaleY(1)'}],
          {duration: 200, easing: 'cubic-bezier(.2,.75,.2,1)', pseudoElement: '::after'}
        );
      } catch (_) {}
    });
  }

  function toggleCollapseFromDOM(dom) {
    if (!dom || !view.dom.contains(dom)) return false;
    try {
      const pos = view.posAtDOM(dom, 0);
      const $pos = view.state.doc.resolve(pos);
      for (let depth = $pos.depth; depth > 0; depth--) {
        const before = $pos.before(depth), node = view.state.doc.nodeAt(before);
        if (node?.type === schema.nodes.list_item) {
          const branch = [...dom.children].find(child => ['UL', 'OL'].includes(child.tagName));
          const height = Math.max(branch?.scrollHeight || 0, (branch?.getBoundingClientRect().height || 0) / (window.QijianDisplay?.readingFactor() || 1));
          const collapsing = !node.attrs.collapsed;
          // The collapse control does not move the text selection. Asking ProseMirror
          // to reveal that stale selection can send the document back to the top.
          view.dispatch(closeHistory(view.state.tr.setNodeMarkup(before, node.type, {...node.attrs, collapsed: collapsing})));
          animateOutlineBranch(before, collapsing, height);
          return true;
        }
      }
    } catch (_) {}
    return false;
  }

  function updateLinkFromDOM(dom, label) {
    if (!dom || !view.dom.contains(dom)) return false;
    try {
      const from = view.posAtDOM(dom, 0);
      const to = view.posAtDOM(dom, dom.childNodes.length);
      const mark = schema.marks.link.create({href: dom.getAttribute('href') || ''});
      const text = schema.text(label, [mark]);
      let tr = view.state.tr.replaceWith(from, to, text);
      tr = tr.setSelection(TextSelection.create(tr.doc, from + text.nodeSize));
      view.dispatch(closeHistory(tr).scrollIntoView());
      view.focus(); return true;
    } catch (_) { return false; }
  }

  function setCursorFromDOM(dom, atEnd = false) {
    if (!dom || !view.dom.contains(dom)) return false;
    try {
      const pos = view.posAtDOM(dom, atEnd ? dom.childNodes.length : 0);
      const resolved = view.state.doc.resolve(Math.max(0, Math.min(view.state.doc.content.size, pos)));
      view.dispatch(view.state.tr.setSelection(TextSelection.near(resolved, atEnd ? -1 : 1)));
      return true;
    } catch (_) { return false; }
  }

  function textMatches(term) {
    const needle = String(term || '').toLocaleLowerCase();
    const matches = [];
    if (!needle) return matches;
    view.state.doc.descendants((node, pos) => {
      if (!node.isText) return;
      const haystack = node.text.toLocaleLowerCase();
      let index = 0;
      while ((index = haystack.indexOf(needle, index)) !== -1) {
        matches.push({from: pos + index, to: pos + index + needle.length});
        index += Math.max(1, needle.length);
      }
    });
    return matches;
  }

  function selectMatch(match) {
    if (!match) return false;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, match.from, match.to)).scrollIntoView());
    view.focus(); return true;
  }

  function replaceCurrent(term, replacement) {
    const {from, to} = view.state.selection;
    if (view.state.doc.textBetween(from, to, '').toLocaleLowerCase() !== String(term || '').toLocaleLowerCase()) return false;
    view.dispatch(view.state.tr.insertText(String(replacement ?? ''), from, to).scrollIntoView());
    return true;
  }

  function replaceAll(term, replacement) {
    const matches = textMatches(term);
    if (!matches.length) return 0;
    let tr = view.state.tr;
    for (const match of matches.reverse()) tr = tr.insertText(String(replacement ?? ''), match.from, match.to);
    view.dispatch(tr.scrollIntoView());
    return matches.length;
  }

  return {
    enabled: true, schema, view,
    focus: () => view.focus(),
    setContent,
    replaceImageSources,
    getRetainedImageSources: () => [...retainedImageSources],
    getHTML,
    getJSON: () => ({schemaVersion: 2, doc: view.state.doc.toJSON()}),
    resetHistory: () => setContent(getHTML(), {schemaVersion: 2, doc: view.state.doc.toJSON()}),
    setBlock,
    setOutline,
    insertSpecialBlock,
    toggleMark: toggleTextMark,
    clearFormatting,
    insertText,
    deleteTextBefore,
    insertLink,
    insertImage,
    insertTable,
    insertFormula,
    updateFormulaFromDOM,
    restoreFormulaFromDOM,
    updateTableFromDOM,
    updateImageFromDOM,
    moveImageFromDOM,
    moveImageToBlockFromDOM,
    removeDomNode,
    insertBoundaryParagraph,
    selectDomNode,
    toggleCollapseFromDOM,
    updateLinkFromDOM,
    setCursorFromDOM,
    textMatches,
    selectMatch,
    getSelection: () => ({from: view.state.selection.from, to: view.state.selection.to, empty: view.state.selection.empty}),
    setTextSelection(from, to = from) {
      const max = view.state.doc.content.size;
      const start = Math.max(1, Math.min(max, Number(from) || 1));
      const end = Math.max(start, Math.min(max, Number(to) || start));
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, start, end)));
      view.focus(); return true;
    },
    selectNodeAt(pos) {
      try { view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, Number(pos))).scrollIntoView()); view.focus(); return true; } catch (_) { return false; }
    },
    getDocumentJSON: () => view.state.doc.toJSON(),
    selectAll() { view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc))); view.focus(); return true; },
    replaceCurrent,
    replaceAll,
    undo: () => undo(view.state, view.dispatch, view),
    redo: () => redo(view.state, view.dispatch, view),
    destroy: () => view.destroy()
  };
}

window.createQijianStructuredEditor = createEditor;
window.QijianEditorSchema = schema;
window.qijianEditor = createEditor(document.getElementById('editor'));

