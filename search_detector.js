// search_detector.js -- Search engine tool detection module (DOM-based detection)
// Loaded in popup.html (script tag)
// detectSearchTool is injected into page via chrome.scripting.executeScript
// IMPORTANT: All constants (SEARCH_TOOL_RULES) must be defined INSIDE the function because
// chrome.scripting.executeScript only serializes the function body, not module-level vars
// Detection method: Check DOM elements (script/link src/href, inline script content,
// window global variables) instead of Performance API. Works immediately on page load,
// no need for user to perform a search first.
// Priority: Level A (script/link src) > Level B (inline content) > Level C (window vars) > Level D (Shopify native)

function detectSearchTool() {
  const SEARCH_TOOL_RULES = [
    { name: 'Searchanise Search & Filter', srcPatterns: ['searchanise', 'searchserverapi'], contentPatterns: ['Searchanise'], globalVars: ['Searchanise'] },
    { name: 'Boost Product Filter & Search', srcPatterns: ['boostcommerce', 'mybcapps', 'boost-pfs'], contentPatterns: ['BoostPFS'], globalVars: ['BoostPFS'] },
    { name: 'Algolia AI Search & Discovery', srcPatterns: ['algolia', 'algoliasearch'], contentPatterns: ['algoliasearch', 'instantsearch'], globalVars: ['algoliasearch'] },
    { name: 'Fast Simon (InstantSearch+)', srcPatterns: ['fastsimon', 'instantsearchplus'], contentPatterns: ['FastSimon'], globalVars: ['FastSimon'] },
    { name: 'Klevu', srcPatterns: ['klevu', 'ksearchnet'], contentPatterns: ['klevu_js'], globalVars: ['klevu'] },
    { name: 'Doofinder Search & Discovery', srcPatterns: ['doofinder'], contentPatterns: ['doofinder'], globalVars: ['doofinder'] },
    { name: 'Searchspring', srcPatterns: ['searchspring'], contentPatterns: ['SearchSpring'], globalVars: ['SearchSpring'] },
    { name: 'Nosto / Nosto AI Search & Discovery', srcPatterns: ['nosto'], contentPatterns: ['nosto'], globalVars: ['nosto'] },
    { name: 'Findify Search & Merchandise', srcPatterns: ['findify'], contentPatterns: ['Findify'], globalVars: ['Findify'] },
    { name: 'Sparq Product Filter & Search', srcPatterns: ['sparq', 'searchatap'], contentPatterns: ['Sparq'], globalVars: [] },
    { name: 'Wizzy AI Search & Filter', srcPatterns: ['wizzy'], contentPatterns: ['Wizzy'], globalVars: ['Wizzy'] },
    { name: 'Search & Discovery - AI / Expertrec', srcPatterns: ['expertrec'], contentPatterns: ['expertrec'], globalVars: [] },
    { name: 'Okas Live Search & Filter', srcPatterns: ['okasconcepts'], contentPatterns: ['Okas'], globalVars: [] },
    { name: 'Omega Instant Search', srcPatterns: ['omegacommerce', 'mirasvit'], contentPatterns: ['OmegaInstantSearch'], globalVars: [] }
  ];

  console.log('[FontCapture SearchDetect] Starting DOM-based detection');
  let detectedTool = null;
  let detectionMethod = '';

  try {
    // ===== Level A: Script/Link src/href matching (highest priority) =====
    const scripts = document.querySelectorAll('script[src]');
    const links = document.querySelectorAll('link[href]');

    console.log('[FontCapture SearchDetect] Level A: checking', scripts.length, 'script tags and', links.length, 'link tags');

    for (const script of scripts) {
      const src = script.src.toLowerCase();
      for (const rule of SEARCH_TOOL_RULES) {
        for (const pattern of rule.srcPatterns) {
          if (src.includes(pattern)) {
            console.log('[FontCapture SearchDetect] Level A matched: script src', src, 'contains pattern', pattern, '→ tool:', rule.name);
            detectedTool = rule.name;
            detectionMethod = 'Level A script src: ' + src + ' contains ' + pattern;
            break;
          }
        }
        if (detectedTool) break;
      }
      if (detectedTool) break;
    }

    if (!detectedTool) {
      for (const link of links) {
        const href = link.href.toLowerCase();
        for (const rule of SEARCH_TOOL_RULES) {
          for (const pattern of rule.srcPatterns) {
            if (href.includes(pattern)) {
              console.log('[FontCapture SearchDetect] Level A matched: link href', href, 'contains pattern', pattern, '→ tool:', rule.name);
              detectedTool = rule.name;
              detectionMethod = 'Level A link href: ' + href + ' contains ' + pattern;
              break;
            }
          }
          if (detectedTool) break;
        }
        if (detectedTool) break;
      }
    }

    // ===== Level B: Inline script content matching =====
    if (!detectedTool) {
      const inlineScripts = document.querySelectorAll('script:not([src])');
      console.log('[FontCapture SearchDetect] Level A no match, trying Level B: checking', inlineScripts.length, 'inline scripts');

      for (const script of inlineScripts) {
        const content = script.textContent.toLowerCase();
        for (const rule of SEARCH_TOOL_RULES) {
          for (const pattern of rule.contentPatterns) {
            if (content.includes(pattern.toLowerCase())) {
              console.log('[FontCapture SearchDetect] Level B matched: inline script contains', pattern, '→ tool:', rule.name);
              detectedTool = rule.name;
              detectionMethod = 'Level B inline content: contains ' + pattern;
              break;
            }
          }
          if (detectedTool) break;
        }
        if (detectedTool) break;
      }
    }

    // ===== Level C: Window global variable matching =====
    if (!detectedTool) {
      console.log('[FontCapture SearchDetect] Level B no match, trying Level C: checking window global vars');

      for (const rule of SEARCH_TOOL_RULES) {
        if (rule.globalVars.length === 0) continue;
        for (const varName of rule.globalVars) {
          if (window[varName] !== undefined) {
            console.log('[FontCapture SearchDetect] Level C matched: window.' + varName + ' exists → tool:', rule.name);
            detectedTool = rule.name;
            detectionMethod = 'Level C global var: window.' + varName;
            break;
          }
        }
        if (detectedTool) break;
      }
    }

    // ===== Level D: Shopify native search detection =====
    if (!detectedTool) {
      console.log('[FontCapture SearchDetect] Level C no match, trying Level D: Shopify native');

      const hasShopify = window.Shopify !== undefined;
      const hasSearchForm = document.querySelectorAll('form[action*="/search"]').length > 0;
      console.log('[FontCapture SearchDetect] Level D: window.Shopify exists:', hasShopify, 'search form exists:', hasSearchForm);

      if (hasShopify && hasSearchForm) {
        // Confirmed Shopify site with search form, and no third-party search tool detected above
        detectedTool = 'Shopify 官方 Search & Discovery';
        detectionMethod = 'Level D: window.Shopify + form[action="/search"]';
      }
    }
  } catch (e) {
    console.error('[FontCapture SearchDetect] Detection exception:', e.message, e.stack);
  }

  if (!detectedTool) {
    detectedTool = '未检测到';
    detectionMethod = 'none';
  }

  console.log('[FontCapture SearchDetect] Final result:', detectedTool, 'method:', detectionMethod);
  return { searchTool: detectedTool, detectionMethod: detectionMethod };
}