const fontListEl = document.getElementById('font-list');
const statusEl = document.getElementById('status');
const emptyStateEl = document.getElementById('empty-state');
const footerEl = document.getElementById('footer');
const rescanBtn = document.getElementById('rescan-btn');
const downloadAllBtn = document.getElementById('download-all-btn');
const errorStateEl = document.getElementById('error-state');
const errorMsgEl = document.getElementById('error-msg');
const searchToolInfoEl = document.getElementById('search-tool-info');
const searchToolNameEl = document.getElementById('search-tool-name');

let fonts = [];
let currentMode = 1;

function showLoading() {
  statusEl.innerHTML = '<span class="loading-spinner"></span>扫描中...';
  rescanBtn.disabled = true;
  fontListEl.innerHTML = '';
  emptyStateEl.classList.add('hidden');
  footerEl.classList.add('hidden');
  errorStateEl.classList.add('hidden');
  searchToolInfoEl.classList.remove('hidden');
  searchToolNameEl.textContent = '检测中...';
}

function showError(msg) {
  statusEl.textContent = '扫描失败';
  rescanBtn.disabled = false;
  emptyStateEl.classList.add('hidden');
  footerEl.classList.add('hidden');
  errorMsgEl.textContent = msg;
  errorStateEl.classList.remove('hidden');
  // If search detection hasn't completed yet, mark as failed
  if (searchToolNameEl.textContent === '检测中...') {
    searchToolNameEl.textContent = '检测失败';
  }
}

function renderFonts(fontData) {
  const config = MODE_CONFIG[currentMode];
  const allowedFormats = config.allowedFormats;
  const seen = new Set();
  fonts = fontData.filter(f => {
    if (!allowedFormats.includes(f.format)) return false;
    const key = f.base64Data || f.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  statusEl.textContent = fonts.length > 0
    ? `检测到 ${fonts.length} 个字体 (模式${currentMode}: ${config.name})`
    : '未检测到字体';
  rescanBtn.disabled = false;
  errorStateEl.classList.add('hidden');

  if (fonts.length === 0) {
    emptyStateEl.classList.remove('hidden');
    footerEl.classList.add('hidden');
    return;
  }

  emptyStateEl.classList.add('hidden');
  footerEl.classList.remove('hidden');
  fontListEl.innerHTML = '';

  const nameCount = {};
  fonts.forEach((font, idx) => {
    let displayName = font.name;
    if (nameCount[font.name]) {
      nameCount[font.name]++;
      displayName = `${font.name}-${nameCount[font.name]}`;
    } else {
      nameCount[font.name] = 1;
    }

    const item = document.createElement('div');
    item.className = 'font-item';
    item.innerHTML = `
      <div class="font-info">
        <div class="font-name">${displayName}</div>
        <div class="font-meta">
          <span class="font-format">${font.format.toUpperCase()}</span>
          <span>${font.sizeKB} KB</span>
          <span>${font.weight || '400'} ${font.style || 'normal'}</span>
        </div>
      </div>
      <button class="download-btn" data-idx="${idx}">下载</button>
    `;
    fontListEl.appendChild(item);
  });

  fontListEl.querySelectorAll('.download-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      downloadFont(idx, btn);
    });
  });
}

function downloadFont(idx, btnEl) {
  const font = fonts[idx];
  if (!font) {
    console.error('[FontCapture Popup] downloadFont: invalid idx', idx);
    return;
  }

  const weight = font.weight || '400';
  const style = font.style || 'normal';
  const safeName = font.name.replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${safeName}-${weight}${style}.${font.format}`;
  console.log('[FontCapture Popup] Download request:', filename, 'format:', font.format, 'base64 length:', font.base64Data.length);

  chrome.runtime.sendMessage({
    type: 'downloadFont',
    base64Data: font.base64Data,
    format: font.format,
    filename: filename,
    weight: font.weight || '',
    style: font.style || ''
  }, response => {
    if (response && response.success) {
      console.log('[FontCapture Popup] Download success:', filename);
      btnEl.textContent = '已下载';
      btnEl.classList.add('downloaded');
      btnEl.disabled = true;
    } else {
      console.error('[FontCapture Popup] Download failed:', filename, 'error:', response?.error || 'no response');
      btnEl.textContent = '失败';
      btnEl.classList.add('error');
      btnEl.disabled = true;
    }
  });
}

downloadAllBtn.addEventListener('click', () => {
  const btns = fontListEl.querySelectorAll('.download-btn:not(.downloaded):not(.error)');
  btns.forEach(btn => {
    const idx = parseInt(btn.dataset.idx);
    downloadFont(idx, btn);
  });
});

function scanCurrentPage() {
  showLoading();
  console.log('[FontCapture Popup] scanCurrentPage started');

  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) {
      console.error('[FontCapture Popup] No active tab found');
      showError('无法获取当前标签页');
      return;
    }
    console.log('[FontCapture Popup] Active tab:', tabs[0].id, tabs[0].url);

    currentMode = determineMode(tabs[0].url);
    const config = MODE_CONFIG[currentMode];
    console.log('[FontCapture Popup] Mode:', currentMode, 'Name:', config.name, 'URL:', tabs[0].url);

    // Run search tool detection (parallel with font scan)
    detectSearchToolForTab(tabs[0].id);

    switch (currentMode) {
      case 1: scanMode1(tabs[0].id); break;
      case 2: scanMode2(tabs[0].id); break;
      case 3: scanMode3(tabs[0].id); break;
      default: scanMode1(tabs[0].id); break;
    }
  });
}

function scanMode1(tabId) {
  console.log('[FontCapture Popup] scanMode1 started, tabId:', tabId);

  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: scanAccessibleStyles
  }, results => {
    if (chrome.runtime.lastError) {
      console.error('[FontCapture Popup] Script injection failed:', chrome.runtime.lastError.message);
      showError(chrome.runtime.lastError.message);
      return;
    }

    const scanResult = results?.[0]?.result || { fonts: [], crossOriginHrefs: [] };
    const foundFonts = scanResult.fonts || [];
    const crossOriginHrefs = scanResult.crossOriginHrefs || [];
    console.log('[FontCapture Popup] Scan result: fonts found:', foundFonts.length, 'cross-origin hrefs:', crossOriginHrefs.length);
    foundFonts.forEach(f => console.log('[FontCapture Popup]   Font:', f.name, f.format, f.sizeKB + 'KB'));

    if (crossOriginHrefs.length === 0) {
      renderFonts(foundFonts);
      return;
    }

    console.log('[FontCapture Popup] Fetching cross-origin CSS...');
    statusEl.textContent = '扫描跨域样式表...';

    chrome.runtime.sendMessage({
      type: 'fetchCrossOriginCss',
      hrefs: crossOriginHrefs
    }, response => {
      if (chrome.runtime.lastError) {
        console.error('[FontCapture Popup] Cross-origin fetch failed:', chrome.runtime.lastError.message);
        showError(chrome.runtime.lastError.message);
        return;
      }

      const crossFonts = response?.fonts || [];
      console.log('[FontCapture Popup] Cross-origin fonts:', crossFonts.length);
      crossFonts.forEach(f => console.log('[FontCapture Popup]   Font:', f.name, f.format, f.sizeKB + 'KB'));
      const allFonts = [...foundFonts, ...crossFonts];
      renderFonts(allFonts);
    });
  });
}

function scanMode2(tabId) {
  const config = MODE_CONFIG[2];
  const urlPrefix = config.urlPrefix;
  const initiatorTypes = config.initiatorTypes;
  const pathFilter = config.pathFilter;
  const extensionFilter = config.extensionFilter;
  console.log('[FontCapture Popup] scanMode2 started, tabId:', tabId,
    'urlPrefix:', urlPrefix, 'initiatorTypes:', initiatorTypes,
    'pathFilter:', pathFilter, 'extensionFilter:', extensionFilter);

  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: scanBuildyouFonts,
    args: [urlPrefix, initiatorTypes, pathFilter, extensionFilter]
  }, results => {
    if (chrome.runtime.lastError) {
      console.error('[FontCapture Popup] Mode2 script injection failed:', chrome.runtime.lastError.message);
      showError(chrome.runtime.lastError.message);
      return;
    }

    const fontUrls = results?.[0]?.result?.fontUrls || [];
    console.log('[FontCapture Popup] Mode2 font URLs:', fontUrls.length);
    fontUrls.forEach(u => console.log('[FontCapture Popup]   URL:', u));

    if (fontUrls.length === 0) {
      renderFonts([]);
      return;
    }

    statusEl.textContent = '获取字体文件...';

    chrome.runtime.sendMessage({
      type: 'fetchFontUrls',
      urls: fontUrls,
      mode: 2
    }, response => {
      if (chrome.runtime.lastError) {
        console.error('[FontCapture Popup] fetchFontUrls failed:', chrome.runtime.lastError.message);
        showError(chrome.runtime.lastError.message);
        return;
      }
      const fonts = response?.fonts || [];
      console.log('[FontCapture Popup] Mode2 fonts received:', fonts.length);
      fonts.forEach(f => console.log('[FontCapture Popup]   Font:', f.name, f.format, f.sizeKB + 'KB'));
      renderFonts(fonts);
    });
  });
}

function scanMode3(tabId) {
  const config = MODE_CONFIG[3];
  const urlPrefix = config.urlPrefix;
  const initiatorTypes = config.initiatorTypes;
  const pathFilter = config.pathFilter;
  const extensionFilter = config.extensionFilter;
  console.log('[FontCapture Popup] scanMode3 started, tabId:', tabId,
    'urlPrefix:', urlPrefix, 'initiatorTypes:', initiatorTypes,
    'pathFilter:', pathFilter, 'extensionFilter:', extensionFilter);

  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: scanMedztFonts,
    args: [urlPrefix, initiatorTypes, pathFilter, extensionFilter]
  }, results => {
    if (chrome.runtime.lastError) {
      console.error('[FontCapture Popup] Mode3 script injection failed:', chrome.runtime.lastError.message);
      showError(chrome.runtime.lastError.message);
      return;
    }

    const fontUrls = results?.[0]?.result?.fontUrls || [];
    console.log('[FontCapture Popup] Mode3 font URLs:', fontUrls.length);
    fontUrls.forEach(u => console.log('[FontCapture Popup]   URL:', u));

    if (fontUrls.length === 0) {
      renderFonts([]);
      return;
    }

    statusEl.textContent = '获取字体文件...';

    chrome.runtime.sendMessage({
      type: 'fetchFontUrls',
      urls: fontUrls,
      mode: 3
    }, response => {
      if (chrome.runtime.lastError) {
        console.error('[FontCapture Popup] fetchFontUrls failed:', chrome.runtime.lastError.message);
        showError(chrome.runtime.lastError.message);
        return;
      }
      const fonts = response?.fonts || [];
      console.log('[FontCapture Popup] Mode3 fonts received:', fonts.length);
      fonts.forEach(f => console.log('[FontCapture Popup]   Font:', f.name, f.format, f.sizeKB + 'KB'));
      renderFonts(fonts);
    });
  });
}

function detectSearchToolForTab(tabId) {
  console.log('[FontCapture Popup] detectSearchToolForTab started, tabId:', tabId);

  chrome.scripting.executeScript({
    target: { tabId: tabId },
    func: detectSearchTool
  }, results => {
    if (chrome.runtime.lastError) {
      console.error('[FontCapture Popup] Search detection injection failed:', chrome.runtime.lastError.message);
      searchToolNameEl.textContent = '检测失败';
      return;
    }

    const result = results?.[0]?.result || { searchTool: '未检测到', detectionMethod: '' };
    console.log('[FontCapture Popup] Search tool detected:', result.searchTool, 'method:', result.detectionMethod);
    searchToolNameEl.textContent = result.searchTool;
    searchToolInfoEl.classList.remove('hidden');
  });
}

rescanBtn.addEventListener('click', scanCurrentPage);
scanCurrentPage();

