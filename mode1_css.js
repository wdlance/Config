// mode1_css.js -- Mode 1: CSS @font-face base64 data URI scanning
// Loaded in popup.html (script tag)
// scanAccessibleStyles is injected into page via chrome.scripting.executeScript

function scanAccessibleStyles() {
  const fonts = [];
  const crossOriginHrefs = [];
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
    const magicFormat = detectFormatByMagicBytes(base64Data);
    if (magicFormat) return magicFormat;
    const formatHint = extractFormatFromSrc(srcValue);
    if (formatHint) return formatHint;
    if (mimeToFormat[mimeType]) return mimeToFormat[mimeType];
    return 'woff';
  }

  function extractFromRules(rules) {
    for (const rule of rules) {
      if (rule.type === CSSRule.FONT_FACE_RULE) {
        const src = rule.style.getPropertyValue('src');
        const family = rule.style.getPropertyValue('font-family').replace(/['"]/g, '');
        const weight = rule.style.getPropertyValue('font-weight') || '';
        const style = rule.style.getPropertyValue('font-style') || '';
        const matches = src.match(dataUriRegex);
        if (matches) {
          for (const match of matches) {
            const base64Start = match.indexOf(';base64,');
            if (base64Start === -1) continue;
            const rawBase64 = match.substring(base64Start + 8);
            const base64Data = rawBase64.replace(/\s/g, '');
            const mimePart = match.substring(5, match.indexOf(';'));
            const format = determineFormat(mimePart, base64Data, src);
            let sizeBytes = 0;
            try { sizeBytes = atob(base64Data).length; } catch (e) {}
            fonts.push({
              name: family,
              format: format,
              weight: weight,
              style: style,
              base64Data: base64Data,
              sizeBytes: sizeBytes,
              sizeKB: Math.round(sizeBytes / 1024 * 100) / 100
            });
          }
        }
      } else if (rule.type === CSSRule.MEDIA_RULE) {
        try { extractFromRules(rule.cssRules); } catch (e) {}
      } else if (rule.type === CSSRule.IMPORT_RULE && rule.styleSheet) {
        try { extractFromRules(rule.styleSheet.cssRules); } catch (e) {}
      }
    }
  }

  console.log('[FontCapture Scan] Starting scan, styleSheets count:', document.styleSheets.length);

  for (const sheet of document.styleSheets) {
    try {
      extractFromRules(sheet.cssRules);
    } catch (e) {
      if (sheet.href) {
        console.log('[FontCapture Scan] Cross-origin sheet:', sheet.href);
        crossOriginHrefs.push(sheet.href);
      }
    }
  }

  const inlineStyles = document.querySelectorAll('style');
  console.log('[FontCapture Scan] Inline style elements:', inlineStyles.length);
  inlineStyles.forEach(el => {
    const noComments = el.textContent.replace(/\/\*[\s\S]*?\*\//g, '');
    const text = noComments.replace(/[\r\n]/g, '');
    const fontFaceRegex = /@font-face\s*\{([^}]+)\}/gi;
    let ffMatch;
    while ((ffMatch = fontFaceRegex.exec(text)) !== null) {
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
  });

  console.log('[FontCapture Scan] Scan complete: fonts:', fonts.length, 'crossOriginHrefs:', crossOriginHrefs.length);
  fonts.forEach(f => console.log('[FontCapture Scan]   Font:', f.name, f.format, f.sizeKB + 'KB', 'weight:', f.weight, 'style:', f.style));

  return { fonts, crossOriginHrefs };
}