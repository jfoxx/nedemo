import { decorateIcons, fetchPlaceholders } from '../../scripts/aem.js';
import { div, form, input, button, span, p } from '../../scripts/dom-helpers.js';

/**
 * Creates the search icon element (chat icon for submit)
 * @returns {HTMLElement} The submit icon element
 */
function createSubmitIcon() {
	const iconSpan = span( { class: 'icon icon-chat' } );
	return iconSpan;
}

/**
 * Creates the submit button
 * @param {object} placeholders - Placeholder texts
 * @returns {HTMLElement} The submit button
 */
function createSubmitButton( placeholders ) {
	const submitLabel = placeholders.askSearchSubmitLabel || 'Submit';
	return button(
		{ class: 'ask-search__submit-btn usa-button', type: 'submit', 'aria-label': submitLabel },
		span( { class: 'ask-search__submit-text' }, submitLabel ),
		createSubmitIcon()
	);
}

/**
 * Creates the search input field
 * @param {object} placeholders - Placeholder texts
 * @returns {HTMLElement} The search input wrapper
 */
function createSearchInput( placeholders ) {
	const searchPlaceholder = placeholders.askSearchPlaceholder || 'What can we help you with?';
	return div(
		{ class: 'ask-search__input-wrapper' },
		input( {
			type: 'text',
			class: 'ask-search__input usa-input',
			name: 'ask-query',
			placeholder: searchPlaceholder,
			'aria-label': searchPlaceholder,
			autocomplete: 'off'
		} ),
		createSubmitButton( placeholders )
	);
}

/**
 * Creates suggestion prompt buttons from block content
 * @param {Array} prompts - Array of prompt text strings
 * @returns {HTMLElement} The prompts container
 */
function createPrompts( prompts ) {
	if ( !prompts || !prompts.length ) return null;

	const promptsContainer = div( { class: 'ask-search__prompts' } );

	prompts.forEach( ( promptText ) => {
		const promptBtn = p(
			{ class: 'ask-search__prompt' },
			promptText
		);
		promptBtn.addEventListener( 'click', () => {
			const inputField = promptBtn.closest( '.ask-search' ).querySelector( '.ask-search__input' );
			if ( inputField ) {
				inputField.value = promptText;
				inputField.focus();
			}
		} );
		promptsContainer.appendChild( promptBtn );
	} );

	return promptsContainer;
}


/**
 * Parses block content to extract prompts and action URL
 * @param {HTMLElement} block - The block element
 * @returns {object} Parsed content object
 */
function parseBlockContent( block ) {
	const prompts = [];
	let actionUrl = '';

	const rows = [...block.children];
	rows.forEach( ( row ) => {
		const cells = [...row.children];
		if ( cells.length >= 2 ) {
			const key = cells[0].textContent.trim().toLowerCase();
			const value = cells[1];

			if ( key === 'prompt' || key === 'prompts' ) {
				// Get all paragraphs as individual prompts
				const promptPs = value.querySelectorAll( 'p' );
				if ( promptPs.length ) {
					promptPs.forEach( ( pEl ) => {
						const text = pEl.textContent.trim();
						if ( text ) prompts.push( text );
					} );
				} else {
					const text = value.textContent.trim();
					if ( text ) prompts.push( text );
				}
			} else if ( key === 'action' || key === 'action-url' ) {
				const link = value.querySelector( 'a' );
				actionUrl = link ? link.href : value.textContent.trim();
			}
		}
	} );

	return { prompts, actionUrl };
}

/**
 * Handles form submission
 * @param {Event} e - Submit event
 * @param {string} actionUrl - Optional action URL to redirect to
 */
function handleSubmit( e, actionUrl ) {
	e.preventDefault();
	const formEl = e.target;
	const inputEl = formEl.querySelector( '.ask-search__input' );
	const query = inputEl?.value?.trim();

	if ( query ) {
		if ( actionUrl ) {
			// Redirect to action URL with query
			const url = new URL( actionUrl, window.location.origin );
			url.searchParams.set( 'q', query );
			window.location.href = url.toString();
		} else {
			// Dispatch custom event for other components to handle
			const event = new CustomEvent( 'ask-search:submit', {
				detail: { query },
				bubbles: true
			} );
			formEl.dispatchEvent( event );
		}
	}
}

/**
 * Decorates the ask-search block
 * @param {HTMLElement} block - The block element
 */
export default async function decorate( block ) {
	const placeholders = await fetchPlaceholders();
	const { prompts, actionUrl } = parseBlockContent( block );

	// Clear block content
	block.innerHTML = '';

	// Create main container
	const container = div( { class: 'ask-search__container' } );

	// Create form
	const searchForm = form(
		{ class: 'ask-search__form', role: 'search' },
		createSearchInput( placeholders )
	);

	// Add prompts if available
	const promptsEl = createPrompts( prompts );
	if ( promptsEl ) {
		container.appendChild( searchForm );
		container.appendChild( promptsEl );
	} else {
		container.appendChild( searchForm );
	}

	block.appendChild( container );

	// Attach form submit handler
	searchForm.addEventListener( 'submit', ( e ) => handleSubmit( e, actionUrl ) );

	// Decorate icons
	await decorateIcons( block );
}

