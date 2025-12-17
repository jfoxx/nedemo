/**
 * Sa11y Accessibility Checker - Sidekick Plugin
 * Injects Sa11y into the preview page for accessibility testing.
 * https://sa11y.netlify.app/
 */

const SA11Y_VERSION = '4';
const SA11Y_CSS_URL = `https://cdn.jsdelivr.net/gh/ryersondmp/sa11y@${SA11Y_VERSION}/dist/css/sa11y.min.css`;
const SA11Y_LANG_URL = `https://cdn.jsdelivr.net/gh/ryersondmp/sa11y@${SA11Y_VERSION}/dist/js/lang/en.umd.js`;
const SA11Y_JS_URL = `https://cdn.jsdelivr.net/gh/ryersondmp/sa11y@${SA11Y_VERSION}/dist/js/sa11y.umd.min.js`;

// DOM elements
const els = {
  runBtn: document.getElementById('runBtn'),
  stopBtn: document.getElementById('stopBtn'),
  statusDot: document.getElementById('statusDot'),
  statusText: document.getElementById('statusText'),
};

let sa11yActive = false;

/**
 * Update the status display
 */
function setStatus(text, state = 'idle') {
  els.statusText.textContent = text;
  els.statusDot.className = 'status-dot';
  if (state === 'ready') els.statusDot.classList.add('ready');
  if (state === 'running') els.statusDot.classList.add('running');
  if (state === 'error') els.statusDot.classList.add('error');
  console.log('[Sa11y Plugin]', text);
}

/**
 * Get the preview page window
 */
function getPreviewWindow() {
  // In sidekick palette context, we need to access the parent page
  // The sidekick loads palettes in iframes, so we need to traverse up
  try {
    // Try to get the main content window
    if (window.parent && window.parent !== window) {
      // We're in an iframe (the palette)
      // The parent might be the sidekick frame, we need the actual page
      let targetWindow = window.parent;
      
      // Keep going up if we're nested
      while (targetWindow.parent && targetWindow.parent !== targetWindow) {
        targetWindow = targetWindow.parent;
      }
      
      return targetWindow;
    }
  } catch (e) {
    console.error('[Sa11y Plugin] Error accessing parent window:', e);
  }
  return null;
}

/**
 * Check if Sa11y is already loaded in the target window
 */
function isSa11yLoaded(targetWindow) {
  try {
    return targetWindow.document.getElementById('sa11y-injected-styles') !== null;
  } catch (e) {
    return false;
  }
}

/**
 * Inject a CSS file into the target document
 */
function injectCSS(targetDoc, url, id) {
  return new Promise((resolve, reject) => {
    if (targetDoc.getElementById(id)) {
      resolve();
      return;
    }
    
    const link = targetDoc.createElement('link');
    link.id = id;
    link.rel = 'stylesheet';
    link.href = url;
    link.onload = resolve;
    link.onerror = () => reject(new Error(`Failed to load CSS: ${url}`));
    targetDoc.head.appendChild(link);
  });
}

/**
 * Inject a JavaScript file into the target document
 */
function injectScript(targetDoc, url, id) {
  return new Promise((resolve, reject) => {
    if (targetDoc.getElementById(id)) {
      resolve();
      return;
    }
    
    const script = targetDoc.createElement('script');
    script.id = id;
    script.src = url;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    targetDoc.head.appendChild(script);
  });
}

/**
 * Initialize Sa11y in the target window
 */
function initializeSa11y(targetWindow) {
  return new Promise((resolve, reject) => {
    try {
      const targetDoc = targetWindow.document;
      
      // Check if Sa11y is available
      if (!targetWindow.Sa11y || !targetWindow.Sa11yLangEn) {
        reject(new Error('Sa11y library not loaded properly'));
        return;
      }
      
      // Add language strings
      targetWindow.Sa11y.Lang.addI18n(targetWindow.Sa11yLangEn.strings);
      
      // Initialize Sa11y with configuration
      targetWindow.sa11yInstance = new targetWindow.Sa11y.Sa11y({
        // Check the main content area - adjust as needed for your site structure
        checkRoot: 'main, [role="main"], .main-content, body',
        
        // Ignore common non-content areas
        containerIgnore: '.sidekick-library, .hlx-sk, #hlx-sk, [data-aue-type], .aue-edit',
        
        // Additional options
        showGoodLinkButton: true,
        showHinPageOutline: true,
        
        // Detect the page language automatically
        detectPageLanguage: true,
        
        // Panel position - left side to avoid sidekick palette overlap
        panelPosition: 'left',
      });
      
      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Run Sa11y accessibility check
 */
async function runSa11y() {
  setStatus('Connecting to preview page...', 'running');
  
  const targetWindow = getPreviewWindow();
  if (!targetWindow) {
    setStatus('Error: Cannot access preview page', 'error');
    return;
  }
  
  try {
    const targetDoc = targetWindow.document;
    
    // Check if already loaded
    if (isSa11yLoaded(targetWindow)) {
      setStatus('Sa11y is already running on this page', 'ready');
      sa11yActive = true;
      updateButtons();
      return;
    }
    
    setStatus('Loading Sa11y styles...', 'running');
    await injectCSS(targetDoc, SA11Y_CSS_URL, 'sa11y-injected-styles');
    
    setStatus('Loading Sa11y language pack...', 'running');
    await injectScript(targetDoc, SA11Y_LANG_URL, 'sa11y-lang-script');
    
    // Small delay to ensure lang is ready
    await new Promise(r => setTimeout(r, 100));
    
    setStatus('Loading Sa11y library...', 'running');
    await injectScript(targetDoc, SA11Y_JS_URL, 'sa11y-main-script');
    
    // Wait for Sa11y to be available
    await new Promise((resolve, reject) => {
      let attempts = 0;
      const check = () => {
        attempts++;
        if (targetWindow.Sa11y && targetWindow.Sa11yLangEn) {
          resolve();
        } else if (attempts > 50) {
          reject(new Error('Timeout waiting for Sa11y to load'));
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
    
    setStatus('Initializing Sa11y...', 'running');
    await initializeSa11y(targetWindow);
    
    sa11yActive = true;
    setStatus('Sa11y is running! Check the preview page.', 'ready');
    updateButtons();
    
  } catch (error) {
    console.error('[Sa11y Plugin] Error:', error);
    setStatus(`Error: ${error.message}`, 'error');
  }
}

/**
 * Remove Sa11y from the page
 */
function removeSa11y() {
  const targetWindow = getPreviewWindow();
  if (!targetWindow) {
    setStatus('Error: Cannot access preview page', 'error');
    return;
  }
  
  try {
    const targetDoc = targetWindow.document;
    
    // Destroy Sa11y instance if it exists
    if (targetWindow.sa11yInstance) {
      try {
        targetWindow.sa11yInstance.destroy();
      } catch (e) {
        console.warn('[Sa11y Plugin] Could not destroy instance:', e);
      }
      delete targetWindow.sa11yInstance;
    }
    
    // Remove injected elements
    const elementsToRemove = [
      '#sa11y-injected-styles',
      '#sa11y-lang-script',
      '#sa11y-main-script',
      '#sa11y-container',
      '#sa11y-panel',
      '#sa11y-toast-container',
      '#sa11y-control-panel',
      '[id^="sa11y"]',
      '.sa11y-annotation',
      '.sa11y-instance',
    ];
    
    elementsToRemove.forEach(selector => {
      targetDoc.querySelectorAll(selector).forEach(el => {
        try {
          el.remove();
        } catch (e) {
          // Ignore removal errors
        }
      });
    });
    
    // Clean up any global Sa11y references
    delete targetWindow.Sa11y;
    delete targetWindow.Sa11yLangEn;
    
    sa11yActive = false;
    setStatus('Sa11y removed. Ready to scan again.', 'idle');
    updateButtons();
    
  } catch (error) {
    console.error('[Sa11y Plugin] Error removing Sa11y:', error);
    setStatus(`Error: ${error.message}`, 'error');
  }
}

/**
 * Update button visibility based on state
 */
function updateButtons() {
  if (sa11yActive) {
    els.runBtn.classList.add('hidden');
    els.stopBtn.classList.remove('hidden');
  } else {
    els.runBtn.classList.remove('hidden');
    els.stopBtn.classList.add('hidden');
  }
}

/**
 * Check initial state on load
 */
function checkInitialState() {
  const targetWindow = getPreviewWindow();
  if (targetWindow && isSa11yLoaded(targetWindow)) {
    sa11yActive = true;
    setStatus('Sa11y is running on this page', 'ready');
    updateButtons();
  }
}

// Wire up event listeners
els.runBtn.addEventListener('click', runSa11y);
els.stopBtn.addEventListener('click', removeSa11y);

// Check initial state after a brief delay
setTimeout(checkInitialState, 500);

console.log('[Sa11y Plugin] Loaded and ready');

