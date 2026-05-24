// fontProcessor.js -- TTF font name table processing module
// Loaded via importScripts() in background.js (Manifest V3 service worker)
// Logic based on FontUtil.java: remove copyright info, rename font

// ============================================================
// Group A: Binary read/write primitives
// ============================================================

function readUint16(data, offset) {
  return (data[offset] << 8) | data[offset + 1];
}

function readUint32(data, offset) {
  return ((data[offset] << 24) | (data[offset + 1] << 16) |
          (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
}

function writeUint16(data, offset, value) {
  data[offset] = (value >> 8) & 0xFF;
  data[offset + 1] = value & 0xFF;
}

function writeUint32(data, offset, value) {
  data[offset] = (value >> 24) & 0xFF;
  data[offset + 1] = (value >> 16) & 0xFF;
  data[offset + 2] = (value >> 8) & 0xFF;
  data[offset + 3] = value & 0xFF;
}

// ============================================================
// Group B: Base64 conversion
// ============================================================

function base64ToUint8Array(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function uint8ArrayToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// ============================================================
// Group C: String encoding/decoding
// ============================================================

function decodeUtf16BE(bytes) {
  let str = '';
  for (let i = 0; i < bytes.length; i += 2) {
    const hi = bytes[i] || 0;
    const lo = bytes[i + 1] || 0;
    str += String.fromCharCode((hi << 8) | lo);
  }
  return str;
}

function decodeAscii(bytes) {
  let str = '';
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b > 0) str += String.fromCharCode(b);
  }
  return str;
}

function encodeUtf16BE(str) {
  const bytes = new Uint8Array(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    bytes[i * 2] = (code >> 8) & 0xFF;
    bytes[i * 2 + 1] = code & 0xFF;
  }
  return bytes;
}

function encodeAscii(str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    bytes[i] = code < 128 ? code : 0;
  }
  return bytes;
}

function encodeStringForRecord(strValue, platformID, encodingID) {
  if (platformID === 3) {
    return encodeUtf16BE(strValue);
  } else if (platformID === 1 && encodingID === 0) {
    return encodeAscii(strValue);
  }
  return null;
}

// ============================================================
// Group D: Name generation (per FontUtil.java)
// ============================================================

function generateNewFontName(min, max) {
  const length = Math.floor(Math.random() * (max - min + 1)) + min;
  let name = '';
  name += String.fromCharCode(Math.floor(Math.random() * 26) + 65);
  for (let i = 1; i < length; i++) {
    name += String.fromCharCode(Math.floor(Math.random() * 26) + 97);
  }
  return name;
}

// ============================================================
// Group E: Name table parsing
// ============================================================

function parseTtfNameTable(fontBytes) {
  const sfVersion = readUint32(fontBytes, 0);
  if (sfVersion !== 0x00010000 && sfVersion !== 0x74727565) {
    console.warn('[FontProcessor] Not a TrueType font, sfVersion:', sfVersion);
    return null;
  }

  const numTables = readUint16(fontBytes, 4);
  const dirStart = 12;
  const tableEntries = [];
  let nameIdx = -1;

  for (let i = 0; i < numTables; i++) {
    const entryOff = dirStart + i * 16;
    const tag = String.fromCharCode(
      fontBytes[entryOff], fontBytes[entryOff + 1],
      fontBytes[entryOff + 2], fontBytes[entryOff + 3]
    );
    const entry = {
      tag,
      checksum: readUint32(fontBytes, entryOff + 4),
      offset: readUint32(fontBytes, entryOff + 8),
      length: readUint32(fontBytes, entryOff + 12)
    };
    tableEntries.push(entry);
    if (tag === 'name') nameIdx = i;
  }

  if (nameIdx === -1) {
    console.warn('[FontProcessor] No name table found');
    return null;
  }

  const nameEntry = tableEntries[nameIdx];
  const nameOff = nameEntry.offset;
  const nameLen = nameEntry.length;

  const format = readUint16(fontBytes, nameOff);
  const count = readUint16(fontBytes, nameOff + 2);
  const stringOffset = readUint16(fontBytes, nameOff + 4);

  const records = [];
  for (let i = 0; i < count; i++) {
    const recOff = nameOff + 6 + i * 12;
    const rec = {
      platformID: readUint16(fontBytes, recOff),
      encodingID: readUint16(fontBytes, recOff + 2),
      languageID: readUint16(fontBytes, recOff + 4),
      nameID: readUint16(fontBytes, recOff + 6),
      length: readUint16(fontBytes, recOff + 8),
      strOff: readUint16(fontBytes, recOff + 10)
    };

    const strStart = nameOff + stringOffset + rec.strOff;
    const strBytes = fontBytes.slice(strStart, strStart + rec.length);
    if (rec.platformID === 3) {
      rec.stringValue = decodeUtf16BE(strBytes);
    } else {
      rec.stringValue = decodeAscii(strBytes);
    }
    records.push(rec);
  }

  return {
    format, count, stringOffset, records,
    nameTableOffset: nameOff, nameTableLength: nameLen,
    numTables, tableEntries, nameIdx
  };
}

// ============================================================
// Group F: Name table modification (per FontUtil.java rules)
// ============================================================

function buildModifiedNameTable(parsedData, newFontName, originalFontBytes) {
  const REMOVE_IDS = new Set([0, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
  const kept = parsedData.records.filter(r => !REMOVE_IDS.has(r.nameID));

  for (const rec of kept) {
    switch (rec.nameID) {
      case 1: rec.newString = newFontName; break;
      case 2: rec.newString = 'Regular'; break;
      case 3: rec.newString = newFontName + ': 2025'; break;
      case 4: rec.newString = newFontName; break;
      case 5: rec.newString = 'Version 1.000'; break;
      case 6: rec.newString = newFontName; break;
      default: rec.newString = rec.stringValue; break;
    }
  }

  const headerSize = 6;
  const recordsSize = kept.length * 12;
  const strStorageStart = headerSize + recordsSize;

  const encodedStrings = [];
  let totalStrLen = 0;

  for (const rec of kept) {
    const encoded = encodeStringForRecord(rec.newString, rec.platformID, rec.encodingID);
    if (encoded) {
      rec.newStrLen = encoded.length;
      rec.newStrOff = totalStrLen;
      encodedStrings.push(encoded);
      totalStrLen += encoded.length;
    } else {
      // Unsupported encoding: keep original bytes
      const strStart = parsedData.nameTableOffset + parsedData.stringOffset + rec.strOff;
      const origBytes = originalFontBytes.slice(strStart, strStart + rec.length);
      rec.newStrLen = rec.length;
      rec.newStrOff = totalStrLen;
      encodedStrings.push(origBytes);
      totalStrLen += rec.length;
    }
  }

  const totalSize = strStorageStart + totalStrLen;
  const nameTable = new Uint8Array(totalSize);
  const nv = new DataView(nameTable.buffer);

  writeUint16(nameTable, 0, 0); // format 0
  writeUint16(nameTable, 2, kept.length);
  writeUint16(nameTable, 4, strStorageStart);

  for (let i = 0; i < kept.length; i++) {
    const rec = kept[i];
    const off = 6 + i * 12;
    writeUint16(nameTable, off, rec.platformID);
    writeUint16(nameTable, off + 2, rec.encodingID);
    writeUint16(nameTable, off + 4, rec.languageID);
    writeUint16(nameTable, off + 6, rec.nameID);
    writeUint16(nameTable, off + 8, rec.newStrLen);
    writeUint16(nameTable, off + 10, rec.newStrOff);
  }

  let writePos = strStorageStart;
  for (const enc of encodedStrings) {
    nameTable.set(enc, writePos);
    writePos += enc.length;
  }

  return nameTable;
}

// ============================================================
// Group G: Font rebuild
// ============================================================

function padTo4Bytes(length) {
  return (length + 3) & ~3;
}

function calculateChecksum(data) {
  let sum = 0;
  const padLen = padTo4Bytes(data.length);
  const padded = new Uint8Array(padLen);
  padded.set(data);
  const pv = new DataView(padded.buffer);
  for (let i = 0; i < padLen; i += 4) {
    sum = (sum + pv.getUint32(i)) >>> 0;
  }
  return sum;
}

function rebuildFontBinary(originalFontBytes, newNameTableBytes, parsedData) {
  const sfVersion = readUint32(originalFontBytes, 0);
  const numTables = parsedData.numTables;
  const searchRange = readUint16(originalFontBytes, 6);
  const entrySelector = readUint16(originalFontBytes, 8);
  const rangeShift = readUint16(originalFontBytes, 10);

  const headerSize = 12;
  const dirSize = numTables * 16;
  let dataOff = headerSize + dirSize;

  const newEntries = [];
  for (let i = 0; i < numTables; i++) {
    const orig = parsedData.tableEntries[i];
    const isName = (i === parsedData.nameIdx);
    const dataBytes = isName ? newNameTableBytes
      : originalFontBytes.slice(orig.offset, orig.offset + orig.length);
    const length = isName ? newNameTableBytes.length : orig.length;
    const checksum = isName ? calculateChecksum(newNameTableBytes) : orig.checksum;
    const alignedLen = padTo4Bytes(length);

    newEntries.push({
      tag: orig.tag, offset: dataOff, length,
      checksum, dataBytes, alignedLen, isName
    });
    dataOff += alignedLen;
  }

  const newFont = new Uint8Array(dataOff);
  const fv = new DataView(newFont.buffer);

  writeUint32(newFont, 0, sfVersion);
  writeUint16(newFont, 4, numTables);
  writeUint16(newFont, 6, searchRange);
  writeUint16(newFont, 8, entrySelector);
  writeUint16(newFont, 10, rangeShift);

  for (let i = 0; i < numTables; i++) {
    const e = newEntries[i];
    const dirOff = headerSize + i * 16;
    for (let c = 0; c < 4; c++) {
      newFont[dirOff + c] = e.tag.charCodeAt(c);
    }
    writeUint32(newFont, dirOff + 4, e.checksum);
    writeUint32(newFont, dirOff + 8, e.offset);
    writeUint32(newFont, dirOff + 12, e.length);
  }

  for (const e of newEntries) {
    newFont.set(e.dataBytes, e.offset);
  }

  return newFont;
}

// ============================================================
// Group H: Orchestration
// ============================================================

function processTtfFont(fontBytes, newFontName) {
  const parsed = parseTtfNameTable(fontBytes);
  if (!parsed) {
    console.warn('[FontProcessor] Failed to parse name table, returning original font');
    return fontBytes;
  }

  console.log('[FontProcessor] Original name records:', parsed.records.length,
    'kept after removal:', parsed.records.filter(r =>
      !new Set([0,7,8,9,10,11,12,13,14,15,16,17,18]).has(r.nameID)).length);
  console.log('[FontProcessor] New font name:', newFontName);

  const newNameTable = buildModifiedNameTable(parsed, newFontName, fontBytes);
  const rebuilt = rebuildFontBinary(fontBytes, newNameTable, parsed);

  console.log('[FontProcessor] Original size:', fontBytes.length,
    'New size:', rebuilt.length,
    'Name table:', parsed.nameTableLength, '->', newNameTable.length);

  return rebuilt;
}