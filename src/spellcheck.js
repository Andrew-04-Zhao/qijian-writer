const fs = require('fs');
const path = require('path');

function seedBundledDictionaries(profile) {
  const destination = path.join(profile, 'Dictionaries');
  fs.mkdirSync(destination, {recursive:true});
  for (const name of ['en-US-10-1.bdic', 'de-DE-3-0.bdic']) {
    const target = path.join(destination, name);
    // Keep a valid cached dictionary. A partial previous download can be repaired.
    let valid = false;
    try { const data = fs.readFileSync(target); valid = data.length > 32 && data.subarray(0,4).toString() === 'BDic'; } catch (_) {}
    if (!valid) {
      const temporary = target + '.qijian-pending';
      fs.copyFileSync(path.join(__dirname, 'vendor', 'spellcheck', name), temporary);
      fs.renameSync(temporary, target);
    }
  }
}

// Session preferences are separate from document content and undo history.
function createSpellcheckController(session, onStatus = () => {}) {
  const available = session.availableSpellCheckerLanguages;
  const dictionaries = new Map();
  const defaults = ['en-US', 'de'].filter(language => available.includes(language));
  let selected = defaults.length ? defaults : available.slice(0, 1);
  let enabled = true, revision = 0;
  function invalidateSpellingCache() {
    // Chromium retains the last paragraph's result when dictionaries change.
    // Its dictionary-update notification clears that cache. Add/remove one
    // private nonce synchronously so no word remains in the custom dictionary.
    const word = 'qijianrefresh' + require('crypto').randomBytes(12).toString('hex');
    if (session.addWordToSpellCheckerDictionary(word)) session.removeWordFromSpellCheckerDictionary(word);
    revision++;
  }
  const status = () => ({enabled, revision, languages:[...selected], available:[...available], dictionaries:Object.fromEntries(dictionaries)});
  for (const [event, state] of [
    ['spellcheck-dictionary-download-begin', 'downloading'],
    ['spellcheck-dictionary-download-success', 'ready'],
    ['spellcheck-dictionary-initialized', 'ready'],
    ['spellcheck-dictionary-download-failure', 'failed']
  ]) session.on(event, (_event, language) => { dictionaries.set(language, state); if(event === 'spellcheck-dictionary-initialized') invalidateSpellingCache(); onStatus(status()); });
  function configure(preferences = {}, strict = true) {
    let languages = preferences.languages ?? selected;
    if (!Array.isArray(languages) || languages.some(language => typeof language !== 'string')) throw new Error('请选择有效的拼写检查语言');
    if (strict && languages.some(language => !available.includes(language))) throw new Error('所选语言暂不支持拼写检查');
    languages = [...new Set(languages.filter(language => available.includes(language)))];
    if (!languages.length) {
      if (strict) throw new Error('请至少选择一种语言；也可以在“编辑”菜单关闭拼写检查');
      languages = [...selected];
    }
    const nextEnabled = preferences.enabled !== false;
    if (languages.some(language => dictionaries.get(language) === 'failed')) session.setSpellCheckerLanguages([]);
    if (JSON.stringify(session.getSpellCheckerLanguages()) !== JSON.stringify(languages)) session.setSpellCheckerLanguages(languages);
    session.setSpellCheckerEnabled(nextEnabled);
    if (JSON.stringify(selected) !== JSON.stringify(languages)) invalidateSpellingCache();
    selected = languages;
    enabled = nextEnabled;
    onStatus(status());
    return status();
  }
  return {status, configure};
}
module.exports = {createSpellcheckController, seedBundledDictionaries};
