/**
 * ReconKit — Minimal JPEG EXIF parser (offline).
 * Reads APP1 "Exif" segments: IFD0, ExifIFD, GPSIFD. Decodes common tag
 * types (ASCII, BYTE, SHORT, LONG, RATIONAL, SRATIONAL, UNDEFINED) and maps
 * both JPEG EXIF and PNG textual metadata where relevant.
 * Heuristic and best-effort: malformed metadata yields graceful "undetermined".
 */
(function (g) {
  'use strict';

  const TAGS_IFD0 = {
    0x010f: 'Make', 0x0110: 'Model', 0x0112: 'Orientation', 0x011a: 'XResolution',
    0x011b: 'YResolution', 0x0128: 'ResolutionUnit', 0x0131: 'Software',
    0x0132: 'DateTime', 0x013b: 'Artist', 0x8298: 'Copyright', 0x010e: 'ImageDescription',
    0x013e: 'WhitePoint', 0x013f: 'PrimaryChromaticities'
  };
  const TAGS_EXIF = {
    0x829a: 'ExposureTime', 0x829d: 'FNumber', 0x8822: 'ExposureProgram',
    0x8827: 'ISOSpeedRatings', 0x9000: 'ExifVersion', 0x9003: 'DateTimeOriginal',
    0x9004: 'DateTimeDigitized', 0x9101: 'ComponentsConfiguration', 0x9102: 'CompressedBitsPerPixel',
    0x9201: 'ShutterSpeedValue', 0x9202: 'ApertureValue', 0x9204: 'ExposureBiasValue',
    0x9205: 'MaxApertureValue', 0x9207: 'MeteringMode', 0x9208: 'LightSource',
    0x9209: 'Flash', 0x920a: 'FocalLength', 0x927c: 'MakerNote', 0x9286: 'UserComment',
    0xa000: 'FlashPixVersion', 0xa001: 'ColorSpace', 0xa002: 'PixelXDimension',
    0xa003: 'PixelYDimension', 0xa20e: 'FocalPlaneXResolution', 0xa20f: 'FocalPlaneYResolution',
    0xa217: 'SensingMethod', 0xa301: 'SceneType', 0xa401: 'CustomRendered',
    0xa402: 'ExposureMode', 0xa403: 'WhiteBalance', 0xa404: 'DigitalZoomRatio',
    0xa405: 'FocalLengthIn35mmFilm', 0xa406: 'SceneCaptureType', 0xa407: 'GainControl',
    0xa408: 'Contrast', 0xa409: 'Saturation', 0xa40a: 'Sharpness', 0xa40c: 'SubjectDistanceRange'
  };
  const TAGS_GPS = {
    0x0000: 'GPSVersionID', 0x0001: 'GPSLatitudeRef', 0x0002: 'GPSLatitude',
    0x0003: 'GPSLongitudeRef', 0x0004: 'GPSLongitude', 0x0005: 'GPSAltitudeRef',
    0x0006: 'GPSAltitude', 0x0007: 'GPSTimeStamp', 0x0008: 'GPSSatellites',
    0x0009: 'GPSStatus', 0x000a: 'GPSMeasureMode', 0x000b: 'GPSDOP',
    0x001c: 'GPSAreaInformation', 0x001d: 'GPSDateStamp'
  };
  const IFD_POINTER = 0x8769; // ExifIFD
  const GPS_POINTER = 0x8825; // GPSIFD

  function readAscii(dv, off, len, endian) {
    let s = '';
    for (let i = 0; i < len; i++) {
      const c = dv.getUint8(off + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }
  function readRational(dv, off, endian) {
    const num = dv.getUint32(off, endian);
    const den = dv.getUint32(off + 4, endian);
    if (den === 0) return null;
    return num / den;
  }
  function readSRational(dv, off, endian) {
    const num = dv.getInt32(off, endian);
    const den = dv.getInt32(off + 4, endian);
    if (den === 0) return null;
    return num / den;
  }

  function decodeValue(type, count, dataOff, dv, endian) {
    switch (type) {
      case 1: { // BYTE
        const out = [];
        for (let i = 0; i < count; i++) out.push(dv.getUint8(dataOff + i));
        return out.length === 1 ? out[0] : out;
      }
      case 2: return readAscii(dv, dataOff, count, endian);
      case 3: { // SHORT
        const out = [];
        for (let i = 0; i < count; i++) out.push(dv.getUint16(dataOff + i * 2, endian));
        return out.length === 1 ? out[0] : out;
      }
      case 4: { // LONG
        const out = [];
        for (let i = 0; i < count; i++) out.push(dv.getUint32(dataOff + i * 4, endian));
        return out.length === 1 ? out[0] : out;
      }
      case 5: return count === 1 ? readRational(dv, dataOff, endian) : (() => {
        const out = [];
        for (let i = 0; i < count; i++) out.push(readRational(dv, dataOff + i * 8, endian));
        return out;
      })();
      case 7: { // UNDEFINED
        const bytes = new Uint8Array(dv.buffer, dataOff, count);
        return 'bytes[' + count + ']';
      }
      case 9: { // SLONG
        const out = [];
        for (let i = 0; i < count; i++) out.push(dv.getInt32(dataOff + i * 4, endian));
        return out.length === 1 ? out[0] : out;
      }
      case 10: return count === 1 ? readSRational(dv, dataOff, endian) : (() => {
        const out = [];
        for (let i = 0; i < count; i++) out.push(readSRational(dv, dataOff + i * 8, endian));
        return out;
      })();
      default:
        return `type-${type}`;
    }
  }

  function readIFD(dv, baseOff, endian, tagMap, depth) {
    const entries = [];
    const n = dv.getUint16(baseOff, endian);
    const walk = [];
    let p = 0;
    for (let i = 0; i < n && i < 512; i++) {
      const off = baseOff + 2 + i * 12;
      try {
        const tag = dv.getUint16(off, endian);
        const type = dv.getUint16(off + 2, endian);
        const count = dv.getUint32(off + 4, endian);
        let val;
        if (type === 2 ? count <= 4 : count * sizeOf(type) <= 4) {
          val = decodeValue(type, count, off + 8, dv, endian);
        } else {
          const dataOff = baseOff + dv.getUint32(off + 8, endian);
          val = decodeValue(type, count, dataOff, dv, endian);
        }
        walk.push({ tag, name: tagMap[tag] || `0x${tag.toString(16).toUpperCase().padStart(4, '0')}`, value: val });
        if (tag === IFD_POINTER && depth < 2 && typeof val === 'number') {
          walk.push(...readIFD(dv, baseOff + val, endian, TAGS_EXIF, depth + 1));
        } else if (tag === GPS_POINTER && depth < 2 && typeof val === 'number') {
          walk.push(...readIFD(dv, baseOff + val, endian, TAGS_GPS, depth + 1));
        }
      } catch (e) {
        break;
      }
    }
    return walk;
  }

  function sizeOf(type) {
    switch (type) {
      case 1: case 7: return 1;
      case 3: return 2;
      case 4: case 9: return 4;
      case 5: case 10: return 8;
      case 2: return 1;
      default: return 1;
    }
  }

  /**
   * Parse EXIF from a file's bytes (JPEG). Returns { ok, entries, geo|null, error }.
   */
  function parseExif(input) {
    const u8 = g.RekLib.toBytes(input);
    const look = (from, to) => {
      const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
      for (let i = from; i <= to - 1; i++) {
        if (u8[i] === 0xff && u8[i + 1] === 0xe1) {
          const segLen = dv.getUint16(i + 2);
          const start = i + 4;
          // 'Exif\0\0'
          if (start + 6 <= u8.length && u8[start] === 0x45 && u8[start + 1] === 0x78 &&
              u8[start + 2] === 0x69 && u8[start + 3] === 0x66 && u8[start + 4] === 0x00 && u8[start + 5] === 0x00) {
            return { dv, start: start + 6 };
          }
        }
      }
      return null;
    };

    try {
      const found = look(0, u8.length - 4);
      if (!found) return { ok: false, error: 'No EXIF APP1 segment found (common for PNG, WebP, screenshots).' };
      const { dv, start } = found;
      const endianMark = dv.getUint16(start);
      const endian = endianMark === 0x4949 ? true : endianMark === 0x4d4d ? false : null;
      if (endian === null) return { ok: false, error: 'Invalid TIFF byte-order marker.' };
      const ifd0Off = dv.getUint32(start + 4, endian);
      const entries = readIFD(dv, start + ifd0Off, endian, TAGS_IFD0, 0);

      // Build friendly structure
      const pretty = entries.map((e) => ({ group: tagGroup(e.name), tag: e.name, value: friendly(e.name, e.value) }));

      // GPS summary
      let geo = null;
      const lat = numeric(entries, 'GPSLatitude');
      const latRef = strVal(entries, 'GPSLatitudeRef');
      const lon = numeric(entries, 'GPSLongitude');
      const lonRef = strVal(entries, 'GPSLongitudeRef');
      if (lat != null && lon != null) {
        geo = {
          latitude: (latRef === 'S' ? -1 : 1) * lat,
          longitude: (lonRef === 'W' ? -1 : 1) * lon,
          formatted: `${(latRef === 'S' ? -1 : 1) * lat.toFixed(6)}, ${(lonRef === 'W' ? -1 : 1) * lon.toFixed(6)}`,
          altitude: numeric(entries, 'GPSAltitude') != null ? numeric(entries, 'GPSAltitude') : undefined
        };
      }
      return { ok: true, entries: pretty, geo, count: entries.length };
    } catch (e) {
      return { ok: false, error: `EXIF parsing failed: ${e.message}` };
    }
  }

  function tagGroup(name) {
    if (name.startsWith('GPS')) return 'GPS';
    if (['ExposureTime', 'FNumber', 'ISO', 'DateTimeOriginal', 'Flash', 'FocalLength', 'WhiteBalance'].includes(name) || TAGS_EXIF_ENUM.includes(name)) return 'Exif';
    return 'Image';
  }
  const TAGS_EXIF_ENUM = ['ExposureProgram', 'ExposureMode', 'ExposureBiasValue', 'ISOSpeedRatings', 'ShutterSpeedValue', 'ApertureValue', 'MaxApertureValue', 'MeteringMode', 'LightSource', 'ColorSpace', 'PixelXDimension', 'PixelYDimension', 'CustomRendered', 'SceneCaptureType', 'Contrast', 'Saturation', 'Sharpness', 'DigitalZoomRatio', 'SubjectDistanceRange', 'SceneType', 'SensingMethod', 'ComponentsConfiguration'];
  function friendly(name, v) {
    if (name === 'Orientation') {
      const map = { 1: 'Horizontal (normal)', 3: 'Rotated 180°', 6: 'Rotated 90° CW', 8: 'Rotated 270° CW' };
      return map[v] || v;
    }
    if (name === 'ResolutionUnit') return { 1: 'None', 2: 'inch', 3: 'cm' }[v] || v;
    if (name === 'Flash') {
      return v === 0 ? 'Did not fire' : v === 1 ? 'Fired' : `Fired (mode ${v})`;
    }
    if (name === 'MeteringMode' && typeof v === 'number') return v === 0 ? 'Unknown' : v === 1 ? 'Average' : v === 2 ? 'Center-weighted' : v === 3 ? 'Spot' : v === 5 ? 'Matrix' : `Mode ${v}`;
    if (name === 'ColorSpace' && typeof v === 'number') return v === 1 ? 'sRGB' : v === 0xffff ? 'Uncalibrated' : v;
    if (typeof v === 'number' && /Time|Exposure|FNumber|Bias|Ratio|ISO|Focal|Aperture|Shutter|Resolution/.test(name) && !Number.isInteger(v)) {
      return Number(v.toFixed(4));
    }
    return v;
  }

  function numeric(entries, tag) {
    const e = entries.find((x) => x.name === tag);
    if (!e) return null;
    if (typeof e.value === 'number') return e.value;
    if (Array.isArray(e.value) && e.value.length === 3 && e.value.every((n) => typeof n === 'number')) {
      return e.value[0] + e.value[1] / 60 + e.value[2] / 3600;
    }
    return null;
  }
  function strVal(entries, tag) {
    const e = entries.find((x) => x.name === tag);
    return e && typeof e.value === 'string' ? e.value : null;
  }

  /**
   * PNG textual chunks (tEXt/zTXt/iTXt) — offline keyword/value dump.
   */
  function pngTextChunks(input) {
    const u8 = g.RekLib.toBytes(input);
    if (!(u8.length >= 8 && u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4e && u8[3] === 0x47)) {
      return { ok: false, error: 'Not a PNG file.' };
    }
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const out = [];
    let off = 8;
    while (off + 8 <= u8.length) {
      const len = dv.getUint32(off);
      const type = String.fromCharCode(u8[off + 4], u8[off + 5], u8[off + 6], u8[off + 7]);
      const dataStart = off + 8;
      if (type === 'tEXt') {
        const data = new Uint8Array(u8.buffer, u8.byteOffset + dataStart, len);
        let nul = -1;
        for (let i = 0; i < data.length; i++) if (data[i] === 0) { nul = i; break; }
        const keyword = nul >= 0 ? g.RekLib.decodeUTF8(data.subarray(0, nul)) : '';
        const text = nul >= 0 ? g.RekLib.decodeUTF8(data.subarray(nul + 1)) : '';
        out.push({ keyword, text, compression: 'none' });
      } else if (type === 'iTXt') {
        const data = new Uint8Array(u8.buffer, u8.byteOffset + dataStart, len);
        const str = g.RekLib.decodeUTF8(data);
        const parts = str.split('\x00');
        if (parts.length >= 4) {
          out.push({ keyword: parts[0], text: parts[parts.length - 1], compression: parts[1] === '1' ? 'zlib' : 'none', language: parts[2] });
        }
      } else if (type === 'zTXt') {
        const data = new Uint8Array(u8.buffer, u8.byteOffset + dataStart, len);
        let nul = -1;
        for (let i = 0; i < data.length; i++) if (data[i] === 0) { nul = i; break; }
        const keyword = nul >= 0 ? g.RekLib.decodeUTF8(data.subarray(0, nul)) : '';
        out.push({ keyword, text: '(zlib-compressed — inflate to read)', compression: 'zlib' });
      }
      off += len + 12;
      if (type === 'IEND') break;
    }
    return { ok: true, entries: out };
  }

  g.RekLib.module('exif', function () {
    return { parse: parseExif, pngText: pngTextChunks };
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);