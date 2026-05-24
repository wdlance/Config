// mode2_buildyou.js -- Mode 2: Network font interception for BuildYou (wanderprints.com)
// Loaded in popup.html (script tag)
// scanBuildyouFonts is injected into page via chrome.scripting.executeScript

function scanBuildyouFonts(urlPrefix, initiatorTypes, pathFilter, extensionFilter) {
  console.log('[FontCapture Mode2] Scanning network fonts, prefix:', urlPrefix,
    'initiatorTypes:', initiatorTypes, 'pathFilter:', pathFilter, 'extensionFilter:', extensionFilter);
  const fontUrls = [];
  const allMatched = [];
  const filteredOut = [];
  try {
    const entries = performance.getEntriesByType('resource');
    console.log('[FontCapture Mode2] Resource entries count:', entries.length);
    for (const entry of entries) {
      if (!entry.name.startsWith(urlPrefix)) continue;

      allMatched.push(entry);

      // Filter 1: initiatorType (only fetch/xmlhttprequest)
      if (initiatorTypes && initiatorTypes.length > 0) {
        if (!initiatorTypes.includes(entry.initiatorType)) {
          filteredOut.push({ url: entry.name, reason: 'initiatorType=' + entry.initiatorType });
          continue;
        }
      }

      // Filter 2: URL path must contain pathFilter (e.g., /fonts/)
      if (pathFilter) {
        if (!entry.name.includes(pathFilter)) {
          filteredOut.push({ url: entry.name, reason: 'no pathFilter=' + pathFilter });
          continue;
        }
      }

      // Filter 3: URL extension must be in extensionFilter
      if (extensionFilter && extensionFilter.length > 0) {
        const urlExtMatch = entry.name.match(/\.([a-zA-Z0-9]+)(?:\?.*)?$/);
        const urlExt = urlExtMatch ? urlExtMatch[1].toLowerCase() : null;
        if (!urlExt || !extensionFilter.includes(urlExt)) {
          filteredOut.push({ url: entry.name, reason: 'extension=' + urlExt });
          continue;
        }
      }

      console.log('[FontCapture Mode2] Matched URL:', entry.name,
        'initiatorType:', entry.initiatorType,
        'transferSize:', entry.transferSize);
      fontUrls.push(entry.name);
    }
  } catch (e) {
    console.error('[FontCapture Mode2] Performance API exception:', e.message, e.stack);
  }
  console.log('[FontCapture Mode2] All prefix-matched:', allMatched.length,
    'Filtered out:', filteredOut.length);
  filteredOut.forEach(f => console.log('[FontCapture Mode2]   Filtered:', f.url, f.reason));
  const unique = [...new Set(fontUrls)];
  console.log('[FontCapture Mode2] Final font URLs (deduplicated):', unique.length);
  unique.forEach(u => console.log('[FontCapture Mode2]   URL:', u));
  return { fontUrls: unique };
}