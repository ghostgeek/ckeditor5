/**
 * @license Copyright (c) 2003-2025, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-licensing-options
 */

/**
 * @module table/utils/common
 */

import type {
	Conversion,
	ModelElement,
	ModelItem,
	ModelPosition,
	ModelSchema,
	ModelWriter,
	ModelDocumentSelection
} from 'ckeditor5/src/engine.js';

import { downcastAttributeToStyle, upcastStyleToAttribute } from '../converters/tableproperties.js';
import { type TableUtils } from '../tableutils.js';

/**
 * A common method to update the numeric value. If a value is the default one, it will be unset.
 *
 * @internal
 * @param key An attribute key.
 * @param value The new attribute value.
 * @param item A model item on which the attribute will be set.
 * @param defaultValue The default attribute value. If a value is lower or equal, it will be unset.
 */
export function updateNumericAttribute(
	key: string, value: unknown, item: ModelItem, writer: ModelWriter, defaultValue: unknown = 1
): void {
	if ( value !== undefined && value !== null && defaultValue !== undefined && defaultValue !== null && value > defaultValue ) {
		writer.setAttribute( key, value, item );
	} else {
		writer.removeAttribute( key, item );
	}
}

/**
 * A common method to create an empty table cell. It creates a proper model structure as a table cell must have at least one block inside.
 *
 * @internal
 * @param writer The model writer.
 * @param insertPosition The position at which the table cell should be inserted.
 * @param attributes The element attributes.
 * @returns Created table cell.
 */
export function createEmptyTableCell(
	writer: ModelWriter,
	insertPosition: ModelPosition,
	attributes: Record<string, unknown> = {}
): ModelElement {
	const tableCell = writer.createElement( 'tableCell', attributes );

	writer.insertElement( 'paragraph', tableCell );
	writer.insert( tableCell, insertPosition );

	return tableCell;
}

/**
 * Checks if a table cell belongs to the heading column section.
 *
 * @internal
 */
export function isHeadingColumnCell( tableUtils: TableUtils, tableCell: ModelElement ): boolean {
	const table = tableCell.parent!.parent as ModelElement;
	const headingColumns = parseInt( table.getAttribute( 'headingColumns' ) as string || '0' );
	const { column } = tableUtils.getCellLocation( tableCell );

	return !!headingColumns && column < headingColumns;
}

/**
 * Enables conversion for an attribute for simple view-model mappings.
 *
 * @internal
 * @param options.defaultValue The default value for the specified `modelAttribute`.
 */
export function enableProperty(
	schema: ModelSchema,
	conversion: Conversion,
	options: {
		modelAttribute: string;
		styleName: string;
		attributeName?: string;
		attributeType?: 'length' | 'color';
		defaultValue: string;
		reduceBoxSides?: boolean;
	}
): void {
	const { modelAttribute } = options;

	schema.extend( 'tableCell', {
		allowAttributes: [ modelAttribute ]
	} );

	schema.setAttributeProperties( modelAttribute, { isFormatting: true } );

	upcastStyleToAttribute( conversion, { viewElement: /^(td|th)$/, ...options } );
	downcastAttributeToStyle( conversion, { modelElement: 'tableCell', ...options } );
}

/**
 * Depending on the position of the selection we either return the table under cursor or look for the table higher in the hierarchy.
 *
 * @internal
 */
export function getSelectionAffectedTable( selection: ModelDocumentSelection ): ModelElement {
	const selectedElement = selection.getSelectedElement();

	// Is the command triggered from the `tableToolbar`?
	if ( selectedElement && selectedElement.is( 'element', 'table' ) ) {
		return selectedElement;
	}

	return selection.getFirstPosition()!.findAncestor( 'table' )!;
}
