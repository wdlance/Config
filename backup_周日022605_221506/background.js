importScripts('fontProcessor.js', 'mode_config.js');

const dataUriRegex = /data:(application\/octet-stream|application\/x-font-woff|application\/x-font-ttf|application\/x-font-opentype|font\/woff2|font\/woff|font\/ttf|font\/opentype|font\/sfnt)(?:;[^;]+)*;base64,[a-zA-Z0-9+\/=]+/gi;
const mimeToFormat = {
  'application/x-font-woff': 'woff',
  'application/x-font-ttf': 'ttf',
  'application/x-font-opentype': 'otf',
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'font/ttf': 'ttf',
  'font/opentype': 'otf',
  'font/sfnt': 'sfnt'
};
const formatHintMap = {
  'woff': 'woff', 'woff2': 'woff2', 'truetype': 'ttf',
  'opentype': 'otf', 'embedded-opentype': 'eot', 'svg': 'svg'
};

function detectFormatByMagicBytes(base64Data) {
  try {
    const decoded = atob(base64Data);
    if (decoded.length < 4) return null;
    const b0 = decoded.charCodeAt(0);
    const b1 = decoded.charCodeAt(1);
    const b2 = decoded.charCodeAt(2);
    const b3 = decoded.charCodeAt(3);
    if (b0 === 0x77 && b1 === 0x4F && b2 === 0x46 && b3 === 0x46) return 'woff';
    if (b0 === 0x77 && b1 === 0x4F && b2 === 0x46 && b3 === 0x32) return 'woff2';
    if (b0 === 0x4F && b1 === 0x54 && b2 === 0x54 && b3 === 0x4F) return 'otf';
    if (b0 === 0x00 && b1 === 0x01 && b2 === 0x00 && b3 === 0x00) return 'ttf';
    if (b0 === 0x74 && b1 === 0x72 && b2 === 0x75 && b3 === 0x65) return 'ttf';
    return null;
  } catch (e) { return null; }
}

function extractFormatFromSrc(src) {
  const formatMatch = src.match(/format\s*\(\s*["']([^"']+)["']\s*\)/i);
  if (formatMatch) {
    const hint = formatMatch[1].toLowerCase();
    return formatHintMap[hint] || hint;
  }
  return null;
}

function determineFormat(mimeType, base64Data, srcValue) {
  // Priority 1: Magic Bytes (actual binary format, most reliable)
  const magicFormat = detectFormatByMagicBytes(base64Data);
  if (magicFormat) return magicFormat;
  // Priority 2: format() hint from @font-face src
  const formatHint = extractFormatFromSrc(srcValue);
  if (formatHint) return formatHint;
  // Priority 3: MIME type (only works for specific types, not octet-stream)
  if (mimeToFormat[mimeType]) return mimeToFormat[mimeType];
  // Priority 4: fallback
  return 'woff';
}

function parseCssForFonts(cssText) {
  const fonts = [];
  const noComments = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  const normalized = noComments.replace(/[\r\n]/g, '');
  const fontFaceRegex = /@font-face\s*\{([^}]+)\}/gi;
  let ffMatch;
  while ((ffMatch = fontFaceRegex.exec(normalized)) !== null) {
    const block = ffMatch[1];
    const familyMatch = block.match(/font-family\s*:\s*([^;]+);/i);
    const weightMatch = block.match(/font-weight\s*:\s*([^;]+);/i);
    const styleMatch = block.match(/font-style\s*:\s*([^;]+);/i);
    const uriMatches = block.match(dataUriRegex);
    if (uriMatches) {
      for (const match of uriMatches) {
        const base64Start = match.indexOf(';base64,');
        if (base64Start === -1) continue;
        const rawBase64 = match.substring(base64Start + 8);
        const base64Data = rawBase64.replace(/\s/g, '');
        const mimePart = match.substring(5, match.indexOf(';'));
        const format = determineFormat(mimePart, base64Data, block);
        let sizeBytes = 0;
        try { sizeBytes = atob(base64Data).length; } catch (e) {}
        fonts.push({
          name: (familyMatch ? familyMatch[1].replace(/['"]/g, '').trim() : 'Unknown'),
          format: format,
          weight: weightMatch ? weightMatch[1].trim() : '',
          style: styleMatch ? styleMatch[1].trim() : '',
          base64Data: base64Data,
          sizeBytes: sizeBytes,
          sizeKB: Math.round(sizeBytes / 1024 * 100) / 100
        });
      }
    }
  }
  return fonts;
}

// ============================================================
// Format detection for network fonts (Mode 2/3)
// ============================================================

function detectFormatByMagicBytesBinary(bytes) {
  try {
    if (bytes.length < 4) return null;
    const b0 = bytes[0];
    const b1 = bytes[1];
    const b2 = bytes[2];
    const b3 = bytes[3];
    if (b0 === 0x77 && b1 === 0x4F && b2 === 0x46 && b3 === 0x46) return 'woff';
    if (b0 === 0x77 && b1 === 0x4F && b2 === 0x46 && b3 === 0x32) return 'woff2';
    if (b0 === 0x4F && b1 === 0x54 && b2 === 0x54 && b3 === 0x4F) return 'otf';
    if (b0 === 0x00 && b1 === 0x01 && b2 === 0x00 && b3 === 0x00) return 'ttf';
    if (b0 === 0x74 && b1 === 0x72 && b2 === 0x75 && b3 === 0x65) return 'ttf';
    return null;
  } catch (e) { return null; }
}

function detectFormatByUrlExtension(url) {
  const extMatch = url.match(/\.(woff2|woff|ttf|otf|eot|svg)(?:\?.*)?$/i);
  if (extMatch) {
    return extMatch[1].toLowerCase();
  }
  return null;
}

function deriveFontNameFromUrl(url) {
  try {
    const parts = url.split('/');
    const filename = parts[parts.length - 1];
    const name = filename.replace(/\.[^.]+$/, '').replace(/_+/g, '-').replace(/[^a-zA-Z0-9_-]/g, '');
    return name || 'Unknown';
  } catch (e) {
    console.error('[FontCapture BG] deriveFontNameFromUrl error:', e.message);
    return 'Unknown';
  }
}

// ============================================================
// Message handlers
// ============================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[FontCapture BG] Received message:', message.type);

  if (message.type === 'downloadFont') {
    console.log('[FontCapture BG] Download request:', message.filename, 'format:', message.format, 'base64 length:', message.base64Data?.length);
    try {
      let base64ToDownload = message.base64Data;
      let filename = message.filename;

      if (message.format === 'ttf') {
        console.log('[FontCapture BG] Processing TTF font: remove copyright, rename...');
        const fontBytes = base64ToUint8Array(message.base64Data);
        const newFontName = generateNewFontName(6, 12);
        console.log('[FontCapture BG] Generated new font name:', newFontName);
        const processedBytes = processTtfFont(fontBytes, newFontName);
        base64ToDownload = uint8ArrayToBase64(processedBytes);
        const weight = message.weight || '400';
        const style = message.style || 'normal';
        filename = `${newFontName}-${weight}${style}.ttf`;
        console.log('[FontCapture BG] Processed font, new filename:', filename, 'processed size:', processedBytes.length);
      }

      const mimeType = message.format === 'woff2' ? 'font/woff2'
        : message.format === 'ttf' ? 'font/ttf'
        : message.format === 'otf' ? 'font/otf'
        : 'application/x-font-woff';
      const dataUrl = `data:${mimeType};base64,${base64ToDownload}`;
      console.log('[FontCapture BG] Data URI created, mimeType:', mimeType, 'length:', dataUrl.length);

      chrome.downloads.download({
        url: dataUrl,
        filename: filename,
        saveAs: false
      }, downloadId => {
        if (chrome.runtime.lastError) {
          console.error('[FontCapture BG] Download FAILED:', chrome.runtime.lastError.message);
          sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
          console.log('[FontCapture BG] Download SUCCESS, id:', downloadId, 'filename:', filename);
          sendResponse({ success: true, downloadId, filename });
        }
      });
    } catch (e) {
      console.error('[FontCapture BG] Download exception:', e.message, e.stack);
      sendResponse({ success: false, error: e.message });
    }
    return true;
  }

  if (message.type === 'fetchCrossOriginCss') {
    const allFonts = [];
    const hrefs = message.hrefs;
    console.log('[FontCapture BG] Fetch cross-origin CSS, hrefs count:', hrefs.length);
    hrefs.forEach(h => console.log('[FontCapture BG]   href:', h));
    let pending = hrefs.length;

    if (pending === 0) {
      sendResponse({ fonts: allFonts });
      return;
    }

    hrefs.forEach(href => {
      fetch(href)
        .then(resp => {
          console.log('[FontCapture BG] Fetch response:', href, 'status:', resp.status);
          return resp.text();
        })
        .then(cssText => {
          console.log('[FontCapture BG] CSS text length:', cssText.length, 'from:', href);
          const fonts = parseCssForFonts(cssText);
          console.log('[FontCapture BG] Fonts found in cross-origin CSS:', fonts.length, 'from:', href);
          fonts.forEach(f => console.log('[FontCapture BG]   Font:', f.name, f.format, f.sizeKB + 'KB'));
          allFonts.push(...fonts);
        })
        .catch(err => {
          console.error('[FontCapture BG] Fetch FAILED for:', href, err?.message || err);
        })
        .finally(() => {
          pending--;
          if (pending === 0) {
            console.log('[FontCapture BG] All cross-origin CSS fetched, total fonts:', allFonts.length);
            sendResponse({ fonts: allFonts });
          }
        });
    });

    return true;
  }

  if (message.type === 'fetchFontUrls') {
    const allFonts = [];
    const urls = message.urls;
    const mode = message.mode || 2;
    const modeConfig = MODE_CONFIG[mode];
    console.log('[FontCapture BG] fetchFontUrls, mode:', mode, 'urls count:', urls.length);
    urls.forEach(u => console.log('[FontCapture BG]   URL:', u));
    let pending = urls.length;

    if (pending === 0) {
      sendResponse({ fonts: allFonts });
      return;
    }

    urls.forEach(url => {
      fetch(url)
        .then(resp => {
          console.log('[FontCapture BG] Font fetch response:', url, 'status:', resp.status);
          if (!resp.ok) {
            throw new Error('HTTP ' + resp.status);
          }
          return resp.arrayBuffer();
        })
        .then(buffer => {
          const bytes = new Uint8Array(buffer);
          console.log('[FontCapture BG] Font bytes length:', bytes.length, 'from:', url);

          let format = detectFormatByMagicBytesBinary(bytes);
          if (!format) format = detectFormatByUrlExtension(url);
          if (!format) format = modeConfig.formatFallback || 'ttf';
          console.log('[FontCapture BG] Format detected:', format, 'for:', url, '(magic:', detectFormatByMagicBytesBinary(bytes), ', ext:', detectFormatByUrlExtension(url), ')');

          const base64Data = uint8ArrayToBase64(bytes);
          const name = deriveFontNameFromUrl(url);
          console.log('[FontCapture BG] Font name:', name, 'format:', format, 'sizeKB:', Math.round(bytes.length / 1024 * 100) / 100);

          allFonts.push({
            name: name,
            format: format,
            weight: '',
            style: '',
            base64Data: base64Data,
            sizeBytes: bytes.length,
            sizeKB: Math.round(bytes.length / 1024 * 100) / 100,
            url: url
          });
        })
        .catch(err => {
          console.error('[FontCapture BG] Font fetch FAILED:', url, err?.message || err);
        })
        .finally(() => {
          pending--;
          if (pending === 0) {
            console.log('[FontCapture BG] All font URLs fetched, total fonts:', allFonts.length);
            sendResponse({ fonts: allFonts });
          }
        });
    });

    return true;
  }
});