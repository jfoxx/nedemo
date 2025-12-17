/**
 * Horizontal Tabs Layout Component for AEM Adaptive Forms
 * Renders panel children as clickable tabs
 */

export class HorizontalTabsLayout {
	constructor() {
		this.activeIndex = 0;
	}

	getSteps( panel ) {
		return [...panel.children].filter( ( step ) => step.tagName.toLowerCase() === 'fieldset' );
	}

	createTabList( children, panel ) {
		const tabList = document.createElement( 'div' );
		tabList.className = 'tabs-list';
		tabList.setAttribute( 'role', 'tablist' );

		children.forEach( ( child, index ) => {
			const tab = document.createElement( 'button' );
			tab.className = 'tab-item';
			tab.setAttribute( 'role', 'tab' );
			tab.setAttribute( 'aria-selected', index === 0 ? 'true' : 'false' );
			tab.setAttribute( 'aria-controls', child.id );
			tab.dataset.index = index;

			// Create step number indicator
			const stepNumber = document.createElement( 'span' );
			stepNumber.className = 'tab-step-number';
			stepNumber.textContent = index + 1;
			stepNumber.setAttribute( 'aria-hidden', 'true' );

			// Create label span
			const labelSpan = document.createElement( 'span' );
			labelSpan.className = 'tab-label';

			// Get label from legend
			const legend = child.querySelector( 'legend' );
			labelSpan.textContent = legend?.textContent || `Step ${index + 1}`;

			// Hide legend since we're showing it in the tab
			if ( legend ) {
				legend.style.display = 'none';
			}

			tab.appendChild( stepNumber );
			tab.appendChild( labelSpan );
			tab.addEventListener( 'click', () => this.switchTab( panel, index ) );

			if ( index === 0 ) {
				tab.classList.add( 'tab-active' );
			}

			tabList.appendChild( tab );
		} );

		return tabList;
	}

	switchTab( panel, index ) {
		const steps = this.getSteps( panel );
		const tabs = panel.querySelectorAll( '.tab-item' );

		// Update tab states
		tabs.forEach( ( tab, i ) => {
			tab.classList.toggle( 'tab-active', i === index );
			tab.setAttribute( 'aria-selected', i === index ? 'true' : 'false' );
		} );

		// Update panel visibility
		steps.forEach( ( step, i ) => {
			step.classList.toggle( 'tab-panel-active', i === index );
			step.setAttribute( 'aria-hidden', i !== index );
		} );

		this.activeIndex = index;

		// Dispatch custom event
		const event = new CustomEvent( 'tabs:change', {
			detail: { activeIndex: index, activePanel: steps[index] },
			bubbles: true,
		} );
		panel.dispatchEvent( event );
	}

	static handleMutation( panel, mutationsList ) {
		mutationsList.forEach( ( mutation ) => {
			const { type, target, attributeName } = mutation;
			if ( type === 'attributes' && attributeName === 'data-visible' ) {
				const element = mutation.target;
				const tabItem = panel.querySelector( `.tab-item[data-index="${element.dataset.index}"]` );
				if ( tabItem ) {
					tabItem.style.display = element.dataset.visible === 'false' ? 'none' : '';
				}
			} else if ( type === 'attributes' && attributeName === 'data-active' && target.dataset.active === 'true' ) {
				const index = parseInt( target.dataset.index, 10 );
				if ( !Number.isNaN( index ) ) {
					const tabs = panel.querySelectorAll( '.tab-item' );
					const steps = [...panel.children].filter( ( s ) => s.tagName.toLowerCase() === 'fieldset' );

					tabs.forEach( ( tab, i ) => {
						tab.classList.toggle( 'tab-active', i === index );
						tab.setAttribute( 'aria-selected', i === index ? 'true' : 'false' );
					} );

					steps.forEach( ( step, i ) => {
						step.classList.toggle( 'tab-panel-active', i === index );
					} );
				}
			}
		} );
	}

	static attachMutationObserver( panel ) {
		const children = panel.querySelectorAll( ':scope > .panel-wrapper' );
		const config = { attributes: true, subtree: false };
		const observer = new window.MutationObserver( ( mutationsList ) => {
			HorizontalTabsLayout.handleMutation( panel, mutationsList );
		} );
		children.forEach( ( targetNode ) => {
			observer.observe( targetNode, config );
		} );
	}

	applyLayout( panel ) {
		const children = this.getSteps( panel );

		if ( children.length === 0 ) {
			return;
		}

		// Assign indices to steps
		children.forEach( ( child, index ) => {
			child.dataset.index = index;
			child.setAttribute( 'role', 'tabpanel' );
			child.classList.add( 'tab-panel' );
			if ( index === 0 ) {
				child.classList.add( 'tab-panel-active' );
			}
			child.setAttribute( 'aria-hidden', index !== 0 );
		} );

		// Create and insert tab list
		const tabList = this.createTabList( children, panel );
		panel.insertBefore( tabList, children[0] );

		// Add class to panel
		panel.classList.add( 'horizontal-tabs' );

		// Attach mutation observer for dynamic changes
		HorizontalTabsLayout.attachMutationObserver( panel );
	}
}

const layout = new HorizontalTabsLayout();

export default function horizontalTabsLayout( panel ) {
	layout.applyLayout( panel );
	return panel;
}

export const switchTab = layout.switchTab.bind( layout );

