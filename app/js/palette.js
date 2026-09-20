/**
 * ReconKit — Command palette (Ctrl/Cmd+K or the search button).
 * Fuzzy (substring) navigation across tools, views and quick actions.
 */
'use strict';
const Rec = window.Rec = window.Rec || {};
Rec.palette = (() => {
  const { h, esc, el, toast } = Rec.ui;

  function buildCommands() {
    const cmds = [];
    for (const v of Object.values(Rec.views)) cmds.push({ cat: 'view', label: 'Open ' + v.label, run: () => Rec.nav.go(v.id) });
    for (const t of Rec.tools.list) cmds.push({ cat: 'tool', label: 'Tool: ' + t.name, run: () => { Rec.nav.go('tools'); Rec.views.tools.selectTool(t.id); } });
    cmds.push(
      { cat: 'action', label: 'Analyze current website', run: () => Rec.nav.go('analyzer') },
      { cat: 'action', label: 'OSINT lookups for current target', run: () => Rec.nav.go('recon') },
      { cat: 'action', label: 'DNS / IP intelligence', run: () => Rec.nav.go('domain') },
      { cat: 'action', label: 'Analyze a local file', run: () => Rec.nav.go('files') },
      { cat: 'action', label: 'Toggle dark / light mode', run: () => Rec.theme.toggle() },
      { cat: 'action', label: 'Copy current hostname', run: () => Rec.target && Rec.target.host && Rec.ui.copyText(Rec.target.host) },
      { cat: 'action', label: 'Copy current URL', run: () => Rec.target && Rec.target.url && Rec.ui.copyText(Rec.target.url) },
      { cat: 'action', label: 'Open ReconKit in a full tab', run: () => browser.tabs.create({ url: location.href.split('#')[0] }) }
    );
    return cmds;
  }

  function open() {
    const box = el('palette');
    box.classList.remove('hidden');
    el('palette-input').value = '';
    render('');
    el('palette-input').focus();
  }

  function close() {
    el('palette').classList.add('hidden');
  }

  function render(filter) {
    const cmds = buildCommands();
    const f = filter.trim().toLowerCase();
    const shown = cmds.filter((c) => !f || c.label.toLowerCase().includes(f));
    const list = el('palette-list');
    list.replaceChildren();
    if (!shown.length) {
      list.appendChild(h('div', { class: 'p-empty' }, 'No matching commands'));
      return;
    }
    for (const c of shown) {
      const item = h('div', { class: 'p-item', onclick: () => { close(); c.run(); } }, [
        h('span', {}, esc(c.label)), h('span', { class: 'p-cat' }, esc(c.cat))
      ]);
      list.appendChild(item);
    }
    // Keyboard navigation
    const items = list.querySelectorAll('.p-item');
    let activeIdx = 0;
    const setActive = (i) => {
      activeIdx = (i + items.length) % items.length;
      items.forEach((it, idx) => it.classList.toggle('active', idx === activeIdx));
      items[activeIdx] && items[activeIdx].scrollIntoView({ block: 'nearest' });
    };
    setActive(0);
    el('palette-input').onkeydown = (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(activeIdx + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(activeIdx - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); items[activeIdx] && items[activeIdx].click(); }
      else if (e.key === 'Escape') { e.preventDefault(); close(); }
    };
    return true;
  }

  function init() {
    el('btn-palette').addEventListener('click', open);
    el('palette-input').addEventListener('input', (e) => render(e.target.value));
    document.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); open(); }
      if (e.key === 'Escape') close();
    });
    // Global tool hint: Ctrl+Enter is handled by the tools view.
    el('palette').addEventListener('click', (e) => { if (e.target === el('palette')) close(); });
  }

  return { init, open, close };
})();