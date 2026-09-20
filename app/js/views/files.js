/**
 * ReconKit — File & steganography-relevant analysis view.
 * All processing is 100% local: magic bytes, hashes, entropy, strings,
 * image metadata, PNG text chunks, EXIF. External tools are opt-in and clearly
 * separated (they require consent because uploading a file to them is a
 * privacy decision).
 */
'use strict';
var Rec = window.Rec = window.Rec || {};
Rec.views = Rec.views || {};

Rec.views.files = (() => {
  const { h, esc, el, toast, copyBtn, spinner, kvTable } = Rec.ui;
  let consent = false;

  async function loadConsent() {
    try {
      const s = (await browser.storage.local.get('settings')).settings || {};
      consent = !!(s.consent && s.consent.externalFileServices);
    } catch (e) { consent = false; }
  }

  async function saveConsent(v) {
    consent = v;
    try {
      const s = (await browser.storage.local.get('settings')).settings || {};
      s.consent = Object.assign({}, s.consent, { externalFileServices: v });
      await browser.storage.local.set({ settings: s });
    } catch (e) { /* ignore */ }
  }

  async function sha256(bytes) {
    const d = await crypto.subtle.digest('SHA-256', bytes);
    return RekLib.bytesToHex(new Uint8Array(d));
  }

  async function imageInfo(bytes) {
    try {
      const bmp = await createImageBitmap(new Blob([bytes]));
      const r = { width: bmp.width, height: bmp.height };
      bmp.close();
      return r;
    } catch (e) {
      return null;
    }
  }

  async function analyze(file) {
    const view = el('view-files');
    const out = h('div', {}, [spinner('Processing locally…')]);
    view.appendChild(out);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const magic = RekLib.magic.detect(bytes);
      const entropy = RekLib.entropy.profile(bytes);
      const strings = RekLib.strings.extract(bytes, { minLength: 4, limit: 400 });

      const rows = [
        ['File name', file.name],
        ['Size', RekLib.formatBytes(file.size) + '  (' + file.size + ' bytes)'],
        ['MIME (from browser)', file.type || '(unknown)'],
        ['Last modified', new Date(file.lastModified).toLocaleString()],
        ['Detected type (magic bytes)', magic.detected ? magic.name + (magic.ext ? ' ' + magic.ext : '') + (magic.heuristic ? ' (heuristic)' : '') : 'not recognized'],
        ['Bytes inspected', bytes.length]
      ];
      const hashRow = await Promise.all([
        sha256(bytes),
        (async () => RekLib.md5.hex(bytes))()
      ]);
      out.replaceChildren();
      const top = h('div', { class: 'card' });
      top.appendChild(h('h3', {}, 'File information'));
      top.appendChild(kvTable(rows));
      top.appendChild(h('div', { class: 'row', style: 'margin-top:8px' }, [
        h('span', { class: 'small muted' }, 'SHA-256'), h('code', { class: 'wrap' }, hashRow[0]), copyBtn(hashRow[0])
      ]));
      top.appendChild(h('div', { class: 'row', style: 'margin-top:4px' }, [
        h('span', { class: 'small muted' }, 'MD5'), h('code', { class: 'wrap' }, hashRow[1]), copyBtn(hashRow[1])
      ]));
      top.appendChild(h('div', { class: 'small faint', style: 'margin-top:6px' }, 'Hashes computed locally from the exact file bytes.'));
      out.appendChild(top);

      const io = await imageInfo(bytes);
      const isImage = io != null;

      const entCard = h('div', { class: 'card' });
      entCard.appendChild(h('h3', {}, 'Byte profile'));
      entCard.appendChild(kvTable([
        ['Shannon entropy', entropy.entropy.toFixed(3) + ' bits / byte (of ' + entropy.maxEntropy + ')'],
        ['Interpretation', entropy.bytes === 0 ? 'empty' :
          entropy.entropy > 7 ? 'high entropy — compressed, encrypted or random data' :
          entropy.entropy > 4.5 ? 'medium entropy — mixed content' : 'low entropy — likely plaintext or structured data'],
        ['Unique byte values', entropy.uniqueBytes + ' / 256']
      ]));
      if (entropy.top.length) {
        entCard.appendChild(h('div', { class: 'small faint', style: 'margin-top:6px' },
          'Most frequent bytes: ' + entropy.top.map((t) => `0x${t.hex} ${t.char ? "'" + t.char + "'" : ''} (${t.count})`).slice(0, 8).join(', ')));
      }
      out.appendChild(entCard);

      // Strings
      const strCard = h('div', { class: 'card' });
      strCard.appendChild(h('h3', {}, 'Strings (printable runs)'));
      const strText = strings.length
        ? strings.map((s) => `${s.offset.toString().padStart(8, ' ')}: ${s.text}`).join('\n')
        : '(no printable strings ≥ 4 chars)';
      strCard.appendChild(h('div', { class: 'out mono', style: 'max-height:220px' }, esc(strText)));
      strCard.appendChild(h('div', { class: 'row', style: 'margin-top:6px' }, [
        h('span', { class: 'small faint' }, `${strings.length} runs shown (up to 400, min length 4)`), copyBtn(strText)
      ]));
      out.appendChild(strCard);

      if (isImage) {
        const imgCard = h('div', { class: 'card' });
        imgCard.appendChild(h('h3', {}, 'Image information'));
        imgCard.appendChild(kvTable([
          ['Dimensions', io.width + ' × ' + io.height],
          ['Aspect ratio', (io.width / Math.max(io.height, 1)).toFixed(3)],
          ['Format', magic.name]
        ]));
        out.appendChild(imgCard);

        // PNG text chunks
        if (bytes[0] === 0x89 && bytes[1] === 0x50) {
          const png = RekLib.exif.pngText(bytes);
          if (png.ok && png.entries.length) {
            const t = h('table', { class: 'data' });
            t.appendChild(h('tr', {}, [h('th', {}, 'Keyword'), h('th', {}, 'Value'), h('th', {}, 'Compression')]));
            png.entries.forEach((e) => t.appendChild(h('tr', {}, [
              h('td', { class: 'mono' }, esc(e.keyword)), h('td', { class: 'wrap' }, esc(e.text)), h('td', { class: 'mono' }, esc(e.compression))
            ])));
            imgCard.appendChild(h('div', { class: 'small muted', style: 'margin:8px 0 4px' }, 'PNG textual metadata (tEXt/iTXt/zTXt)'));
            imgCard.appendChild(t);
          }
        }
        // EXIF
        if (magic.name.startsWith('JPEG')) {
          const ex = RekLib.exif.parse(bytes);
          if (ex.ok && ex.entries.length) {
            imgCard.appendChild(h('div', { class: 'small muted', style: 'margin:8px 0 4px' }, 'EXIF metadata'));
            imgCard.appendChild(kvTable(ex.entries.slice(0, 24).map((e) => [e.group + ' · ' + e.tag, typeof e.value === 'object' ? JSON.stringify(e.value) : e.value])));
            if (ex.geo) {
              imgCard.appendChild(h('div', { class: 'row', style: 'margin-top:6px' }, [
                h('span', { class: 'tag warn' }, 'GPS'),
                h('span', { class: 'mono' }, esc(ex.geo.formatted)),
                copyBtn(ex.geo.formatted),
                h('a', { class: 'btn sm', href: `https://www.google.com/maps?q=${encodeURIComponent(ex.geo.latitude + ',' + ex.geo.longitude)}`, target: '_blank', rel: 'noopener' }, 'Open in maps')
              ]));
            }
            imgCard.appendChild(h('div', { class: 'small faint', style: 'margin-top:6px' }, 'EXIF may embed GPS, device model and timestamps. Stripped by most social platforms and messengers.'));
          } else if (ex.error) {
            imgCard.appendChild(h('div', { class: 'small faint' }, 'EXIF: ' + esc(ex.error)));
          }
        }
      } else {
        out.appendChild(h('div', { class: 'card faint' }, 'Not decodable as an image — metadata and EXIF analysis skipped.'));
      }
      out.appendChild(externalSection());

      view.appendChild(h('div', { class: 'card' }, [
        h('h3', {}, 'Analyse another file'),
        h('button', { class: 'btn', onclick: () => reset() }, 'Choose a file')
      ]));
    } catch (e) {
      out.replaceChildren();
      out.appendChild(h('div', { class: 'error-box' }, 'Failed to read the file locally: ' + esc(e.message)));
    }
  }

  function externalSection() {
    const tools = RekServices.fileTools();
    const body = h('div', { class: 'card' }, [
      h('h3', {}, 'External analysis services'),
      consent
        ? h('div', {})
        : h('div', { class: 'bg-warn', style: 'padding:8px 10px;border-radius:5px;margin-bottom:8px' }, [
            'These tools run on third-party servers. Opening them here does not upload your file, but using them usually means uploading it.',
            h('button', { class: 'btn sm primary', style: 'margin-top:6px', onclick: async () => { await saveConsent(true); renderConsent(body, tools); } }, 'I understand — show services')
          ])
    ]);
    renderConsent(body, tools);
    return body;
  }

  function renderConsent(wrap, tools) {
    const existing = wrap.querySelector('.ext-list');
    if (existing) existing.remove();
    if (!consent) return;
    const list = h('div', { class: 'ext-list', style: 'margin-top:6px' }, [
      h('div', { class: 'small muted', style: 'margin-bottom:6px' }, 'Links only — files are not uploaded automatically. Review each tool’s privacy policy before use.'),
      ...tools.map((t) => h('div', { class: 'row', style: 'padding:4px 0;border-bottom:1px solid var(--line)' }, [
        h('span', { class: 'muted', style: 'width:170px' }, esc(t.name)),
        h('span', { class: 'small faint', style: 'flex:1' }, esc(t.note || '')),
        h('a', { class: 'btn sm', href: t.url, target: '_blank', rel: 'noopener noreferrer' }, 'Open')
      ]))
    ]);
    wrap.appendChild(list);
  }

  function reset() {
    const view = el('view-files');
    view.replaceChildren();
    renderDrop();
  }

  function renderDrop() {
    const view = el('view-files');
    view.replaceChildren();
    const dz = h('div', { class: 'dropzone' },
      'Drop a file here, or click to browse — processed 100% locally');
    dz.addEventListener('click', () => el('file-input').click());
    dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
    dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
    dz.addEventListener('drop', (e) => {
      e.preventDefault(); dz.classList.remove('drag');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) analyze(e.dataTransfer.files[0]);
    });
    const input = h('input', { type: 'file', id: 'file-input', class: 'hidden' });
    input.addEventListener('change', () => { if (input.files && input.files[0]) analyze(input.files[0]); });
    view.appendChild(h('div', { class: 'card' }, [h('h3', {}, 'Local file analysis'), dz, input]));
    view.appendChild(h('div', { class: 'card faint' },
      'What you get: file type (magic bytes), size, SHA-256 & MD5, Shannon entropy, detectable strings, image dimensions, PNG text metadata and JPEG EXIF (including GPS when present). Nothing leaves your device here.'));
  }

  function open() {
    const view = el('view-files');
    if (!view.children.length) {
      loadConsent().then(() => renderDrop());
    }
  }

  return { id: 'files', label: 'Files', open };
})();