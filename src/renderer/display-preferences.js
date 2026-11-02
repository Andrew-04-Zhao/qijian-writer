(() => {
  const readingScales = [.75, .9, 1, 1.1, 1.25, 1.5, 1.75, 2];
  let state = {uiScale: 1, readingScale: 1}, pending = Promise.resolve();
  const readingFactor = () => state.readingScale / state.uiScale;
  function updateFields(root) {
    for (const [id, value] of [['interfaceScale', state.uiScale], ['readingScale', state.readingScale]]) {
      const input = root.querySelector('#' + id);
      if (input) input.value = String(value);
    }
  }
  function scrollAnchor() {
    const pane = document.querySelector('.writing');
    if (!pane) return null;
    const top = pane.getBoundingClientRect().top;
    const element = [...document.querySelectorAll('#editor > *')].find(block => block.getBoundingClientRect().bottom > top + 1);
    return element ? {element, offset: element.getBoundingClientRect().top - top, uiScale: state.uiScale} : null;
  }
  function apply(next, anchor) {
    const pane = document.querySelector('.writing'), oldFactor = readingFactor();
    const scrollTop = pane?.scrollTop || 0;
    state = next;
    document.documentElement.style.setProperty('--reading-local-scale', String(readingFactor()));
    updateFields(document);
    if (typeof detachedDialogs !== 'undefined') {
      for (const popup of detachedDialogs.values()) if (!popup.closed) updateFields(popup.document);
    }
    requestAnimationFrame(() => {
      if (pane && anchor?.element.isConnected) {
        const offset = anchor.element.getBoundingClientRect().top - pane.getBoundingClientRect().top;
        pane.scrollTop += offset - anchor.offset * anchor.uiScale / state.uiScale;
      } else if (pane) pane.scrollTop = scrollTop * readingFactor() / oldFactor;
      if (typeof numbers === 'function') numbers();
    });
    return {...state};
  }
  function configure(patch) {
    const task = pending.then(async () => {
      const anchor = scrollAnchor();
      return apply(await window.qijian.configureDisplay(
        typeof patch === 'function' ? patch({...state}) : patch), anchor);
    });
    pending = task.catch(error => {
      if (typeof toast === 'function') toast(error.message || '显示设置保存失败');
      updateFields(document);
    });
    return task;
  }
  async function setup() {
    apply(await window.qijian.displayPreferences());
    document.querySelector('#interfaceScale').addEventListener('change', event => {
      configure({uiScale: Number(event.target.value)}).catch(() => {});
    });
    document.querySelector('#readingScale').addEventListener('change', event => {
      configure({readingScale: Number(event.target.value)}).catch(() => {});
    });
    document.querySelector('#resetDisplay').addEventListener('click', () => {
      configure({uiScale: 1, readingScale: 1}).catch(() => {});
    });
  }
  function stepReading(direction) {
    return configure(current => ({readingScale: readingScales[Math.max(0, Math.min(readingScales.length - 1,
      readingScales.indexOf(current.readingScale) + direction))]}));
  }
  window.QijianDisplay = {setup, configure, stepReading, readingFactor, get: () => ({...state})};
})();
