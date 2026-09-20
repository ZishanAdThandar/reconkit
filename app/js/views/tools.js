/**
 * ReconKit — Tools workspace view.
 */
'use strict';
var Rec = window.Rec = window.Rec || {};

Rec.views = Rec.views || {};

Rec.views.tools = (() => {
  const { h, esc, el, toast, copyBtn } = Rec.ui;
  let activeId = 'hashing';
  let inputText = '';
  let optsState = {}; // toolId -> {key:value}

  function optVal(tool, def) {
    const st = optsState[tool.id] || (optsState[tool.id] = {});
    if (st[def.key] === undefined) st[def.key] = def.def;
    return st[def.key];
  }

  function renderToolList() {
    const cats = Rec.tools.categories.map((cat) => {
      const tools = Rec.tools.list.filter((t) => t.cat === cat.id);
      if (!tools.length) return null;
      return h('div', {},
        h('div', { class: 'cat-head' }, cat.name),
        h('div', { class: 'tool-pill-list' }, tools.map((t) =>
          h('button', {
            class: 'tool-pill' + (t.id === activeId ? ' active' : ''),
            onclick: () => selectTool(t.id)
          }, t.name))));
    }).filter(Boolean);
    const box = el('tools-list');
    box.replaceChildren();
    box.append(...cats);
  }

  function selectTool(id) {
    activeId = id;
    renderToolList();
    renderWorkspace();
  }

  function renderOpts(tool, wrap) {
    for (const def of tool.opts) {
      const val = optVal(tool, def);
      let control;
      if (def.type === 'bool') {
        control = h('label', { class: 'check' }, [
          h('input', {
            type: 'checkbox', checked: val ? true : false,
            onchange: (e) => { optsState[tool.id][def.key] = e.target.checked; persist(); }
          }), def.label
        ]);
      } else if (def.type === 'select') {
        control = h('span', { class: 'opt-cell' }, [
          h('span', {}, def.label),
          h('select', { onchange: (e) => { optsState[tool.id][def.key] = e.target.value; persist(); } },
            def.options.map((o) => h('option', { value: o.v, selected: o.v === val ? true : null }, o.l)))
        ]);
      } else {
        control = h('span', { class: 'opt-cell' }, [
          h('span', {}, def.label),
          h('input', {
            type: def.type === 'num' ? 'number' : 'text', value: String(val ?? ''),
            onchange: (e) => { optsState[tool.id][def.key] = def.type === 'num' && e.target.value !== '' ? e.target.value : e.target.value; persist(); }
          })
        ]);
      }
      wrap.appendChild(control);
    }
  }

  function persist() {
    browser.storage.local.set({ 'rk:toolstate': { activeId, inputText, optsState } }).catch(() => {});
  }

  async function restore() {
    try {
      const o = (await browser.storage.local.get('rk:toolstate'))['rk:toolstate'];
      if (o) {
        if (o.activeId && Rec.tools.byId[o.activeId]) activeId = o.activeId;
        if (typeof o.inputText === 'string') inputText = o.inputText;
        if (o.optsState) optsState = Object.assign(optsState, o.optsState);
      }
    } catch (e) { /* first run */ }
  }

  async function runTool(tool) {
    const area = el('tool-output');
    area.replaceChildren();
    area.appendChild(Rec.ui.spinner('Computing locally…'));
    const opts = {};
    for (const def of tool.opts) opts[def.key] = optVal(tool, def);
    try {
      const res = await tool.run({ text: inputText, opts });
      area.replaceChildren();
      if (res && res.error) {
        area.appendChild(h('div', { class: 'error-box' }, esc(res.error)));
        return;
      }
      if (res && res.note) area.appendChild(h('div', { class: 'small muted', style: 'margin-bottom:8px' }, esc(res.note)));
      if (res && res.outputs && res.outputs.length) {
        for (const o of res.outputs) {
          const blk = h('div', { class: 'out-block' });
          blk.appendChild(h('div', { class: 'out-head' }, [
            h('span', {}, esc(o.label)),
            h('span', { class: 'grow' }),
            copyBtn(o.text)
          ]));
          blk.appendChild(h('div', { class: 'out' + (o.kind === 'text' ? ' empty' : '') }, esc(o.text)));
          area.appendChild(blk);
        }
      } else {
        area.appendChild(h('div', { class: 'out empty' }, 'No output.'));
      }
    } catch (e) {
      area.replaceChildren();
      area.appendChild(h('div', { class: 'error-box' }, esc(String(e && e.message || e))));
    }
  }

  function renderWorkspace() {
    const tool = Rec.tools.byId[activeId] || Rec.tools.list[0];
    activeId = tool.id;
    const pane = el('tools-workspace');
    pane.replaceChildren();
    const hdr = h('div', { class: 'spread', style: 'margin-bottom:10px' }, [
      h('div', {}, [
        h('h2', { style: 'margin:0 0 2px;font-size:15px' }, esc(tool.name)),
        h('div', { class: 'small muted' }, esc(tool.desc))
      ]),
      h('button', { class: 'btn primary', id: 'btn-run' }, 'Run   (Ctrl+Enter)')
    ]);
    pane.appendChild(hdr);

    if (tool.opts.length) {
      const optRow = h('div', { class: 'opt-row', style: 'margin-bottom:10px' });
      renderOpts(tool, optRow);
      pane.appendChild(optRow);
    }

    pane.appendChild(h('div', { class: 'field' }, [
      h('label', { class: 'field' }, [h('span', {}, 'Input'), h('textarea', { id: 'tool-input', placeholder: 'Type or paste input here…' })]),
    ]));

    pane.appendChild(h('div', { id: 'tool-output', style: 'margin-top:12px' }));
    pane.appendChild(h('div', { id: 'tool-hint', class: 'small faint', style: 'margin-top:8px' }));
    document.getElementById('tool-hint').textContent = '';
    hdr.querySelector('#btn-run').addEventListener('click', () => runTool(tool));
    const ta = el('tool-input');
    ta.value = inputText;
    ta.addEventListener('input', (e) => { inputText = e.target.value; persist(); });
    ta.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); runTool(tool); }
    });
    if (inputText) runTool(tool);
    if (tool.id === 'identifier' || tool.id === 'hashing') {
      // auto-run for convenience
      if (!inputText) { /* leave empty workspace */ }
    }
  }

  function open(params) {
    const view = el('view-tools');
    view.replaceChildren();
    view.appendChild(h('div', { class: 'tools-layout' }, [
      h('div', { class: 'tools-cats', id: 'tools-list' }),
      h('div', { id: 'tools-workspace' })
    ]));
    restore().then(() => {
      if (params && params.toolId && Rec.tools.byId[params.toolId]) activeId = params.toolId;
      renderToolList();
      renderWorkspace();
      if (params && typeof params.text === 'string' && params.text !== '') {
        inputText = params.text;
        setText(inputText);
        const tool = Rec.tools.byId[activeId];
        if (tool) runTool(tool);
      }
    });
  }

  function setText(text) {
    if (typeof text === 'string') inputText = text;
    if (el('tool-input')) el('tool-input').value = inputText;
  }

  return { id: 'tools', label: 'Utilities', open, setText, selectTool, runTool };
})();