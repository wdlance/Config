// mode_config.js -- Mode and website mapping configuration
// Loaded in popup.html (script tag) and background.js (importScripts)

const MODE_CONFIG = {
  1: {
    name: 'CSS Scanning',
    hostPatterns: ['wrappiness.co', 'trendingcustom.com'],
    allowedFormats: ['ttf'],
    scanType: 'css'
  },
  2: {
    name: 'Network Font (BuildYou)',
    hostPatterns: ['wanderprints.com'],
    urlPrefix: 'https://assets.buildyou.io',
    allowedFormats: ['ttf', 'otf', 'woff', 'woff2'],
    scanType: 'network',
    formatFallback: 'ttf',
    initiatorTypes: ['fetch', 'xmlhttprequest'],
    pathFilter: '/fonts/',
    extensionFilter: ['ttf', 'otf', 'woff', 'woff2', 'undefined']
  },
  3: {
    name: 'Network Font (Medzt)',
    hostPatterns: ['macorner.co'],
    urlPrefix: 'https://assets.medzt.com/',
    allowedFormats: ['ttf', 'otf', 'woff', 'woff2'],
    scanType: 'network',
    formatFallback: 'otf',
    initiatorTypes: ['fetch', 'xmlhttprequest'],
    pathFilter: '/fonts/',
    extensionFilter: ['ttf', 'otf', 'woff', 'woff2', 'undefined']
  }
};

function determineMode(url) {
  try {
    const hostname = new URL(url).hostname;
    for (const [id, cfg] of Object.entries(MODE_CONFIG)) {
      if (cfg.hostPatterns.some(p => hostname === p || hostname.endsWith('.' + p))) {
        return parseInt(id);
      }
    }
  } catch (e) {
    console.error('[FontCapture] determineMode error:', e.message, e.stack);
  }
  return 1;
}