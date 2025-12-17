import { createButton } from '../../util.js';

export class WizardLayout {
	inputFields = 'input,textarea,select';

	constructor( includePrevBtn = true, includeNextBtn = true ) {
		this.includePrevBtn = includePrevBtn;
		this.includeNextBtn = includeNextBtn;
	}

	// eslint-disable-next-line class-methods-use-this
	getSteps( panel ) {
		return [...panel.children].filter( ( step ) => step.tagName.toLowerCase() === 'fieldset' );
	}

	/**
	 * Get visible steps only (excluding hidden ones)
	 */
	// eslint-disable-next-line class-methods-use-this
	getVisibleSteps( panel ) {
		return [...panel.children].filter(
			( step ) => step.tagName.toLowerCase() === 'fieldset' && step.dataset.visible !== 'false',
		);
	}

	assignIndexToSteps( panel ) {
		const steps = this.getSteps( panel );
		panel.style.setProperty( '--wizard-step-count', steps.length );
		steps.forEach( ( step, index ) => {
			step.dataset.index = index;
			step.style.setProperty( '--wizard-step-index', index );
		} );
	}

	// eslint-disable-next-line class-methods-use-this
	getEligibleSibling( current, forward = true ) {
		const direction = forward ? 'nextElementSibling' : 'previousElementSibling';

		for ( let sibling = current[direction]; sibling; sibling = sibling[direction] ) {
			if ( sibling.dataset.visible !== 'false' && sibling.tagName === 'FIELDSET' ) {
				return sibling;
			}
		}
		return null;
	}

	/**
	 * Check if current step is valid (all visible required fields are filled)
	 * This doesn't show validation messages, just checks validity
	 */
	isCurrentStepValid( container ) {
		const fieldElements = [...container.querySelectorAll( this.inputFields )];
		return fieldElements.every( ( fieldElement ) => {
			const isHidden = this.isElementOrAncestorHidden( fieldElement, container );
			return isHidden || fieldElement.checkValidity();
		} );
	}

	/**
	 * Update the enabled/disabled state of wizard navigation buttons
	 */
	updateButtonStates( panel ) {
		const current = panel.querySelector( '.current-wizard-step' );
		if ( !current ) return;

		const prevBtn = panel.querySelector( '.wizard-button-prev' );
		const nextBtn = panel.querySelector( '.wizard-button-next' );

		// Check if we can go back (is there a previous visible step?)
		const hasPrevStep = this.getEligibleSibling( current, false ) !== null;

		// Check if we can go forward (is there a next visible step?)
		const hasNextStep = this.getEligibleSibling( current, true ) !== null;

		// Check if current step is valid
		const isValid = this.isCurrentStepValid( current );

		// Update Back button
		if ( prevBtn ) {
			prevBtn.disabled = !hasPrevStep;
			prevBtn.style.visibility = hasPrevStep ? 'visible' : 'hidden';
		}

		// Update Next button - disabled if no next step OR if current step is invalid
		if ( nextBtn ) {
			if ( !hasNextStep ) {
				// Last step - hide the Next button entirely
				nextBtn.style.display = 'none';
			} else {
				nextBtn.style.display = '';
				nextBtn.disabled = !isValid;
			}
		}
	}

	/**
	 * Check if an element or any of its ancestors is hidden (data-visible="false")
	 * @param {Element} element - The element to check
	 * @param {Element} stopAt - Stop checking at this ancestor (exclusive)
	 * @returns {boolean} true if element or any ancestor is hidden
	 */
	// eslint-disable-next-line class-methods-use-this
	isElementOrAncestorHidden( element, stopAt ) {
		let current = element;
		while ( current && current !== stopAt ) {
			if ( current.dataset?.visible === 'false' ) {
				return true;
			}
			current = current.parentElement;
		}
		return false;
	}

	/**
 * @param {FormElement | Fieldset} container
 * @returns return false, if there are invalid fields
 */
	validateContainer( container ) {
		const fieldElements = [...container.querySelectorAll( this.inputFields )];
		const isValid = fieldElements.reduce( ( valid, fieldElement ) => {
			// Check if the field or any parent panel is hidden
			const isHidden = this.isElementOrAncestorHidden( fieldElement, container );
			let isFieldValid = true;
			if ( !isHidden ) {
				isFieldValid = fieldElement.checkValidity();
			}
			return valid && isFieldValid;
		}, true );

		if ( !isValid ) {
			container.querySelector( ':invalid' )?.focus();
		}
		return isValid;
	}

	navigate( panel, forward = true ) {
		const current = panel.querySelector( '.current-wizard-step' );
		const currentMenuItem = panel.querySelector( '.wizard-menu-active-item' );

		let valid = true;
		if ( forward ) {
			valid = this.validateContainer( current );
		}
		const navigateTo = valid ? this.getEligibleSibling( current, forward ) : current;

		if ( navigateTo && current !== navigateTo ) {
			current.classList.remove( 'current-wizard-step' );
			navigateTo.classList.add( 'current-wizard-step' );
			// add/remove active class from menu item
			const navigateToMenuItem = panel.querySelector( `li[data-index="${navigateTo.dataset.index}"]` );
			currentMenuItem.classList.remove( 'wizard-menu-active-item' );
			navigateToMenuItem.classList.add( 'wizard-menu-active-item' );
			const event = new CustomEvent( 'wizard:navigate', {
				detail: {
					prevStep: { id: current.id, index: +current.dataset.index },
					currStep: { id: navigateTo.id, index: +navigateTo.dataset.index },
				},
				bubbles: false,
			} );
			panel.dispatchEvent( event );
		}

		// Update button states after navigation
		this.updateButtonStates( panel );
	}

	static handleMutation( panel, mutationsList ) {
		mutationsList.forEach( ( mutation ) => {
			const { type, target, attributeName } = mutation;
			const menuItems = panel.querySelector( '.wizard-menu-items' );
			// Check if the mutation is a change in attributes(data-visible)
			if ( type === 'attributes' && attributeName === 'data-visible' ) {
				const element = mutation.target;
				const menuItem = panel.querySelector( `li[data-index="${element.dataset.index}"]` );
				menuItem.dataset.visible = element.dataset.visible;
			} else if ( type === 'attributes' && attributeName === 'data-active' ) {
				// for active panel
				panel.querySelector( '.current-wizard-step' )?.classList.remove( 'current-wizard-step' );
				const activePanel = panel.querySelector( `#${target?.id}` );
				activePanel?.classList.add( 'current-wizard-step' );
				// for active menu item
				panel.querySelector( '.wizard-menu-active-item' )?.classList.remove( 'wizard-menu-active-item' );
				menuItems.querySelector( `[data-index="${activePanel.dataset.index}"]` )?.classList.add( 'wizard-menu-active-item' );
				target.querySelector( '[data-active="true"]' )?.focus();
			}
		} );
	}

	static attachMutationObserver( panel ) {
		const children = panel.querySelectorAll( ':scope > .panel-wrapper' );
		// Options for the observer (attributes to observe for)
		const config = { attributes: true, subtree: false };
		// Create an observer instance linked to the callback function
		const observer = new window.MutationObserver( ( mutationsList ) => {
			WizardLayout.handleMutation( panel, mutationsList );
		} );
		// Start observing each target node for configured mutations
		children.forEach( ( targetNode ) => {
			observer.observe( targetNode, config );
		} );
	}

	static createMenu( children ) {
		const ul = document.createElement( 'ul' );
		ul.className = 'wizard-menu-items';
		children.forEach( ( child, index ) => {
			const li = document.createElement( 'li' );
			li.innerHTML = child.querySelector( 'legend' )?.innerHTML || '';
			li.className = 'wizard-menu-item';
			li.dataset.index = index;
			if ( child.hasAttribute( 'data-visible' ) ) {
				li.dataset.visible = child.dataset.visible;
			}
			ul.append( li );
		} );
		return ul;
	}

	addButton( wrapper, panel, buttonDef, forward = true ) {
		const button = createButton( buttonDef );
		button.classList.add( buttonDef.id );
		button.addEventListener( 'click', () => this.navigate( panel, forward ) );
		wrapper.append( button );
	}

	applyLayout( panel ) {
		const children = panel.querySelectorAll( ':scope > .panel-wrapper' );
		if ( children.length ) {
			// create wizard menu
			const wizardMenu = WizardLayout.createMenu( Array.from( children ) );
			wizardMenu.querySelector( 'li' ).classList.add( 'wizard-menu-active-item' );
			// Insert the menu before the first child of the wizard
			panel.insertBefore( wizardMenu, children[0] );
			WizardLayout.attachMutationObserver( panel );
		}

		const wrapper = document.createElement( 'div' );
		wrapper.className = 'wizard-button-wrapper';
		if ( this.includePrevBtn && children.length ) {
			this.addButton( wrapper, panel, {
				label: { value: 'Back' }, fieldType: 'button', name: 'back', id: 'wizard-button-prev',
			}, false );
		}

		if ( this.includeNextBtn && children.length ) {
			this.addButton( wrapper, panel, {
				label: { value: 'Next' }, fieldType: 'button', name: 'next', id: 'wizard-button-next',
			} );
		}

		this.assignIndexToSteps( panel );
		panel.append( wrapper );
		panel.querySelector( 'fieldset' )?.classList.add( 'current-wizard-step' );
		panel.classList.add( 'wizard' );

		// Set up event listeners for real-time validation
		this.setupFieldValidationListeners( panel );

		// Initial button state update
		this.updateButtonStates( panel );
	}

	/**
	 * Set up event listeners on form fields to update button states in real-time
	 */
	setupFieldValidationListeners( panel ) {
		// Listen for input/change events on form fields
		panel.addEventListener( 'input', () => {
			this.updateButtonStates( panel );
		} );

		panel.addEventListener( 'change', () => {
			this.updateButtonStates( panel );
		} );

		// Also listen for visibility changes via mutation observer on field wrappers
		const fieldObserver = new window.MutationObserver( () => {
			this.updateButtonStates( panel );
		} );

		// Observe all field and panel wrappers for visibility changes
		panel.querySelectorAll( '.field-wrapper, .panel-wrapper' ).forEach( ( el ) => {
			fieldObserver.observe( el, { attributes: true, attributeFilter: ['data-visible'] } );
		} );
	}
}

const layout = new WizardLayout();

export default function wizardLayout( panel ) {
	layout.applyLayout( panel );
	return panel;
}

export const navigate = layout.navigate.bind( layout );
export const validateContainer = layout.validateContainer.bind( layout );
