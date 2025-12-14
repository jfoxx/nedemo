import { domEl } from '../../scripts/dom-helpers.js';

/**
 * Section Tabs Block
 *
 * This block creates interactive tabs that show/hide sections based on the tabsection property.
 * Each row in the block contains:
 * - Column 1: Tab label (with optional icon)
 * - Column 2: The tabsection identifier to show when this tab is clicked
 */
export default function decorate( block ) {
	const tabsData = [];

	// Parse the block rows to get tab labels and their associated section identifiers
	[...block.children].forEach( ( row ) => {
		const cols = [...row.children];
		if ( cols.length >= 2 ) {
			const labelCell = cols[0];
			const sectionIdCell = cols[1];

			// Get the tab label content (may include icons)
			const label = labelCell.innerHTML.trim();
			const labelText = labelCell.textContent.trim();

			// Get the section identifier
			const sectionId = sectionIdCell.textContent.trim().toLowerCase();

			tabsData.push( { label, labelText, sectionId } );
		}
	} );

	if ( tabsData.length === 0 ) return;

	// Create the tabs container
	const tabsContainer = domEl( 'div', { class: 'section-tabs__container' } );

	// Create the tab list with proper ARIA attributes
	const tabList = domEl( 'ul', {
		class: 'section-tabs__list',
		role: 'tablist',
	} );

	tabsData.forEach( ( tab, index ) => {
		const isFirst = index === 0;
		const tabId = `section-tab-${tab.sectionId}`;
		const panelId = `section-panel-${tab.sectionId}`;

		// Create the tab button
		const tabButton = domEl( 'button', {
			class: `section-tabs__button ${isFirst ? 'section-tabs__button--active' : ''}`,
			role: 'tab',
			'aria-selected': isFirst ? 'true' : 'false',
			'aria-controls': panelId,
			id: tabId,
			'data-tabsection': tab.sectionId,
		} );

		// Insert the label HTML (preserves icons)
		tabButton.innerHTML = tab.label;

		// Add down arrow indicator for active tab
		const arrow = domEl( 'span', { class: 'section-tabs__arrow' } );
		tabButton.appendChild( arrow );

		// Create list item wrapper
		const tabItem = domEl( 'li', { class: 'section-tabs__item', role: 'presentation' } );
		tabItem.appendChild( tabButton );

		tabList.appendChild( tabItem );

		// Add click handler
		tabButton.addEventListener( 'click', () => {
			activateTab( tab.sectionId, block );
		} );
	} );

	tabsContainer.appendChild( tabList );

	// Clear the block and add the new tabs structure
	block.textContent = '';
	block.appendChild( tabsContainer );

	// Initialize - show only the first tab's content
	if ( tabsData.length > 0 ) {
		// Delay to ensure sections are loaded
		requestAnimationFrame( () => {
			activateTab( tabsData[0].sectionId, block );
		} );
	}
}

/**
 * Activates a tab and shows its corresponding section
 */
function activateTab( sectionId, block ) {
	const main = document.querySelector( 'main' );
	if ( !main ) return;

	// Update tab button states
	const allButtons = block.querySelectorAll( '.section-tabs__button' );
	allButtons.forEach( ( btn ) => {
		const isActive = btn.dataset.tabsection === sectionId;
		btn.classList.toggle( 'section-tabs__button--active', isActive );
		btn.setAttribute( 'aria-selected', isActive ? 'true' : 'false' );
	} );

	// Get all sections with tabsection data
	const allSections = main.querySelectorAll( '.section[data-tabsection]' );
	const sectionsMap = new Map();

	allSections.forEach( ( section ) => {
		const tabsection = section.dataset.tabsection?.toLowerCase();
		if ( tabsection ) {
			if ( !sectionsMap.has( tabsection ) ) {
				sectionsMap.set( tabsection, [] );
			}
			sectionsMap.get( tabsection ).push( section );
		}
	} );

	// Hide all tabbed sections, show the active one
	sectionsMap.forEach( ( sections, key ) => {
		sections.forEach( ( section ) => {
			if ( key === sectionId ) {
				section.style.display = '';
				section.setAttribute( 'aria-hidden', 'false' );
			} else {
				section.style.display = 'none';
				section.setAttribute( 'aria-hidden', 'true' );
			}
		} );
	} );
}

