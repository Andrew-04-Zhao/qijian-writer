let spellcheckState = null, spellcheckBusy = false;
const languageNames = new Intl.DisplayNames(['zh-CN'], {type:'language'});
const languageName = code => { try { return languageNames.of(code) || code; } catch (_) { return code; } };

function applySpellcheckStatus(state) {
  const refresh = state.enabled && spellcheckState && spellcheckState.revision !== state.revision;
  spellcheckState = state;
  const view = window.qijianEditor?.view;
  if (view) view.setProps({attributes:{...view.props.attributes, spellcheck:String(state.enabled)}});
  else document.getElementById('editor').spellcheck = state.enabled;
  if (refresh && view) {
    // Recheck visible text without changing the document or its undo history.
    view.setProps({attributes:{...view.props.attributes,spellcheck:'false'}});
    requestAnimationFrame(() => {
      if (spellcheckState.enabled) view.setProps({attributes:{...view.props.attributes,spellcheck:'true'}});
    });
  }
  updateSpellcheckDownloadStatus();
}
function updateSpellcheckDownloadStatus() {
  if (!spellcheckState) return;
  const selected = spellcheckState.languages;
  const failed = selected.filter(code => spellcheckState.dictionaries[code] === 'failed');
  const loading = selected.filter(code => spellcheckState.dictionaries[code] === 'downloading');
  const status = document.getElementById('spellcheckDownloadStatus');
  status.textContent = failed.length ? `${failed.map(languageName).join('、')}词典下载失败，请联网后重试。` : loading.length ? `正在准备${loading.map(languageName).join('、')}词典…` : '';
  status.classList.toggle('is-error', !!failed.length);
}
async function saveSpellcheckPreferences(enabled, languages) {
  const state = await window.qijian.configureSpellcheck({enabled, languages});
  library.settings.spellcheckEnabled = state.enabled;
  library.settings.spellcheckLanguages = [...state.languages];
  applySpellcheckStatus(state);
  persist();
  return state;
}
async function toggleSpellcheck() {
  if (spellcheckBusy || !spellcheckState) return;
  spellcheckBusy = true;
  try {
    await saveSpellcheckPreferences(!spellcheckState.enabled, spellcheckState.languages);
    toast(spellcheckState.enabled ? '拼写检查已启用' : '拼写检查已关闭');
  } catch (error) { toast(error.message || '拼写检查设置失败'); }
  finally { spellcheckBusy = false; }
}
function closeSpellcheckLanguages() {
  document.getElementById('spellcheckDialog').classList.add('hidden');
  focusActiveEditor();
}
function openSpellcheckLanguages() {
  if (!spellcheckState) return;
  const list = document.getElementById('spellcheckLanguageList');
  const preferred = ['en-US','en-GB','de','fr','es-ES','it','pt-BR','ru'];
  const languages = [...spellcheckState.available].sort((a,b) => {
    const rank = code => preferred.includes(code) ? preferred.indexOf(code) : 100;
    return rank(a)-rank(b) || languageName(a).localeCompare(languageName(b),'zh-CN');
  });
  list.replaceChildren();
  for (const code of languages) {
    const label = document.createElement('label');
    label.className = 'spellcheck-language';
    label.dataset.search = `${languageName(code)} ${code}`.toLowerCase();
    const input = document.createElement('input');
    input.type = 'checkbox'; input.value = code;
    input.checked = spellcheckState.languages.includes(code);
    const name = document.createElement('span'); name.textContent = languageName(code);
    const hint = document.createElement('small'); hint.textContent = code;
    label.append(input, name, hint); list.append(label);
  }
  document.getElementById('spellcheckLanguageSearch').value = '';
  document.getElementById('spellcheckError').textContent = '';
  document.getElementById('spellcheckDialog').classList.remove('hidden');
  updateSpellcheckDownloadStatus();
  document.getElementById('spellcheckLanguageSearch').focus();
}
function setupLatinFonts() {
  const select = document.getElementById('latinFont');
  const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
  const sample = 'AaBbWwMm0123456789 große Straße';
  const installed = family => ['monospace','serif','sans-serif'].some(fallback => {
    context.font = `32px ${fallback}`; const baseline = context.measureText(sample).width;
    context.font = `32px ${QijianFonts.cssFontName(family)},${fallback}`;
    return Math.abs(context.measureText(sample).width - baseline) > .01;
  });
  select.replaceChildren(new Option('系统默认', 'system'));
  for (const group of QijianFonts.groups) {
    const optgroup = document.createElement('optgroup'); optgroup.label = group.label;
    for (const [key, family] of group.fonts) {
      if (installed(family)) optgroup.append(new Option(family, key));
      else if (library.settings.latinFont === key) optgroup.append(new Option(`${family}（当前电脑未安装）`, key));
    }
    if (optgroup.children.length) select.append(optgroup);
  }
}
async function setupWritingPreferences() {
  setupLatinFonts();
  window.qijian.onSpellcheckStatus(applySpellcheckStatus);
  const state = await window.qijian.spellcheckStatus();
  applySpellcheckStatus(state);
  library.settings.spellcheckEnabled = state.enabled;
  library.settings.spellcheckLanguages = [...state.languages];
  document.getElementById('closeSpellcheck').onclick = closeSpellcheckLanguages;
  document.getElementById('cancelSpellcheck').onclick = closeSpellcheckLanguages;
  document.getElementById('spellcheckLanguageSearch').oninput = event => {
    const query = event.target.value.trim().toLowerCase();
    document.querySelectorAll('.spellcheck-language').forEach(label => label.classList.toggle('hidden', !label.dataset.search.includes(query)));
  };
  document.getElementById('saveSpellcheck').onclick = async () => {
    const languages = [...document.querySelectorAll('#spellcheckLanguageList input:checked')].map(input => input.value);
    const error = document.getElementById('spellcheckError');
    if (!languages.length) { error.textContent = '请至少选择一种语言；关闭检查请使用“编辑”菜单中的开关。'; return; }
    const button = document.getElementById('saveSpellcheck'); button.disabled = true;
    try { await saveSpellcheckPreferences(spellcheckState.enabled, languages); closeSpellcheckLanguages(); }
    catch (failure) { error.textContent = failure.message || '设置未能保存，请重试'; }
    finally { button.disabled = false; }
  };
  document.getElementById('spellcheckDialog').addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closeSpellcheckLanguages(); }
    if (event.key === 'Tab') {
      const focusable = [...event.currentTarget.querySelectorAll('button,input')].filter(el => !el.disabled && el.getClientRects().length);
      const target = event.shiftKey && document.activeElement === focusable[0] ? focusable.at(-1) : !event.shiftKey && document.activeElement === focusable.at(-1) ? focusable[0] : null;
      if (target) { event.preventDefault(); target.focus(); }
    }
  });
}
