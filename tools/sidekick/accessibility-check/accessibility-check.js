/**
 * Accessibility Check - Sidekick Plugin
 * Injects Sa11y into the preview page for accessibility testing.
 * https://sa11y.netlify.app/
 */

const SA11Y_VERSION = '4';
const SA11Y_CSS_URL = `https://cdn.jsdelivr.net/gh/ryersondmp/sa11y@${SA11Y_VERSION}/dist/css/sa11y.min.css`;
const SA11Y_LANG_URL = `https://cdn.jsdelivr.net/gh/ryersondmp/sa11y@${SA11Y_VERSION}/dist/js/lang/en.umd.js`;
const SA11Y_JS_URL = `https://cdn.jsdelivr.net/gh/ryersondmp/sa11y@${SA11Y_VERSION}/dist/js/sa11y.umd.min.js`;

const runBtn = document.getElementById( 'runBtn' );
const stopBtn = document.getElementById( 'stopBtn' );
const statusEl = document.getElementById( 'status' );

let sa11yActive = false;

function setStatus( text ) {
	statusEl.textContent = text;
}

function getPreviewWindow() {
	try {
		if ( window.parent && window.parent !== window ) {
			let targetWindow = window.parent;
			while ( targetWindow.parent && targetWindow.parent !== targetWindow ) {
				targetWindow = targetWindow.parent;
			}
			return targetWindow;
		}
	} catch ( e ) {
		console.error( '[Accessibility Check] Error accessing parent window:', e );
	}
	return null;
}

function isSa11yLoaded( targetWindow ) {
	try {
		return targetWindow.document.getElementById( 'sa11y-injected-styles' ) !== null;
	} catch ( e ) {
		return false;
	}
}

function injectCSS( targetDoc, url, id ) {
	return new Promise( ( resolve, reject ) => {
		if ( targetDoc.getElementById( id ) ) {
			resolve();
			return;
		}
		const link = targetDoc.createElement( 'link' );
		link.id = id;
		link.rel = 'stylesheet';
		link.href = url;
		link.onload = resolve;
		link.onerror = () => reject( new Error( `Failed to load CSS: ${url}` ) );
		targetDoc.head.appendChild( link );
	} );
}

function injectScript( targetDoc, url, id ) {
	return new Promise( ( resolve, reject ) => {
		if ( targetDoc.getElementById( id ) ) {
			resolve();
			return;
		}
		const script = targetDoc.createElement( 'script' );
		script.id = id;
		script.src = url;
		script.onload = resolve;
		script.onerror = () => reject( new Error( `Failed to load script: ${url}` ) );
		targetDoc.head.appendChild( script );
	} );
}

function initializeSa11y( targetWindow ) {
	return new Promise( ( resolve, reject ) => {
		try {
			if ( !targetWindow.Sa11y || !targetWindow.Sa11yLangEn ) {
				reject( new Error( 'Sa11y library not loaded' ) );
				return;
			}
      
			targetWindow.Sa11y.Lang.addI18n( targetWindow.Sa11yLangEn.strings );
      
			targetWindow.sa11yInstance = new targetWindow.Sa11y.Sa11y( {
				checkRoot: 'main, [role="main"], .main-content, body',
				containerIgnore: '.sidekick-library, .hlx-sk, #hlx-sk, [data-aue-type], .aue-edit',
				showGoodLinkButton: true,
				showHinPageOutline: true,
				detectPageLanguage: true,
				panelPosition: 'left',
			} );
      
			resolve();
		} catch ( e ) {
			reject( e );
		}
	} );
}

async function runSa11y() {
	setStatus( 'Loading...' );
  
	const targetWindow = getPreviewWindow();
	if ( !targetWindow ) {
		setStatus( 'Error: Cannot access page' );
		return;
	}
  
	try {
		const targetDoc = targetWindow.document;
    
		if ( isSa11yLoaded( targetWindow ) ) {
			setStatus( 'Already running' );
			sa11yActive = true;
			updateButtons();
			return;
		}
    
		await injectCSS( targetDoc, SA11Y_CSS_URL, 'sa11y-injected-styles' );
		await injectScript( targetDoc, SA11Y_LANG_URL, 'sa11y-lang-script' );
		await new Promise( r => setTimeout( r, 100 ) );
		await injectScript( targetDoc, SA11Y_JS_URL, 'sa11y-main-script' );
    
		await new Promise( ( resolve, reject ) => {
			let attempts = 0;
			const check = () => {
				attempts++;
				if ( targetWindow.Sa11y && targetWindow.Sa11yLangEn ) {
					resolve();
				} else if ( attempts > 50 ) {
					reject( new Error( 'Timeout' ) );
				} else {
					setTimeout( check, 100 );
				}
			};
			check();
		} );
    
		await initializeSa11y( targetWindow );
    
		sa11yActive = true;
		setStatus( 'Active - check page' );
		updateButtons();
    
	} catch ( error ) {
		console.error( '[Accessibility Check] Error:', error );
		setStatus( 'Error: ' + error.message );
	}
}

function removeSa11y() {
	const targetWindow = getPreviewWindow();
	if ( !targetWindow ) {
		setStatus( 'Error: Cannot access page' );
		return;
	}
  
	try {
		const targetDoc = targetWindow.document;
    
		if ( targetWindow.sa11yInstance ) {
		try {
			targetWindow.sa11yInstance.destroy();
		} catch ( e ) {
			// Ignore destroy errors - instance may already be removed
		}
			delete targetWindow.sa11yInstance;
		}
    
		const elementsToRemove = [
			'#sa11y-injected-styles',
			'#sa11y-lang-script',
			'#sa11y-main-script',
			'[id^="sa11y"]',
			'.sa11y-annotation',
			'.sa11y-instance',
		];
    
	elementsToRemove.forEach( selector => {
		targetDoc.querySelectorAll( selector ).forEach( el => {
			try {
				el.remove();
			} catch ( e ) {
				// Ignore removal errors - element may already be detached
			}
		} );
	} );
    
		delete targetWindow.Sa11y;
		delete targetWindow.Sa11yLangEn;
    
		sa11yActive = false;
		setStatus( '' );
		updateButtons();
    
	} catch ( error ) {
		setStatus( 'Error: ' + error.message );
	}
}

function updateButtons() {
	if ( sa11yActive ) {
		runBtn.classList.add( 'hidden' );
		stopBtn.classList.remove( 'hidden' );
	} else {
		runBtn.classList.remove( 'hidden' );
		stopBtn.classList.add( 'hidden' );
	}
}

function checkInitialState() {
	const targetWindow = getPreviewWindow();
	if ( targetWindow && isSa11yLoaded( targetWindow ) ) {
		sa11yActive = true;
		setStatus( 'Active' );
		updateButtons();
	}
}

runBtn.addEventListener( 'click', runSa11y );
stopBtn.addEventListener( 'click', removeSa11y );

setTimeout( checkInitialState, 300 );
