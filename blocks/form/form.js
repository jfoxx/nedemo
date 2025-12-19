import transferRepeatableDOM, { insertAddButton, insertRemoveButton } from './components/repeat/repeat.js';
import { emailPattern, getSubmitBaseUrl, SUBMISSION_SERVICE } from './constant.js';
import GoogleReCaptcha from './integrations/recaptcha.js';
import componentDecorator from './mappings.js';
import { handleSubmit } from './submit.js';
import DocBasedFormToAF from './transform.js';
import {
	checkValidation,
	createButton, createFieldWrapper,
	createHelpText,
	createLabel, extractIdFromUrl, getHTMLRenderType,
	getId,
	getSitePageName,
	stripTags,
	toClassName,
} from './util.js';

export const DELAY_MS = 0;
let captchaField;
let afModule;

// Store for original columnClassNames from form definition (before rule engine transforms it)
let originalColumnClassNames = {};

/**
 * Extracts columnClassNames from all panels in the original form definition
 * and stores them keyed by panel id for later use during rendering.
 * The rule engine's getState() strips these out, so we need to preserve them.
 */
function extractColumnClassNames( formDef ) {
	const columnMap = {};

	const traverse = ( obj ) => {
		if ( !obj ) return;

		// Store columnClassNames for panels, keyed by panel id
		if ( obj.fieldType === 'panel' && obj.columnClassNames && obj.id ) {
			columnMap[obj.id] = obj.columnClassNames;
		}

		// Also check for form-level columnClassNames
		if ( obj.fieldType === 'form' && obj.columnClassNames && obj.id ) {
			columnMap[obj.id] = obj.columnClassNames;
		}

		// Traverse children - handle both :items/:itemsOrder and items array formats
		if ( obj[':itemsOrder'] && obj[':items'] ) {
			obj[':itemsOrder'].forEach( ( key ) => {
				traverse( obj[':items'][key] );
			} );
		}
		if ( obj.items && Array.isArray( obj.items ) ) {
			obj.items.forEach( ( item ) => traverse( item ) );
		}
	};

	traverse( formDef );
	return columnMap;
}

const withFieldWrapper = ( element ) => ( fd ) => {
	const wrapper = createFieldWrapper( fd );
	wrapper.append( element( fd ) );
	return wrapper;
};

function setPlaceholder( element, fd ) {
	if ( fd.placeholder ) {
		element.setAttribute( 'placeholder', fd.placeholder );
	}
}

const constraintsDef = Object.entries( {
	'password|tel|email|text': [['maxLength', 'maxlength'], ['minLength', 'minlength'], 'pattern'],
	'number|range|date': [['maximum', 'Max'], ['minimum', 'Min'], 'step'],
	file: ['accept', 'Multiple'],
	panel: [['maxOccur', 'data-max'], ['minOccur', 'data-min']],
} ).flatMap( ( [types, constraintDef] ) => types.split( '|' )
	.map( ( type ) => [type, constraintDef.map( ( cd ) => ( Array.isArray( cd ) ? cd : [cd, cd] ) )] ) );

const constraintsObject = Object.fromEntries( constraintsDef );

function setConstraints( element, fd ) {
	const renderType = getHTMLRenderType( fd );
	const constraints = constraintsObject[renderType];
	if ( constraints ) {
		constraints
			.filter( ( [nm] ) => fd[nm] )
			.forEach( ( [nm, htmlNm] ) => {
				element.setAttribute( htmlNm, fd[nm] );
			} );
	}
}

function createInput( fd ) {
	const input = document.createElement( 'input' );
	input.type = getHTMLRenderType( fd );
	setPlaceholder( input, fd );
	setConstraints( input, fd );
	return input;
}

const createTextArea = withFieldWrapper( ( fd ) => {
	const input = document.createElement( 'textarea' );
	setPlaceholder( input, fd );
	return input;
} );

const createSelect = withFieldWrapper( ( fd ) => {
	const select = document.createElement( 'select' );
	select.classList.add( 'usa-select' ); // Add USWDS select styling
	select.required = fd.required;
	select.title = fd.tooltip ? stripTags( fd.tooltip, '' ) : '';
	select.readOnly = fd.readOnly;
	select.multiple = fd.type === 'string[]' || fd.type === 'boolean[]' || fd.type === 'number[]';
	let ph;
	if ( fd.placeholder ) {
		ph = document.createElement( 'option' );
		ph.textContent = fd.placeholder;
		ph.setAttribute( 'disabled', '' );
		ph.setAttribute( 'value', '' );
		select.append( ph );
	}
	let optionSelected = false;

	const addOption = ( label, value ) => {
		const option = document.createElement( 'option' );
		option.textContent = label instanceof Object ? label?.value?.trim() : label?.trim();
		option.value = ( typeof value === 'string' ? value.trim() : value ) || label?.trim();
		if ( fd.value === option.value || ( Array.isArray( fd.value ) && fd.value.includes( option.value ) ) ) {
			option.setAttribute( 'selected', '' );
			optionSelected = true;
		}
		select.append( option );
		return option;
	};

	const options = fd?.enum || [];
	const optionNames = fd?.enumNames ?? options;

	if ( options.length === 1
		&& options?.[0]?.startsWith( 'https://' ) ) {
		const optionsUrl = new URL( options?.[0] );
		// using async to avoid rendering
		if ( optionsUrl.hostname.endsWith( 'hlx.page' )
			|| optionsUrl.hostname.endsWith( 'hlx.live' ) ) {
			fetch( `${optionsUrl.pathname}${optionsUrl.search}` )
				.then( async ( response ) => {
					const json = await response.json();
					const values = [];
					json.data.forEach( ( opt ) => {
						addOption( opt.Option, opt.Value );
						values.push( opt.Value || opt.Option );
					} );
				} );
		}
	} else {
		options.forEach( ( value, index ) => addOption( optionNames?.[index], value ) );
	}

	if ( ph && optionSelected === false ) {
		ph.setAttribute( 'selected', '' );
	}
	return select;
} );

function createHeading( fd ) {
	const wrapper = createFieldWrapper( fd );
	const heading = document.createElement( 'h2' );
	heading.textContent = fd.value || fd.label.value;
	heading.id = fd.id;
	wrapper.append( heading );

	return wrapper;
}

function createRadioOrCheckbox( fd ) {
	const wrapper = createFieldWrapper( fd );
	const input = createInput( fd );
	const [value, uncheckedValue] = fd.enum || [];
	input.value = value;
	if ( typeof uncheckedValue !== 'undefined' ) {
		input.dataset.uncheckedValue = uncheckedValue;
	}

	// Add USWDS classes for proper styling (visually hides native input, styled via label :before)
	if ( fd.fieldType === 'checkbox' ) {
		input.classList.add( 'usa-checkbox__input' );
	} else if ( fd.fieldType === 'radio' ) {
		input.classList.add( 'usa-radio__input' );
	}

	wrapper.insertAdjacentElement( 'afterbegin', input );
	return wrapper;
}

function createLegend( fd ) {
	return createLabel( fd, 'legend' );
}

function createRepeatablePanel( wrapper, fd ) {
	setConstraints( wrapper, fd );
	wrapper.dataset.repeatable = true;
	wrapper.dataset.index = fd.index || 0;
	if ( fd.properties ) {
		Object.keys( fd.properties ).forEach( ( key ) => {
			if ( !key.startsWith( 'fd:' ) ) {
				wrapper.dataset[key] = fd.properties[key];
			}
		} );
	}
	if ( ( !fd.index || fd?.index === 0 ) && fd.properties?.variant !== 'noButtons' ) {
		insertAddButton( wrapper, wrapper );
		insertRemoveButton( wrapper, wrapper );
	}
}

function createFieldSet( fd ) {
	const wrapper = createFieldWrapper( fd, 'fieldset', createLegend );
	wrapper.id = fd.id;
	wrapper.name = fd.name;
	if ( fd.fieldType === 'panel' ) {
		wrapper.classList.add( 'panel-wrapper' );
	}
	if ( fd.repeatable === true ) {
		createRepeatablePanel( wrapper, fd );
	}
	return wrapper;
}

function setConstraintsMessage( field, messages = {} ) {
	Object.keys( messages ).forEach( ( key ) => {
		field.dataset[`${key}ErrorMessage`] = messages[key];
	} );
}

function createRadioOrCheckboxGroup( fd ) {
	const wrapper = createFieldSet( { ...fd } );
	const type = fd.fieldType.split( '-' )[0];
	fd?.enum?.forEach( ( value, index ) => {
		const label = ( typeof fd?.enumNames?.[index] === 'object' && fd?.enumNames?.[index] !== null ) ? fd?.enumNames[index].value : fd?.enumNames?.[index] || value;
		const id = getId( fd.name );
		const field = createRadioOrCheckbox( {
			name: fd.name,
			id,
			label: { value: label },
			fieldType: type,
			enum: [value],
			required: fd.required,
		} );
		const { variant, 'afs:layout': layout } = fd.properties;
		if ( variant === 'cards' ) {
			wrapper.classList.add( variant );
		} else {
			wrapper.classList.remove( 'cards' );
		}
		if ( layout?.orientation === 'horizontal' ) {
			wrapper.classList.add( 'horizontal' );
		}
		if ( layout?.orientation === 'vertical' ) {
			wrapper.classList.remove( 'horizontal' );
		}
		field.classList.remove( 'field-wrapper', `field-${toClassName( fd.name )}` );
		const input = field.querySelector( 'input' );
		input.id = id;
		input.dataset.fieldType = fd.fieldType;
		input.name = fd.name;
		input.checked = Array.isArray( fd.value ) ? fd.value.includes( value ) : value === fd.value;
		if ( ( index === 0 && type === 'radio' ) || type === 'checkbox' ) {
			input.required = fd.required;
		}
		if ( type === 'checkbox' ) {
			input.classList.add( 'usa-checkbox__input' );
			input.classList.add( 'usa-checkbox__input--tile' );
		} else if ( type === 'radio' ){ 
			input.classList.add( 'usa-radio__input' );
			input.classList.add( 'usa-radio__input--tile' );
		}
		if ( fd.enabled === false || fd.readOnly === true ) {
			input.setAttribute( 'disabled', 'disabled' );
		}
		wrapper.appendChild( field );
	} );
	wrapper.dataset.required = fd.required;
	if ( fd.tooltip ) {
		wrapper.title = stripTags( fd.tooltip, '' );
	}
	setConstraintsMessage( wrapper, fd.constraintMessages );
	return wrapper;
}

function createPlainText( fd ) {
	const paragraph = document.createElement( 'p' );
	if ( fd.richText ) {
		paragraph.innerHTML = stripTags( fd.value );
	} else {
		paragraph.textContent = fd.value;
	}
	const wrapper = createFieldWrapper( fd );
	wrapper.id = fd.id;
	wrapper.replaceChildren( paragraph );
	return wrapper;
}

/**
 * Resolves image paths, prepending AEM publish URL for absolute DAM/content paths
 * @param {string} path - The image path
 * @returns {string} - The resolved full URL
 */
function resolveAemImagePath( path ) {
	if ( !path ) return '';

	// If path starts with /content/ (AEM absolute path), prepend the publish URL
	if ( path.startsWith( '/content/' ) ) {
		const aemPublishUrl = window.aemPublishUrl || 'https://publish-p49252-e308251.adobeaemcloud.com';
		return `${aemPublishUrl}${path}`;
	}

	return path;
}

/**
 * Creates an image element for AEM form images.
 * These images come directly from the AEM publish server, not Edge Delivery.
 */
function createImage( fd ) {
	const field = createFieldWrapper( fd );
	field.id = fd?.id;
	const imagePath = fd.value || fd.properties?.['fd:repoPath'] || '';
	const resolvedPath = resolveAemImagePath( imagePath );
	const altText = fd.altText || fd.name;

	// Create a simple img element - these are AEM-hosted images, not Edge Delivery
	const img = document.createElement( 'img' );
	img.src = resolvedPath;
	img.alt = altText;
	img.loading = 'lazy';

	field.append( img );
	return field;
}

const fieldRenderers = {
	'drop-down': createSelect,
	'plain-text': createPlainText,
	checkbox: createRadioOrCheckbox,
	button: createButton,
	multiline: createTextArea,
	panel: createFieldSet,
	radio: createRadioOrCheckbox,
	'radio-group': createRadioOrCheckboxGroup,
	'checkbox-group': createRadioOrCheckboxGroup,
	image: createImage,
	heading: createHeading,
};

/**
 * Parses AEM Grid column classes and extracts span and offset values
 * @param {string} aemGridClasses - e.g., "aem-GridColumn aem-GridColumn--default--6 aem-GridColumn--offset--default--2"
 * @returns {{ span: number|null, offset: number|null }}
 */
function parseAemGridClasses( aemGridClasses ) {
	if ( !aemGridClasses ) return { span: null, offset: null };

	let span = null;
	let offset = null;

	// Match span: aem-GridColumn--default--{number}
	const spanMatch = aemGridClasses.match( /aem-GridColumn--default--(\d+)/ );
	if ( spanMatch ) {
		span = parseInt( spanMatch[1], 10 );
	}

	// Match offset: aem-GridColumn--offset--default--{number}
	const offsetMatch = aemGridClasses.match( /aem-GridColumn--offset--default--(\d+)/ );
	if ( offsetMatch ) {
		offset = parseInt( offsetMatch[1], 10 );
	}

	return { span, offset };
}

/**
 * Finds matching columnClassNames for a field by trying multiple matching strategies
 * columnClassNames keys are item keys (e.g., "radiobutton") while field.name may be different
 * (e.g., "radiobutton1765907004117")
 */
function findColumnClassNames( field, columnClassNames ) {
	if ( !columnClassNames || Object.keys( columnClassNames ).length === 0 ) {
		return null;
	}

	const fieldName = field.name || '';
	const fieldId = field.id || '';

	// Normalize a string by removing separators for comparison
	const normalize = ( str ) => str.replace( /[-_]/g, '' );
	const normalizedFieldName = normalize( fieldName );

	// Strategy 1: Exact match on field name
	if ( columnClassNames[fieldName] ) {
		return columnClassNames[fieldName];
	}

	// Strategy 2: Extract key's ID portion and check if field name contains it
	// columnClassNames keys like "panelcontainer_1841561611" should match
	// field names like "panelcontainer-18415616111765922920829"
	// Sort keys by specificity (longer keys first) to prefer more specific matches
	const sortedKeys = Object.keys( columnClassNames ).sort( ( a, b ) => b.length - a.length );

	for ( const key of sortedKeys ) {
		const normalizedKey = normalize( key );

		// Check if normalized field name starts with or contains the normalized key
		if ( normalizedFieldName.startsWith( normalizedKey ) ) {
			return columnClassNames[key];
		}

		// Also extract the numeric suffix from the key and check if it appears in the field name
		// e.g., key "panelcontainer_1841561611" has suffix "1841561611"
		const keyParts = key.split( /[-_]/ );
		if ( keyParts.length > 1 ) {
			const keySuffix = keyParts[keyParts.length - 1];
			// Check if this suffix appears at the right position in the field name
			const fieldParts = fieldName.split( /[-_]/ );
			if ( fieldParts.length > 1 ) {
				const fieldSuffix = fieldParts[fieldParts.length - 1];
				// Check if field suffix starts with key suffix (allows for timestamp appended)
				if ( fieldSuffix.startsWith( keySuffix ) ) {
					return columnClassNames[key];
				}
			}
		}
	}

	// Strategy 3: Check if field ID contains the key
	// (e.g., id "radiobutton-d0de3c0086" contains "radiobutton")
	for ( const key of sortedKeys ) {
		if ( fieldId.includes( key ) ) {
			return columnClassNames[key];
		}
	}

	return null;
}

/**
 * Applies column span and positioning to a field element.
 * Tracks current column position to correctly handle offsets as relative gaps.
 * @param {Object} field - The field definition
 * @param {HTMLElement} element - The field wrapper element
 * @param {Object} columnClassNames - Map of field names to AEM grid classes
 * @param {number} currentCol - Current column position (1-based)
 * @returns {number} - The new column position after this field
 */
function colSpanDecorator( field, element, columnClassNames, currentCol = 1 ) {
	const GRID_COLUMNS = 12;

	// First check for AEM grid classes from parent panel's columnClassNames
	const aemGridClasses = findColumnClassNames( field, columnClassNames );

	if ( aemGridClasses ) {
		const { span, offset } = parseAemGridClasses( aemGridClasses );
		const effectiveSpan = span || GRID_COLUMNS;
		const effectiveOffset = offset || 0;

		// Calculate actual start position: current position + offset
		let startCol = currentCol + effectiveOffset;

		// Check if this element would overflow the row
		if ( startCol + effectiveSpan > GRID_COLUMNS + 1 ) {
			// Start a new row
			startCol = 1 + effectiveOffset;
		}

		// Set the grid-column with explicit start and span
		if ( effectiveOffset > 0 || startCol > 1 ) {
			element.style.gridColumn = `${startCol} / span ${effectiveSpan}`;
		} else {
			element.classList.add( `col-${effectiveSpan}` );
		}

		// Return new column position
		return startCol + effectiveSpan;
	}

	// Fallback to legacy Column Span property
	const colSpan = field['Column Span'] || field.properties?.colspan;
	if ( colSpan && element ) {
		element.classList.add( `col-${colSpan}` );
		return currentCol + parseInt( colSpan, 10 );
	}

	// Default: full width
	return 1; // Reset to start of next row
}

const handleFocus = ( input, field ) => {
	const editValue = input.getAttribute( 'edit-value' );
	input.type = field.type;
	input.value = editValue;
};

const handleFocusOut = ( input ) => {
	const displayValue = input.getAttribute( 'display-value' );
	input.type = 'text';
	input.value = displayValue;
};

function inputDecorator( field, element ) {
	const input = element?.querySelector( 'input,textarea,select' );
	if ( input ) {
		input.id = field.id;
		input.name = field.name;
		if ( field.tooltip ) {
			input.title = stripTags( field.tooltip, '' );
		}
		input.readOnly = field.readOnly;
		input.autocomplete = field.autoComplete ?? 'off';
		input.disabled = field.enabled === false;
		if ( field.fieldType === 'drop-down' && field.readOnly ) {
			input.disabled = true;
		}
		const fieldType = getHTMLRenderType( field );
		if ( ['number', 'date', 'text', 'email'].includes( fieldType ) && ( field.displayFormat || field.displayValueExpression ) ) {
			field.type = fieldType;
			input.setAttribute( 'edit-value', field.value ?? '' );
			input.setAttribute( 'display-value', field.displayValue ?? '' );
			input.type = 'text';
			input.value = field.displayValue ?? '';
			input.addEventListener( 'touchstart', () => { input.type = field.type; } ); // in mobile devices the input type needs to be toggled before focus
			input.addEventListener( 'focus', () => handleFocus( input, field ) );
			input.addEventListener( 'blur', () => handleFocusOut( input ) );
		} else if ( input.type !== 'file' ) {
			input.value = field.value ?? '';
			if ( input.type === 'radio' || input.type === 'checkbox' ) {
				input.value = field?.enum?.[0] ?? 'on';
				input.checked = field.value === input.value;
			}
		} else {
			input.multiple = field.type === 'file[]';
		}
		if ( field.required ) {
			input.setAttribute( 'required', 'required' );
		}
		if ( field.description ) {
			input.setAttribute( 'aria-describedby', `${field.id}-description` );
		}
		if ( field.minItems ) {
			input.dataset.minItems = field.minItems;
		}
		if ( field.maxItems ) {
			input.dataset.maxItems = field.maxItems;
		}
		if ( field.maxFileSize ) {
			input.dataset.maxFileSize = field.maxFileSize;
		}
		if ( field.default !== undefined ) {
			input.setAttribute( 'value', field.default );
		}
		if ( input.type === 'email' ) {
			input.pattern = emailPattern;
		}
		if ( input.type === 'textarea' ) {
			input.classList.add( 'usa-textarea' );
		}
		// Don't add usa-input class to checkboxes and radio buttons - they have their own styling
		if ( input.type !== 'checkbox' && input.type !== 'radio' ) {
			input.classList.add( 'usa-input' );
		}
		
		setConstraintsMessage( element, field.constraintMessages );
		element.dataset.required = field.required;
	}
}

function decoratePanelContainer( panelDefinition, panelContainer ) {
	if ( !panelContainer ) return;

	const isPanelWrapper = ( container ) => container.classList?.contains( 'panel-wrapper' );

	const shouldAddLabel = ( container, panel ) => panel.label && !container.querySelector( `legend[for=${container.dataset.id}]` );

	const isContainerRepeatable = ( container ) => container.dataset?.repeatable === 'true' && container.dataset?.variant !== 'noButtons';

	const needsAddButton = ( container ) => !container.querySelector( ':scope > .repeat-actions' );

	const needsRemoveButton = ( container ) => !container.querySelector( ':scope > .item-remove' );

	if ( isPanelWrapper( panelContainer ) ) {
		if ( shouldAddLabel( panelContainer, panelDefinition ) ) {
			const legend = createLegend( panelDefinition );
			if ( legend ) {
				panelContainer.insertAdjacentElement( 'afterbegin', legend );
			}
		}

		if ( isContainerRepeatable( panelContainer ) ) {
			if ( needsAddButton( panelContainer ) ) {
				insertAddButton( panelContainer, panelContainer );
			}
			if ( needsRemoveButton( panelContainer ) ) {
				insertRemoveButton( panelContainer, panelContainer );
			}
		}
	}
}

function renderField( fd ) {
	// Skip rendering if field has no proper name or id (invalid field definition)
	if ( !fd || ( !fd.name && !fd.id && !fd.fieldType ) ) {
		return null;
	}

	// Skip hidden fields - they don't need to be rendered
	if ( fd.fieldType === 'hidden' ) {
		return null;
	}

	const fieldType = fd?.fieldType?.replace( '-input', '' ) ?? 'text';
	const renderer = fieldRenderers[fieldType];
	let field;
	if ( typeof renderer === 'function' ) {
		field = renderer( fd );
	} else {
		field = createFieldWrapper( fd );
		field.append( createInput( fd ) );
	}
	if ( fd.description ) {
		const label = field.querySelector( '.field-label' );
		if ( label ) {
			label.append( createHelpText( fd ) );
		} else {
			field.append( createHelpText( fd ) );
		}
		field.dataset.description = fd.description; // In case overriden by error message
	}
	if ( fd.fieldType !== 'radio-group' && fd.fieldType !== 'checkbox-group' && fd.fieldType !== 'captcha' ) {
		inputDecorator( fd, field );
	}
	return field;
}

/**
 * Checks if a panel is constrained to a small column width (less than 12 columns).
 * When true, children should be full width within the panel.
 */
function isPanelColumnConstrained( panelId, parentColumnClassNames ) {
	const colDef = findColumnClassNames( { id: panelId, name: panelId }, parentColumnClassNames );
	if ( colDef ) {
		const { span } = parseAemGridClasses( colDef );
		// If the panel spans less than 12 columns, it's constrained
		return span && span < 12;
	}
	return false;
}

export async function generateFormRendition( panel, container, formId, getItems = ( p ) => p?.items, parentColumnClassNames = null ) {
	const items = getItems( panel ) || [];
	// Get columnClassNames - first check the preserved original, then fall back to panel property
	// The rule engine's getState() strips columnClassNames, so we use the original form definition
	let columnClassNames = originalColumnClassNames[panel.id] || panel.columnClassNames || {};

	// Check if this panel is column-constrained (spans less than 12 columns in its parent)
	// If so, children should be full width within this panel - don't apply their column classes
	if ( parentColumnClassNames && isPanelColumnConstrained( panel.id || panel.name, parentColumnClassNames ) ) {
		columnClassNames = {}; // Make children full width
	}

	// Track current column position for proper offset handling
	let currentCol = 1;
	const children = [];

	// Process items sequentially to correctly track column positions
	for ( const field of items ) {
		field.value = field.value ?? '';
		const { fieldType } = field;

		let element;
		if ( fieldType === 'captcha' ) {
			captchaField = field;
			element = createFieldWrapper( field );
			element.textContent = 'CAPTCHA';
		} else {
			element = renderField( field );
			// Skip if renderField returned null (invalid or hidden field)
			if ( !element ) {
				continue;
			}
			if ( field.appliedCssClassNames ) {
				element.className += ` ${field.appliedCssClassNames}`;
			}
			// Apply column span and get new column position
			currentCol = colSpanDecorator( field, element, columnClassNames, currentCol );

			// Recursively render panels and container components that have items
			const hasItems = getItems( field )?.length > 0;
			if ( field?.fieldType === 'panel' || hasItems ) {
				// Pass current columnClassNames as parent for child panels to check if they're constrained
				await generateFormRendition( field, element, formId, getItems, columnClassNames );
			} else {
				await componentDecorator( element, field, container, formId );
			}
		}

		if ( element ) {
			children.push( element );
		}
	}

	container.append( ...children );
	decoratePanelContainer( panel, container );
	await componentDecorator( container, panel, null, formId );
}

function enableValidation( form ) {
	form.querySelectorAll( 'input,textarea,select' ).forEach( ( input ) => {
		input.addEventListener( 'invalid', ( event ) => {
			checkValidation( event.target );
		} );
	} );

	form.addEventListener( 'change', ( event ) => {
		checkValidation( event.target );
	} );
}

/**
 * Sets up dynamic plate preview functionality
 * When user types in the plate message field, updates the plate image
 * with Dynamic Media URL including the message parameter
 */
function setupDynamicPlatePreview( form ) {
	// Store the current plate message so it can be applied to all preview images
	let currentPlateMessage = '';

	// Build the Dynamic Media URL with the message
	const buildDmUrl = ( message ) => {
		const encodedMessage = encodeURIComponent( message );
		return `https://s7d1.scene7.com/is/image/JeffFoxxNA001/license%20plate?$message=${encodedMessage}&wid=2000&hei=2000&qlt=100&fit=constrain`;
	};

	// Find all plate preview images in the form (on wizard steps 3, 4, and 5)
	const findAllPlateImages = () => {
		// For wizard: Get all wizard steps (fieldset.panel-wrapper children of .wizard)
		const wizard = form.querySelector( '.wizard' );
		const plateImages = [];

		if ( wizard ) {
			// Get wizard steps (direct fieldset children)
			const steps = [...wizard.children].filter(
				( child ) => child.tagName === 'FIELDSET' && child.classList.contains( 'panel-wrapper' ),
			);

			steps.forEach( ( step, index ) => {
				// Steps 3, 4, and 5 are indices 2, 3, and 4 (0-based)
				if ( index >= 2 ) {
					// Find all images in this step
					const images = step.querySelectorAll( 'img' );
					images.forEach( ( img ) => {
						plateImages.push( img );
					} );
				}
			} );
		} else {
			// Fallback for tab-based layout (kept for backwards compatibility)
			const tabPanels = form.querySelectorAll( '.tab-panel' );
			tabPanels.forEach( ( panel, index ) => {
				if ( index >= 2 ) {
					const img = panel.querySelector( 'img' );
					if ( img ) {
						plateImages.push( img );
					}
				}
			} );
		}

		return plateImages;
	};

	// Update all plate preview images with the current message
	const updateAllPlateImages = () => {
		const plateImages = findAllPlateImages();
		const dmUrl = buildDmUrl( currentPlateMessage );

		plateImages.forEach( ( img ) => {
			// Store original src if not already stored
			if ( !img.dataset.dmPreviewEnabled ) {
				img.dataset.originalSrc = img.src;
				img.dataset.dmPreviewEnabled = 'true';
			}
			img.src = dmUrl;
		} );
	};

	// Handler for input events - updates the message and all images
	const updatePlatePreview = ( event ) => {
		const input = event.target;

		// Convert to uppercase and store
		currentPlateMessage = input.value.toUpperCase().trim();

		// Update all plate images across steps 3, 4, and 5
		updateAllPlateImages();
	};

	// Use event delegation on the form to capture events from the platemessage field
	// This works even if the field isn't visible initially
	form.addEventListener( 'input', ( event ) => {
		const target = event.target;
		if ( target.name && target.name.toLowerCase().includes( 'platemessage' ) ) {
			updatePlatePreview( event );
		}
	} );

	form.addEventListener( 'keyup', ( event ) => {
		const target = event.target;
		if ( target.name && target.name.toLowerCase().includes( 'platemessage' ) ) {
			updatePlatePreview( event );
		}
	} );

	// Update images when wizard navigates (listen for wizard:navigate event)
	form.addEventListener( 'wizard:navigate', () => {
		if ( currentPlateMessage ) {
			// Small delay to let step switch complete
			setTimeout( updateAllPlateImages, 100 );
		}
	} );

	// Also update images when wizard buttons are clicked
	form.addEventListener( 'click', ( event ) => {
		const wizardButton = event.target.closest( '.wizard-button-prev, .wizard-button-next' );
		const tabButton = event.target.closest( '.tab-item, [role="tab"]' );
		if ( ( wizardButton || tabButton ) && currentPlateMessage ) {
			// Small delay to let step/tab switch complete
			setTimeout( updateAllPlateImages, 100 );
		}
	} );

	// Also handle focus to initialize all images when user first clicks in the field
	form.addEventListener( 'focus', ( event ) => {
		const target = event.target;
		if ( target.name && target.name.toLowerCase().includes( 'platemessage' ) ) {
			// Initialize all plate images with base URL
			updateAllPlateImages();
		}
	}, true ); // Use capture phase to get focus events
}

async function createFormForAuthoring( formDef ) {
	const form = document.createElement( 'form' );
	await generateFormRendition( formDef, form, formDef.id, getAemFormItems );
	return form;
}

/**
 * Custom getItems function for AEM Adaptive Forms that handles both
 * standard `items` property and AEM's `:items` / `:itemsOrder` notation
 */
function getAemFormItems( container ) {
	// First check for AEM notation with :items and :itemsOrder
	if ( container[':itemsOrder'] && container[':items'] ) {
		return container[':itemsOrder'].map( ( itemKey ) => container[':items'][itemKey] );
	}
	// Fallback to standard items array
	return container?.items || [];
}

export async function createForm( formDef, data ) {
	const { action: formPath } = formDef;
	const form = document.createElement( 'form' );
	form.dataset.action = formPath;
	form.noValidate = true;
	form.className = 'usa-form usa-form--large';
	if ( formDef.appliedCssClassNames ) {
		form.className = formDef.appliedCssClassNames;
	}
	const formId = extractIdFromUrl( formPath ); // formDef.id returns $form after getState()
	await generateFormRendition( formDef, form, formId, getAemFormItems );

	let captcha;
	if ( captchaField ) {
		let config = captchaField?.properties?.['fd:captcha']?.config;
		if ( !config ) {
			config = {
				siteKey: captchaField?.value,
				uri: captchaField?.uri,
				version: captchaField?.version,
			};
		}
		const pageName = getSitePageName( captchaField?.properties?.['fd:path'] );
		captcha = new GoogleReCaptcha( config, captchaField.id, captchaField.name, pageName );
		captcha.loadCaptcha( form );
	}

	enableValidation( form );
	transferRepeatableDOM( form );
	setupDynamicPlatePreview( form );

	if ( afModule ) {
		window.setTimeout( async () => {
			afModule.loadRuleEngine( formDef, form, captcha, generateFormRendition, data );
		}, DELAY_MS );
	}

	form.addEventListener( 'reset', async () => {
		const newForm = await createForm( formDef );
		document.querySelector( `[data-action="${form?.dataset?.action}"]` )?.replaceWith( newForm );
	} );

	form.addEventListener( 'submit', ( e ) => {
		handleSubmit( e, form, captcha );
	} );

	return form;
}

function isDocumentBasedForm( formDef ) {
	return formDef?.[':type'] === 'sheet' && formDef?.data;
}

function cleanUp( content ) {
	const formDef = content.replaceAll( '^(([^<>()\\\\[\\\\]\\\\\\\\.,;:\\\\s@\\"]+(\\\\.[^<>()\\\\[\\\\]\\\\\\\\.,;:\\\\s@\\"]+)*)|(\\".+\\"))@((\\\\[[0-9]{1,3}\\\\.[0-9]{1,3}\\\\.[0-9]{1,3}\\\\.[0-9]{1,3}])|(([a-zA-Z\\\\-0-9]+\\\\.)\\+[a-zA-Z]{2,}))$', '' );
	return formDef?.replace( /\x83\n|\n|\s\s+/g, '' );
}
/*
	Newer Clean up - Replace backslashes that are not followed by valid json escape characters
	function cleanUp(content) {
		return content.replace(/\\/g, (match, offset, string) => {
			const prevChar = string[offset - 1];
			const nextChar = string[offset + 1];
			const validEscapeChars = ['b', 'f', 'n', 'r', 't', '"', '\\'];
			if (validEscapeChars.includes(nextChar) || prevChar === '\\') {
				return match;
			}
			return '';
		});
	}
*/

function decode( rawContent ) {
	const content = rawContent.trim();
	if ( content.startsWith( '"' ) && content.endsWith( '"' ) ) {
		// In the new 'jsonString' context, Server side code comes as a string with escaped characters,
		// hence the double parse
		return JSON.parse( JSON.parse( content ) );
	}
	return JSON.parse( cleanUp( content ) );
}

function extractFormDefinition( block ) {
	let formDef;
	const container = block.querySelector( 'pre' );
	const codeEl = container?.querySelector( 'code' );
	const content = codeEl?.textContent;
	if ( content ) {
		formDef = decode( content );
	}
	return { container, formDef };
}

export async function fetchForm( pathname ) {
	// get the main form
	let data;
	let path = pathname;
	if ( path.startsWith( window.location.origin ) && !path.includes( '.json' ) ) {
		if ( path.endsWith( '.html' ) ) {
			path = path.substring( 0, path.lastIndexOf( '.html' ) );
		}
		path += '/jcr:content/root/section/form.html';
	}
	let resp = await fetch( path );

	if ( resp?.headers?.get( 'Content-Type' )?.includes( 'application/json' ) ) {
		data = await resp.json();
	} else if ( resp?.headers?.get( 'Content-Type' )?.includes( 'text/html' ) ) {
		resp = await fetch( path );
		data = await resp.text().then( ( html ) => {
			try {
				const doc = new DOMParser().parseFromString( html, 'text/html' );
				if ( doc ) {
					return extractFormDefinition( doc.body ).formDef;
				}
				return doc;
			} catch ( e ) {
				// eslint-disable-next-line no-console
				console.error( 'Unable to fetch form definition for path', pathname, path );
				return null;
			}
		} );
	}

	// Extract and store columnClassNames from original form definition
	// before the rule engine transforms it (which strips these properties)
	if ( data ) {
		originalColumnClassNames = extractColumnClassNames( data );
	}

	return data;
}

export default async function decorate( block ) {
	let container = block.querySelector( 'a[href]' );
	let formDef;
	let pathname;
	if ( container ) {
		( { pathname } = new URL( container.href ) );
		formDef = await fetchForm( container.innerText );
	} else {
		( { container, formDef } = extractFormDefinition( block ) );
	}
	let source = 'aem';
	let rules = true;
	let form;
	if ( formDef ) {
		const { actionType, spreadsheetUrl } = formDef?.properties || {};
		if ( !formDef?.properties?.['fd:submit'] && actionType === 'spreadsheet' && spreadsheetUrl ) {
			// Check if we're in an iframe and use parent window path if available
			const iframePath = window.frameElement ? window.parent.location.pathname
				: window.location.pathname;
			formDef.action = SUBMISSION_SERVICE + btoa( pathname || iframePath );
		} else {
			formDef.action = getSubmitBaseUrl() + ( formDef.action || '' );
		}
		if ( isDocumentBasedForm( formDef ) ) {
			const transform = new DocBasedFormToAF();
			formDef = transform.transform( formDef );
			source = 'sheet';
			form = await createForm( formDef );
			const docRuleEngine = await import( './rules-doc/index.js' );
			docRuleEngine.default( formDef, form );
			rules = false;
		} else {
			afModule = await import( './rules/index.js' );
			if ( afModule && afModule.initAdaptiveForm && !block.classList.contains( 'edit-mode' ) ) {
				form = await afModule.initAdaptiveForm( formDef, createForm );
			} else {
				form = await createFormForAuthoring( formDef );
			}
		}
		form.dataset.redirectUrl = formDef.redirectUrl || '';
		form.dataset.thankYouMsg = formDef.thankYouMsg || '';
		form.dataset.action = formDef.action || pathname?.split( '.json' )[0];
		form.dataset.source = source;
		form.dataset.rules = rules;
		form.dataset.id = formDef.id;
		if ( source === 'aem' && formDef.properties ) {
			form.dataset.formpath = formDef.properties['fd:path'];
		}
		form.className = 'usa-form usa-form--large';
		container.replaceWith( form );
	}
}
