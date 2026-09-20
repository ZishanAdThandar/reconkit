/**
 * ReconKit — UI helpers (small & dependency-free).
 */
'use strict';
var Rec = window.Rec = window.Rec || {};

Rec.ui = (() => {

  /** Create an element: h('div', {class:'x', onclick}, ['text', el2]) or h('div', {}, a, b) */
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k of Object.keys(attrs)) {
        const v = attrs[k];
        if (v == null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'dataset') Object.assign(el.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
        else el.setAttribute(k, v === true ? '' : v);
      }
    }
    const flat = [];
    for (const kid of kids) {
      if (Array.isArray(kid)) flat.push(...kid);
      else flat.push(kid);
    }
    for (const kid of flat) {
      if (kid == null || kid === false) continue;
      el.appendChild(typeof kid === 'string' || typeof kid === 'number' ? document.createTextNode(String(kid)) : kid);
    }
    return el;
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  let toastTimer = null;
  function toast(msg, kind) {
    const box = document.getElementById('toasts');
    const t = h('div', { class: 'toast' + (kind ? ' ' + kind : '') }, String(msg));
    box.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(String(text));
      toast('Copied to clipboard', 'ok');
      return true;
    } catch (e) {
      // Fallback (extension pages usually have clipboardWrite).
      try {
        const ta = document.createElement('textarea');
        ta.value = String(text);
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        toast('Copied to clipboard', 'ok');
        return true;
      } catch (e2) {
        toast('Copy failed: ' + e2.message, 'badd');
        return false;
      }
    }
  }

  function el(id) { return document.getElementById(id); }

  /** Generic key/value table of rows: [[label, value]] with optional probe note. */
  function kvTable(rows, opts) {
    opts = opts || {};
    const t = h('table', { class: 'kv' });
    for (const [label, value, probe] of rows) {
      const tr = h('tr', {});
      tr.appendChild(h('th', { scope: 'row' }, esc(label)));
      const td = h('td', { class: 'wrap' });
      if (value != null && value !== '') td.appendChild(h('span', {}, esc(String(value))));
      else td.appendChild(h('span', { class: 'faint' }, esc(probe || '—')));
      tr.appendChild(td);
      t.appendChild(tr);
    }
    return t;
  }

  function msgIcon(kind) {
    switch (kind) {
      case 'ok': return '✓';
      case 'warn': return '!';
      case 'bad': return '✕';
      case 'info': return 'i';
      default: return '';
    }
  }

  function statusTag(text, kind) {
    return h('span', { class: 'tag ' + (kind === 'ok' ? 'okk' : kind === 'warn' ? 'warn' : kind === 'bad' ? 'badd' : 'acc'), title: kind ? '' : undefined },
      text + (kind ? ' — ' + msgIcon(kind) : ''));
  }

  /** Copy button next to an output value. */
  function copyBtn(text) {
    return h('button', { class: 'btn sm ghost', onclick: () => copyText(text) }, 'copy');
  }

  function spinner(text) {
    return h('div', { class: 'muted', style: 'display:flex;align-items:center;gap:8px' }, [h('span', { class: 'spinner' }), text || 'Working…']);
  }

  function notDetermined(why) {
    return h('span', { class: 'faint' }, esc(why || 'not determined'));
  }

  function confirmOpen(urls, onYes) {
    if (!urls.length) return;
    if (urls.length === 1) { onYes(); return; }
    Rec.ui.toast(`Opening ${urls.length} tabs…`, 'info');
    setTimeout(onYes, 60);
  }

  return { h, esc, toast, copyText, el, kvTable, statusTag, copyBtn, spinner, notDetermined, confirmOpen, msgIcon };
})();