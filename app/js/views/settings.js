/**
 * ReconKit — Settings view.
 * Appearance, optional permissions (opt-in only), data & privacy controls,
 * credits.
 */
'use strict';
const Rec = window.Rec = window.Rec || {};
Rec.views = Rec.views || {};

Rec.views.settings = (() => {
  const { h, esc, el, toast, kvTable, statusTag } = Rec.ui;

  function permCard(id, name, desc, req) {
    const state = h('span', { class: 'tag' }, 'checking…');
    const btn = h('button', { class: 'btn sm primary', onclick: async () => {
      const granted = await browser.permissions.request({ permissions: [id] });
      toast(granted ? `${name} enabled` : 'Permission request declined', granted ? 'ok' : null);
      refreshPerm(btn, state, id);
    } }, 'Enable');
    const revoke = h('button', { class: 'btn sm ghost', style: 'display:none', onclick: async () => {
      await browser.permissions.remove({ permissions: [id] });
      toast(`${name} disabled`);
      refreshPerm(btn, state, id);
    } }, 'Disable');

    function refreshPerm(b, st, permId) {
      browser.permissions.contains({ permissions: [permId] }).then((has) => {
        st.textContent = has ? 'enabled' : 'disabled';
        st.className = 'tag ' + (has ? 'okk' : '');
        b.style.display = has ? 'none' : '';
        revoke.style.display = has ? '' : 'none';
      });
    }

    const card = h('div', { class: 'card' }, [
      h('div', { class: 'spread' }, [h('div', {}, [h('strong', {}, name), h('div', { class: 'small muted wrap' }, esc(desc))]), h('div', { class: 'row' }, [state, btn, revoke])])
    ]);
    refreshPerm(btn, state, id);
    return card;
  }

  async function themeControls() {
    const settings = await Rec.settings.get();
    const cur = settings.theme || 'auto';
    const seg = h('div', { class: 'row' });
    for (const [v, l, d] of [['auto', 'System', 'follow the OS setting'], ['dark', 'Dark (calm)', 'warm, low blue light'], ['light', 'Light (paper)', 'soft, low glare']]) {
      seg.appendChild(h('button', {
        class: 'btn sm' + (cur === v ? ' primary' : ''),
        onclick: async () => {
          await Rec.settings.set({ theme: v });
          Rec.theme.apply();
          render();
        }
      }, l + (cur === v ? ' ✓' : '')));
      seg.appendChild(h('span', { class: 'small faint' }, d));
    }
    return seg;
  }

  function privacyCard() {
    return h('div', { class: 'card' }, [
      h('h3', {}, 'Data & privacy'),
      kvTable([
        ['Telemetry', 'None. ReconKit does not collect or transmit usage data.'],
        ['Browsing history', 'Not read. Only the active tab is inspected when you ask for it.'],
        ['Page snapshots', 'Stored locally in memory (30 s cache) and used only to render analysis.'],
        ['Local processing', 'All crypto, encoding, hashing and file analysis run on your device.'],
        ['Network (opt-in)', 'DNS/IP lookups use dns.google, crt.sh and ipinfo.io. Targeted service links open in your browser when you click them.'],
        ['Optional permissions', 'Cookies (flags/HttpOnly visibility) and DNS (system resolver) are opt-in only.'],
        ['File uploads', 'Never automatic. External file tools are gated behind explicit consent.'],
        ['API keys', 'No keys are stored or hard-coded.'],
        ['Third-party services', 'Operate under their own policies and may log your queries; review before use.']
      ]),
      h('div', { class: 'row', style: 'margin-top:10px' }, [
        h('button', { class: 'btn sm', onclick: async () => {
          await browser.runtime.sendMessage({ type: 'rk:clear-cache' });
          try { await browser.storage.session.clear(); } catch (e) {}
          toast('Snapshots & session caches cleared');
        } }, 'Clear local caches'),
        h('button', { class: 'btn sm', onclick: async () => {
          const s = (await browser.storage.local.get('settings')).settings || Rec.settings.defaults;
          const blob = new Blob([JSON.stringify(s, null, 2)], { type: 'application/json' });
          const a = h('a', { href: URL.createObjectURL(blob), download: 'reconkit-settings.json' });
          a.click();
        } }, 'Export settings'),
        h('button', { class: 'btn sm', onclick: () => el('import-settings').click() }, 'Import settings')
      ]),
      h('input', {
        type: 'file', id: 'import-settings', accept: 'application/json', class: 'hidden',
        onchange: async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          try {
            const j = JSON.parse(await f.text());
            if (typeof j !== 'object') throw new Error('bad JSON');
            await browser.storage.local.set({ settings: Object.assign({}, Rec.settings.defaults, j) });
            Rec.settings.invalidate();
            await Rec.theme.apply();
            toast('Settings imported', 'ok');
            render();
          } catch (err) {
            toast('Import failed: ' + err.message, 'badd');
          }
        }
      })
    ]);
  }

  function aboutCard() {
    const m = browser.runtime.getManifest();
    return h('div', { class: 'card' }, [
      h('h3', {}, 'About'),
      kvTable([
        ['Name', m.name], ['Version', m.version],
        ['Extension ID', browser.runtime.id],
        ['Manifest', 'WebExtension (Manifest V ' + m.manifest_version + ')'],
        ['Mode', Rec.inSidebar ? 'sidebar' : 'full tab'],
        ['Author', m.author || '—'],
        ['License', 'MIT']
      ]),
      h('div', { class: 'small faint', style: 'margin-top:8px' },
        'ReconKit is a local-first research utility. Review docs in the repository for architecture, permissions and how to extend the toolset. '),
      h('a', { class: 'link small', href: 'https://addons.mozilla.org/en-US/firefox/user/10398388/', target: '_blank', rel: 'noopener noreferrer' },
        'Add-ons profile: ZishanAdThandar')
    ]);
  }

  function render() {
    const view = el('view-settings');
    view.replaceChildren();
    view.appendChild(h('div', { class: 'card' }, [h('h3', {}, 'Appearance'), h('div', { class: 'small muted', style: 'margin-bottom:8px' }, 'Calm dark mode reduces blue-light exposure and uses low-luminance warm surfaces; light mode is soft paper — both tuned to avoid harsh whites.'),
      h('div', { class: 'row' }, [themeControls()]), h('div', { class: 'small faint', style: 'margin-top:8px' }, 'The toolbar toggle flips dark/light instantly and persists your choice.')]));
    view.appendChild(h('div', { class: 'card' }, [h('h3', {}, 'Optional permissions (opt-in)'),
      h('div', { class: 'small muted', style: 'margin-bottom:8px' }, 'ReconKit works fully without these. Enable them for deeper passive analysis; everything stays local.')]));
    view.appendChild(permCard('cookies', 'Enhanced cookie analysis',
      'Read cookie flags (HttpOnly, Secure, SameSite, expiry) for the inspected tab through the browser cookies API.', 'cookies'));
    view.appendChild(privacyCard());
    view.appendChild(aboutCard());
  }

  function open() { render(); }
  return { id: 'settings', label: 'Settings', open };
})();