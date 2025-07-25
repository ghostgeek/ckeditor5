/**
 * @license Copyright (c) 2003-2025, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-licensing-options
 */

/**
 * @module list/legacylist/legacyutils
 */

import {
	ModelTreeWalker,
	getViewFillerOffset,
	type DowncastConversionApi,
	type ViewDowncastWriter,
	type ModelElement,
	type ModelItem,
	type Model,
	type ModelPosition,
	type ViewContainerElement,
	type ViewElement,
	type ViewItem,
	type ViewPosition
} from 'ckeditor5/src/engine.js';

/**
 * Creates a list item {@link module:engine/view/containerelement~ViewContainerElement}.
 *
 * @internal
 * @param writer The writer instance.
 */
export function createViewListItemElement( writer: ViewDowncastWriter ): ViewContainerElement {
	const viewItem = writer.createContainerElement( 'li' );

	viewItem.getFillerOffset = getListItemFillerOffset;

	return viewItem;
}

/**
 * Helper function that creates a `<ul><li></li></ul>` or (`<ol>`) structure out of the given `modelItem` model `listItem` element.
 * Then, it binds the created view list item (`<li>`) with the model `listItem` element.
 * The function then returns the created view list item (`<li>`).
 *
 * @internal
 * @param modelItem Model list item.
 * @param conversionApi Conversion interface.
 * @returns View list element.
 */
export function generateLiInUl( modelItem: ModelItem, conversionApi: DowncastConversionApi ): ViewContainerElement {
	const mapper = conversionApi.mapper;
	const viewWriter = conversionApi.writer;
	const listType = modelItem.getAttribute( 'listType' ) == 'numbered' ? 'ol' : 'ul';
	const viewItem = createViewListItemElement( viewWriter );

	const viewList = viewWriter.createContainerElement( listType, null );

	viewWriter.insert( viewWriter.createPositionAt( viewList, 0 ), viewItem );

	mapper.bindElements( modelItem as any, viewItem );

	return viewItem;
}

/**
 * Helper function that inserts a view list at a correct place and merges it with its siblings.
 * It takes a model list item element (`modelItem`) and a corresponding view list item element (`injectedItem`). The view list item
 * should be in a view list element (`<ul>` or `<ol>`) and should be its only child.
 * See comments below to better understand the algorithm.
 *
 * @internal
 * @param modelItem Model list item.
 * @param injectedItem
 * @param conversionApi Conversion interface.
 * @param model The model instance.
 */
export function injectViewList(
	modelItem: ModelElement,
	injectedItem: ViewContainerElement,
	conversionApi: DowncastConversionApi,
	model: Model
): void {
	const injectedList = injectedItem.parent as ViewElement;
	const mapper = conversionApi.mapper;
	const viewWriter = conversionApi.writer;

	// The position where the view list will be inserted.
	let insertPosition = mapper.toViewPosition( model.createPositionBefore( modelItem ) );

	// 1. Find the previous list item that has the same or smaller indent. Basically we are looking for the first model item
	// that is a "parent" or "sibling" of the injected model item.
	// If there is no such list item, it means that the injected list item is the first item in "its list".
	const refItem = getSiblingListItem( modelItem.previousSibling, {
		sameIndent: true,
		smallerIndent: true,
		listIndent: modelItem.getAttribute( 'listIndent' ) as number
	} );
	const prevItem = modelItem.previousSibling as ModelElement | null;

	if ( refItem && refItem.getAttribute( 'listIndent' ) == modelItem.getAttribute( 'listIndent' ) ) {
		// There is a list item with the same indent - we found the same-level sibling.
		// Break the list after it. The inserted view item will be added in the broken space.
		const viewItem = mapper.toViewElement( refItem )!;
		insertPosition = viewWriter.breakContainer( viewWriter.createPositionAfter( viewItem ) );
	} else {
		// There is no list item with the same indent. Check the previous model item.
		if ( prevItem && prevItem.name == 'listItem' ) {
			// If it is a list item, it has to have a lower indent.
			// It means that the inserted item should be added to it as its nested item.
			insertPosition = mapper.toViewPosition( model.createPositionAt( prevItem, 'end' ) );

			// There could be some not mapped elements (eg. span in to-do list) but we need to insert
			// a nested list directly inside the li element.
			const mappedViewAncestor = mapper.findMappedViewAncestor( insertPosition );
			const nestedList = findNestedList( mappedViewAncestor );

			// If there already is some nested list, then use it's position.
			if ( nestedList ) {
				insertPosition = viewWriter.createPositionBefore( nestedList );
			} else {
				// Else just put new list on the end of list item content.
				insertPosition = viewWriter.createPositionAt( mappedViewAncestor, 'end' );
			}
		} else {
			// The previous item is not a list item (or does not exist at all).
			// Just map the position and insert the view item at the mapped position.
			insertPosition = mapper.toViewPosition( model.createPositionBefore( modelItem ) );
		}
	}

	insertPosition = positionAfterUiElements( insertPosition );

	// Insert the view item.
	viewWriter.insert( insertPosition, injectedList );

	// 2. Handle possible children of the injected model item.
	if ( prevItem && prevItem.name == 'listItem' ) {
		const prevView = mapper.toViewElement( prevItem )!;

		const walkerBoundaries = viewWriter.createRange( viewWriter.createPositionAt( prevView, 0 ), insertPosition );
		const walker = walkerBoundaries.getWalker( { ignoreElementEnd: true } );

		for ( const value of walker ) {
			if ( value.item.is( 'element', 'li' ) ) {
				const breakPosition = viewWriter.breakContainer( viewWriter.createPositionBefore( value.item ) );
				const viewList = value.item.parent as ViewElement;

				const targetPosition = viewWriter.createPositionAt( injectedItem, 'end' );
				mergeViewLists( viewWriter, targetPosition.nodeBefore!, targetPosition.nodeAfter! );
				viewWriter.move( viewWriter.createRangeOn( viewList ), targetPosition );

				// This is bad, but those lists will be removed soon anyway.
				( walker as any )._position = breakPosition;
			}
		}
	} else {
		const nextViewList = injectedList.nextSibling;

		if ( nextViewList && ( nextViewList.is( 'element', 'ul' ) || nextViewList.is( 'element', 'ol' ) ) ) {
			let lastSubChild = null;

			for ( const child of nextViewList.getChildren() as Iterable<ViewElement> ) {
				const modelChild = mapper.toModelElement( child );

				if (
					modelChild &&
					( modelChild.getAttribute( 'listIndent' ) as number ) > ( modelItem.getAttribute( 'listIndent' ) as number )
				) {
					lastSubChild = child;
				} else {
					break;
				}
			}

			if ( lastSubChild ) {
				viewWriter.breakContainer( viewWriter.createPositionAfter( lastSubChild ) );
				viewWriter.move(
					viewWriter.createRangeOn( lastSubChild.parent as any ),
					viewWriter.createPositionAt( injectedItem, 'end' )
				);
			}
		}
	}

	// Merge the inserted view list with its possible neighbor lists.
	mergeViewLists( viewWriter, injectedList, injectedList.nextSibling! );
	mergeViewLists( viewWriter, injectedList.previousSibling!, injectedList );
}

/**
 * Helper function that takes two parameters that are expected to be view list elements, and merges them.
 * The merge happens only if both parameters are list elements of the same type (the same element name and the same class attributes).
 *
 * @internal
 * @param viewWriter The writer instance.
 * @param firstList The first element to compare.
 * @param secondList The second element to compare.
 * @returns The position after merge or `null` when there was no merge.
 */
export function mergeViewLists(
	viewWriter: ViewDowncastWriter,
	firstList: ViewItem,
	secondList: ViewItem
): ViewPosition | null;

export function mergeViewLists(
	viewWriter: ViewDowncastWriter,
	firstList: any,
	secondList: any
): ViewPosition | null {
	// Check if two lists are going to be merged.
	if ( !firstList || !secondList || ( firstList.name != 'ul' && firstList.name != 'ol' ) ) {
		return null;
	}

	// Both parameters are list elements, so compare types now.
	if ( firstList.name != secondList.name || firstList.getAttribute( 'class' ) !== secondList.getAttribute( 'class' ) ) {
		return null;
	}

	return viewWriter.mergeContainers( viewWriter.createPositionAfter( firstList ) );
}

/**
 * Helper function that for a given `view.Position`, returns a `view.Position` that is after all `view.UIElement`s that
 * are after the given position.
 *
 * For example:
 * `<container:p>foo^<ui:span></ui:span><ui:span></ui:span>bar</container:p>`
 * For position ^, the position before "bar" will be returned.
 *
 * @internal
 */
export function positionAfterUiElements( viewPosition: ViewPosition ): ViewPosition {
	return viewPosition.getLastMatchingPosition( value => value.item.is( 'uiElement' ) );
}

/**
 * Helper function that searches for a previous list item sibling of a given model item that meets the given criteria
 * passed by the options object.
 *
 * @internal
 * @param options Search criteria.
 * @param options.sameIndent Whether the sought sibling should have the same indentation.
 * @param options.smallerIndent Whether the sought sibling should have a smaller indentation.
 * @param options.listIndent The reference indentation.
 * @param options.direction Walking direction.
 */
export function getSiblingListItem(
	modelItem: ModelItem | null,
	options: {
		sameIndent?: boolean;
		smallerIndent?: boolean;
		listIndent?: number;
		direction?: 'forward' | 'backward';
	}
): ModelElement | null {
	const sameIndent = !!options.sameIndent;
	const smallerIndent = !!options.smallerIndent;
	const indent = options.listIndent;

	let item: any = modelItem;

	while ( item && item.name == 'listItem' ) {
		const itemIndent = item.getAttribute( 'listIndent' ) as number;

		if ( ( sameIndent && indent == itemIndent ) || ( smallerIndent && indent as number > itemIndent ) ) {
			return item;
		}

		if ( options.direction === 'forward' ) {
			item = item.nextSibling;
		} else {
			item = item.previousSibling;
		}
	}

	return null;
}

/**
 * Returns a first list view element that is direct child of the given view element.
 *
 * @internal
 */
export function findNestedList( viewElement: ViewElement ): ViewElement | null {
	for ( const node of ( viewElement.getChildren() as Iterable<ViewElement> ) ) {
		if ( node.name == 'ul' || node.name == 'ol' ) {
			return node;
		}
	}

	return null;
}

/**
 * Returns an array with all `listItem` elements that represent the same list.
 *
 * It means that values of `listIndent`, `listType`, `listStyle`, `listReversed` and `listStart` for all items are equal.
 *
 * Additionally, if the `position` is inside a list item, that list item will be returned as well.
 *
 * @internal
 * @param position Starting position.
 * @param direction Walking direction.
 */
export function getSiblingNodes( position: ModelPosition, direction: 'forward' | 'backward' ): Array<ModelElement> {
	const items: Array<ModelElement> = [];
	const listItem = position.parent as ModelElement;
	const walkerOptions = {
		ignoreElementEnd: false,
		startPosition: position,
		shallow: true,
		direction
	};
	const limitIndent = listItem.getAttribute( 'listIndent' ) as number;
	const nodes = [ ...new ModelTreeWalker( walkerOptions ) ]
		.filter( value => value.item.is( 'element' ) )
		.map( value => value.item );

	for ( const element of nodes ) {
		// If found something else than `listItem`, we're out of the list scope.
		if ( !element.is( 'element', 'listItem' ) ) {
			break;
		}

		// If current parsed item has lower indent that element that the element that was a starting point,
		// it means we left a nested list. Abort searching items.
		//
		// ■ List item 1.       [listIndent=0]
		//     ○ List item 2.[] [listIndent=1], limitIndent = 1,
		//     ○ List item 3.   [listIndent=1]
		// ■ List item 4.       [listIndent=0]
		//
		// Abort searching when leave nested list.
		if ( ( element.getAttribute( 'listIndent' ) as number ) < limitIndent ) {
			break;
		}

		// ■ List item 1.[]     [listIndent=0] limitIndent = 0,
		//     ○ List item 2.   [listIndent=1]
		//     ○ List item 3.   [listIndent=1]
		// ■ List item 4.       [listIndent=0]
		//
		// Ignore nested lists.
		if ( ( element.getAttribute( 'listIndent' ) as number ) > limitIndent ) {
			continue;
		}

		// ■ List item 1.[]  [listType=bulleted]
		// 1. List item 2.   [listType=numbered]
		// 2.List item 3.    [listType=numbered]
		//
		// Abort searching when found a different kind of a list.
		if ( element.getAttribute( 'listType' ) !== listItem.getAttribute( 'listType' ) ) {
			break;
		}

		// ■ List item 1.[]  [listType=bulleted]
		// ■ List item 2.    [listType=bulleted]
		// ○ List item 3.    [listType=bulleted]
		// ○ List item 4.    [listType=bulleted]
		//
		// Abort searching when found a different list style,
		if ( element.getAttribute( 'listStyle' ) !== listItem.getAttribute( 'listStyle' ) ) {
			break;
		}

		// ... different direction
		if ( element.getAttribute( 'listReversed' ) !== listItem.getAttribute( 'listReversed' ) ) {
			break;
		}

		// ... and different start index
		if ( element.getAttribute( 'listStart' ) !== listItem.getAttribute( 'listStart' ) ) {
			break;
		}

		if ( direction === 'backward' ) {
			items.unshift( element );
		} else {
			items.push( element );
		}
	}

	return items;
}

/**
 * Returns an array with all `listItem` elements in the model selection.
 *
 * It returns all the items even if only a part of the list is selected, including items that belong to nested lists.
 * If no list is selected, it returns an empty array.
 * The order of the elements is not specified.
 *
 * @internal
 */
export function getSelectedListItems( model: Model ): Array<ModelElement> {
	const document = model.document;

	// For all selected blocks find all list items that are being selected
	// and update the `listStyle` attribute in those lists.
	let listItems = [ ...document.selection.getSelectedBlocks() ]
		.filter( element => element.is( 'element', 'listItem' ) )
		.map( element => {
			const position = model.change( writer => writer.createPositionAt( element, 0 ) );

			return [
				...getSiblingNodes( position, 'backward' ),
				...getSiblingNodes( position, 'forward' )
			];
		} )
		.flat();

	// Since `getSelectedBlocks()` can return items that belong to the same list, and
	// `getSiblingNodes()` returns the entire list, we need to remove duplicated items.
	listItems = [ ...new Set( listItems ) ];

	return listItems;
}

const BULLETED_LIST_STYLE_TYPES = [ 'disc', 'circle', 'square' ];

// There's a lot of them (https://www.w3.org/TR/css-counter-styles-3/#typedef-counter-style).
// Let's support only those that can be selected by ListPropertiesUI.
const NUMBERED_LIST_STYLE_TYPES = [
	'decimal',
	'decimal-leading-zero',
	'lower-roman',
	'upper-roman',
	'lower-latin',
	'upper-latin'
];

/**
 * Checks whether the given list-style-type is supported by numbered or bulleted list.
 *
 * @internal
 */
export function getListTypeFromListStyleType( listStyleType: string ): 'bulleted' | 'numbered' | null {
	if ( BULLETED_LIST_STYLE_TYPES.includes( listStyleType ) ) {
		return 'bulleted';
	}

	if ( NUMBERED_LIST_STYLE_TYPES.includes( listStyleType ) ) {
		return 'numbered';
	}

	return null;
}

/**
 * Implementation of getFillerOffset for view list item element.
 *
 * @returns Block filler offset or `null` if block filler is not needed.
 */
function getListItemFillerOffset( this: any ): number | null {
	const hasOnlyLists = !this.isEmpty && ( this.getChild( 0 ).name == 'ul' || this.getChild( 0 ).name == 'ol' );

	if ( this.isEmpty || hasOnlyLists ) {
		return 0;
	}

	return getViewFillerOffset.call( this );
}
