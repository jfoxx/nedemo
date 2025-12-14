import { domEl } from '../../scripts/dom-helpers.js';

/**
 * Link Tabs Block
 *
 * Creates a vertical tab layout with:
 * - Tab labels stacked vertically on the left (desktop)
 * - Dropdown menu on mobile for better UX
 * - Content panel on the right (formatted in 2 columns)
 * - First tab is active by default
 *
 * Each row in the block contains:
 * - Column 1: Tab label
 * - Column 2: Tab content
 */
export default function decorate( block ) {
	const rows = [...block.children];
	if ( rows.length === 0 ) return;

	// Create the main container with vertical layout
	const container = domEl( 'div', { class: 'link-tabs__container' } );

	// Create mobile dropdown (visible on mobile only)
	const mobileDropdown = domEl( 'div', { class: 'link-tabs__mobile-dropdown' } );
	const dropdownButton = domEl( 'button', {
		class: 'link-tabs__dropdown-button',
		'aria-expanded': 'false',
		'aria-haspopup': 'listbox',
	} );
	const dropdownMenu = domEl( 'ul', {
		class: 'link-tabs__dropdown-menu',
		role: 'listbox',
	} );

	// Create tab list (left side - desktop only)
	const tabList = domEl( 'ul', {
		class: 'link-tabs__list',
		role: 'tablist',
		'aria-orientation': 'vertical',
	} );

	// Create content area (right side)
	const contentArea = domEl( 'div', { class: 'link-tabs__content' } );

	let firstLabel = '';

	rows.forEach( ( row, index ) => {
		const cols = [...row.children];
		if ( cols.length < 2 ) return;

		const labelCell = cols[0];
		const contentCell = cols[1];

		const isFirst = index === 0;
		const tabId = `link-tab-${index}`;
		const panelId = `link-panel-${index}`;

		// Get plain text for dropdown
		const labelText = labelCell.textContent.trim();
		if ( isFirst ) firstLabel = labelText;

		// Create tab button (desktop)
		const tabButton = domEl( 'button', {
			class: `link-tabs__tab ${isFirst ? 'link-tabs__tab--active' : ''}`,
			role: 'tab',
			'aria-selected': isFirst ? 'true' : 'false',
			'aria-controls': panelId,
			id: tabId,
			'data-tab-index': index.toString(),
		} );
		tabButton.innerHTML = labelCell.innerHTML;

		// Create list item wrapper (desktop)
		const tabItem = domEl( 'li', { class: 'link-tabs__item', role: 'presentation' } );
		tabItem.appendChild( tabButton );
		tabList.appendChild( tabItem );

		// Create dropdown menu item (mobile)
		const dropdownItem = domEl( 'li', {
			class: `link-tabs__dropdown-item ${isFirst ? 'link-tabs__dropdown-item--active' : ''}`,
			role: 'option',
			'aria-selected': isFirst ? 'true' : 'false',
			'data-tab-index': index.toString(),
		} );
		dropdownItem.textContent = labelText;
		dropdownMenu.appendChild( dropdownItem );

		// Create content panel
		const panel = domEl( 'div', {
			class: `link-tabs__panel ${isFirst ? 'link-tabs__panel--active' : ''}`,
			role: 'tabpanel',
			id: panelId,
			'aria-labelledby': tabId,
		} );

		// Move content to panel and format into columns
		const contentWrapper = domEl( 'div', { class: 'link-tabs__panel-content' } );
		contentWrapper.innerHTML = contentCell.innerHTML;
		panel.appendChild( contentWrapper );

		contentArea.appendChild( panel );

		// Add click handler for desktop tabs
		tabButton.addEventListener( 'click', () => {
			activateTab( index, block );
		} );

		// Add click handler for mobile dropdown items
		dropdownItem.addEventListener( 'click', () => {
			activateTab( index, block );
			closeDropdown( block );
		} );
	} );

	// Set initial dropdown button text
	dropdownButton.innerHTML = `
    <span class="link-tabs__dropdown-text">${firstLabel}</span>
    <span class="link-tabs__dropdown-icon" aria-hidden="true"></span>
  `;

	// Toggle dropdown on button click
	dropdownButton.addEventListener( 'click', () => {
		toggleDropdown( block );
	} );

	// Close dropdown when clicking outside
	document.addEventListener( 'click', ( e ) => {
		if ( !mobileDropdown.contains( e.target ) ) {
			closeDropdown( block );
		}
	} );

	mobileDropdown.appendChild( dropdownButton );
	mobileDropdown.appendChild( dropdownMenu );

	container.appendChild( mobileDropdown );
	container.appendChild( tabList );
	container.appendChild( contentArea );

	// Clear block and add new structure
	block.textContent = '';
	block.appendChild( container );
}

/**
 * Activates a tab and shows its content panel
 */
function activateTab( tabIndex, block ) {
	// Update desktop tab button states
	const allTabs = block.querySelectorAll( '.link-tabs__tab' );
	allTabs.forEach( ( tab, idx ) => {
		const isActive = idx === tabIndex;
		tab.classList.toggle( 'link-tabs__tab--active', isActive );
		tab.setAttribute( 'aria-selected', isActive ? 'true' : 'false' );
	} );

	// Update mobile dropdown items
	const allDropdownItems = block.querySelectorAll( '.link-tabs__dropdown-item' );
	allDropdownItems.forEach( ( item, idx ) => {
		const isActive = idx === tabIndex;
		item.classList.toggle( 'link-tabs__dropdown-item--active', isActive );
		item.setAttribute( 'aria-selected', isActive ? 'true' : 'false' );

		// Update dropdown button text
		if ( isActive ) {
			const dropdownText = block.querySelector( '.link-tabs__dropdown-text' );
			if ( dropdownText ) {
				dropdownText.textContent = item.textContent;
			}
		}
	} );

	// Update panel visibility
	const allPanels = block.querySelectorAll( '.link-tabs__panel' );
	allPanels.forEach( ( panel, idx ) => {
		const isActive = idx === tabIndex;
		panel.classList.toggle( 'link-tabs__panel--active', isActive );
	} );
}

/**
 * Toggle dropdown open/closed
 */
function toggleDropdown( block ) {
	const dropdown = block.querySelector( '.link-tabs__mobile-dropdown' );
	const button = block.querySelector( '.link-tabs__dropdown-button' );
	const isOpen = dropdown.classList.toggle( 'link-tabs__mobile-dropdown--open' );
	button.setAttribute( 'aria-expanded', isOpen ? 'true' : 'false' );
}

/**
 * Close dropdown
 */
function closeDropdown( block ) {
	const dropdown = block.querySelector( '.link-tabs__mobile-dropdown' );
	const button = block.querySelector( '.link-tabs__dropdown-button' );
	dropdown.classList.remove( 'link-tabs__mobile-dropdown--open' );
	button.setAttribute( 'aria-expanded', 'false' );
}
