/**
 * @license Copyright (c) 2003-2025, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-licensing-options
 */

/**
 * @module engine/model/utils/selection-post-fixer
 */

import { ModelPosition } from '../position.js';
import { ModelRange } from '../range.js';

import { type ModelDocumentFragment } from '../documentfragment.js';
import { type Model } from '../model.js';
import { type ModelNode } from '../node.js';
import { type ModelSchema } from '../schema.js';
import { type ModelWriter } from '../writer.js';
import { type ModelElement } from '../element.js';

/**
 * Injects selection post-fixer to the model.
 *
 * The role of the selection post-fixer is to ensure that the selection is in a correct place
 * after a {@link module:engine/model/model~Model#change `change()`} block was executed.
 *
 * The correct position means that:
 *
 * * All collapsed selection ranges are in a place where the {@link module:engine/model/schema~ModelSchema}
 * allows a `$text`.
 * * None of the selection's non-collapsed ranges crosses a {@link module:engine/model/schema~ModelSchema#isLimit limit element}
 * boundary (a range must be rooted within one limit element).
 * * Only {@link module:engine/model/schema~ModelSchema#isSelectable selectable elements} can be selected from the outside
 * (e.g. `[<paragraph>foo</paragraph>]` is invalid). This rule applies independently to both selection ends, so this
 * selection is correct: `<paragraph>f[oo</paragraph><imageBlock></imageBlock>]`.
 *
 * If the position is not correct, the post-fixer will automatically correct it.
 *
 * ## Fixing a non-collapsed selection
 *
 * See as an example a selection that starts in a P1 element and ends inside the text of a TD element
 * (`[` and `]` are range boundaries and `(l)` denotes an element defined as `isLimit=true`):
 *
 * ```
 * root
 *  |- element P1
 *  |   |- "foo"                                      root
 *  |- element TABLE (l)                   P1         TABLE             P2
 *  |   |- element TR (l)                 f o[o     TR      TR         b a r
 *  |   |   |- element TD (l)                       TD      TD
 *  |   |       |- "aaa"                          a]a a    b b b
 *  |   |- element TR (l)
 *  |   |   |- element TD (l)                           ||
 *  |   |       |- "bbb"                                ||
 *  |- element P2                                       VV
 *  |   |- "bar"
 *                                                    root
 *                                         P1         TABLE]            P2
 *                                        f o[o     TR      TR         b a r
 *                                                  TD      TD
 *                                                a a a    b b b
 * ```
 *
 * In the example above, the TABLE, TR and TD are defined as `isLimit=true` in the schema. The range which is not contained within
 * a single limit element must be expanded to select the outermost limit element. The range end is inside the text node of the TD element.
 * As the TD element is a child of the TR and TABLE elements, where both are defined as `isLimit=true` in the schema, the range must be
 * expanded to select the whole TABLE element.
 *
 * **Note** If the selection contains multiple ranges, the method returns a minimal set of ranges that are not intersecting after expanding
 * them to select `isLimit=true` elements.
 *
 * @internal
 */
export function injectSelectionPostFixer( model: Model ): void {
	model.document.registerPostFixer( writer => selectionPostFixer( writer, model ) );
}

/**
 * The selection post-fixer.
 */
function selectionPostFixer( writer: ModelWriter, model: Model ): boolean {
	const selection = model.document.selection;
	const schema = model.schema;

	const ranges = [];

	let wasFixed = false;

	for ( const modelRange of selection.getRanges() ) {
		// Go through all ranges in selection and try fixing each of them.
		// Those ranges might overlap but will be corrected later.
		const correctedRange = tryFixingRange( modelRange, schema );

		// "Selection fixing" algorithms sometimes get lost. In consequence, it may happen
		// that a new range is returned but, in fact, it has the same positions as the original
		// range anyway. If this range is not discarded, a new selection will be set and that,
		// for instance, would destroy the selection attributes. Let's make sure that the post-fixer
		// actually worked first before setting a new selection.
		//
		// https://github.com/ckeditor/ckeditor5/issues/6693
		if ( correctedRange && !correctedRange.isEqual( modelRange ) ) {
			ranges.push( correctedRange );
			wasFixed = true;
		} else {
			ranges.push( modelRange );
		}
	}

	// If any of ranges were corrected update the selection.
	if ( wasFixed ) {
		writer.setSelection( mergeIntersectingRanges( ranges ), { backward: selection.isBackward } );
	}

	return false;
}

/**
 * Tries fixing a range if it's incorrect.
 *
 * **Note:** This helper is used by the selection post-fixer and to fix the `beforeinput` target ranges.
 *
 * @returns Returns fixed range or null if range is valid.
 * @internal
 */
export function tryFixingRange( range: ModelRange, schema: ModelSchema ): ModelRange | null {
	if ( range.isCollapsed ) {
		return tryFixingCollapsedRange( range, schema );
	}

	return tryFixingNonCollapsedRage( range, schema );
}

/**
 * Tries to fix collapsed ranges.
 *
 * * Fixes situation when a range is in a place where $text is not allowed
 *
 * @param range Collapsed range to fix.
 * @returns Returns fixed range or null if range is valid.
 */
function tryFixingCollapsedRange( range: ModelRange, schema: ModelSchema ) {
	const originalPosition = range.start;

	const nearestSelectionRange = schema.getNearestSelectionRange( originalPosition );

	// This might be null, i.e. when the editor data is empty or the selection is inside a limit element
	// that doesn't allow text inside.
	// In the first case, there is no need to fix the selection range.
	// In the second, let's go up to the outer selectable element
	if ( !nearestSelectionRange ) {
		const ancestorObject = originalPosition.getAncestors().reverse().find( ( item ): item is ModelElement => schema.isObject( item ) );

		if ( ancestorObject ) {
			return ModelRange._createOn( ancestorObject );
		}

		return null;
	}

	if ( !nearestSelectionRange.isCollapsed ) {
		return nearestSelectionRange;
	}

	const fixedPosition = nearestSelectionRange.start;

	// Fixed position is the same as original - no need to return corrected range.
	if ( originalPosition.isEqual( fixedPosition ) ) {
		return null;
	}

	return new ModelRange( fixedPosition );
}

/**
 * Tries to fix an expanded range.
 *
 * @param range Expanded range to fix.
 * @returns Returns fixed range or null if range is valid.
 */
function tryFixingNonCollapsedRage( range: ModelRange, schema: ModelSchema ) {
	const { start, end } = range;

	const isTextAllowedOnStart = schema.checkChild( start, '$text' );
	const isTextAllowedOnEnd = schema.checkChild( end, '$text' );

	const startLimitElement = schema.getLimitElement( start );
	const endLimitElement = schema.getLimitElement( end );

	// Ranges which both end are inside the same limit element (or root) might needs only minor fix.
	if ( startLimitElement === endLimitElement ) {
		// Range is valid when both position allows to place a text:
		// - <block>f[oobarba]z</block>
		// This would be "fixed" by a next check but as it will be the same it's better to return null so the selection stays the same.
		if ( isTextAllowedOnStart && isTextAllowedOnEnd ) {
			return null;
		}

		// Range that is on non-limit element (or is partially) must be fixed so it is placed inside the block around $text:
		// - [<block>foo</block>]    ->    <block>[foo]</block>
		// - [<block>foo]</block>    ->    <block>[foo]</block>
		// - <block>f[oo</block>]    ->    <block>f[oo]</block>
		// - [<block>foo</block><selectable></selectable>]    ->    <block>[foo</block><selectable></selectable>]
		if ( checkSelectionOnNonLimitElements( start, end, schema ) ) {
			const isStartBeforeSelectable = start.nodeAfter && schema.isSelectable( start.nodeAfter );
			const fixedStart = isStartBeforeSelectable ? null : schema.getNearestSelectionRange( start, 'forward' );

			const isEndAfterSelectable = end.nodeBefore && schema.isSelectable( end.nodeBefore );
			const fixedEnd = isEndAfterSelectable ? null : schema.getNearestSelectionRange( end, 'backward' );

			// The schema.getNearestSelectionRange might return null - if that happens use original position.
			const rangeStart = fixedStart ? fixedStart.start : start;
			const rangeEnd = fixedEnd ? fixedEnd.end : end;

			return new ModelRange( rangeStart, rangeEnd );
		}
	}

	const isStartInLimit = startLimitElement && !startLimitElement.is( 'rootElement' );
	const isEndInLimit = endLimitElement && !endLimitElement.is( 'rootElement' );

	// At this point we eliminated valid positions on text nodes so if one of range positions is placed inside a limit element
	// then the range crossed limit element boundaries and needs to be fixed.
	if ( isStartInLimit || isEndInLimit ) {
		const bothInSameParent = ( start.nodeAfter && end.nodeBefore ) && start.nodeAfter.parent === end.nodeBefore.parent;

		const expandStart = isStartInLimit && ( !bothInSameParent || !isSelectable( start.nodeAfter, schema ) );
		const expandEnd = isEndInLimit && ( !bothInSameParent || !isSelectable( end.nodeBefore, schema ) );

		// Although we've already found limit element on start/end positions we must find the outer-most limit element.
		// as limit elements might be nested directly inside (ie table > tableRow > tableCell).
		let fixedStart = start;
		let fixedEnd = end;

		if ( expandStart ) {
			fixedStart = ModelPosition._createBefore( findOutermostLimitAncestor( startLimitElement, schema ) );
		}

		if ( expandEnd ) {
			fixedEnd = ModelPosition._createAfter( findOutermostLimitAncestor( endLimitElement, schema ) );
		}

		return new ModelRange( fixedStart, fixedEnd );
	}

	// Range was not fixed at this point so it is valid - ie it was placed around limit element already.
	return null;
}

/**
 * Finds the outer-most ancestor.
 */
function findOutermostLimitAncestor( startingNode: ModelNode, schema: ModelSchema ): ModelNode {
	let isLimitNode = startingNode;
	let parent: ModelNode | ModelDocumentFragment = isLimitNode;

	// Find outer most isLimit block as such blocks might be nested (ie. in tables).
	while ( schema.isLimit( parent ) && parent.parent ) {
		isLimitNode = parent;
		parent = parent.parent;
	}

	return isLimitNode;
}

/**
 * Checks whether any of range boundaries is placed around non-limit elements.
 */
function checkSelectionOnNonLimitElements( start: ModelPosition, end: ModelPosition, schema: ModelSchema ) {
	const startIsOnBlock = ( start.nodeAfter && !schema.isLimit( start.nodeAfter ) ) || schema.checkChild( start, '$text' );
	const endIsOnBlock = ( end.nodeBefore && !schema.isLimit( end.nodeBefore ) ) || schema.checkChild( end, '$text' );

	// We should fix such selection when one of those nodes needs fixing.
	return startIsOnBlock || endIsOnBlock;
}

/**
 * Returns a minimal non-intersecting array of ranges without duplicates.
 *
 * @param ranges Ranges to merge.
 * @returns Array of unique and non-intersecting ranges.
 * @internal
 */
export function mergeIntersectingRanges( ranges: Array<ModelRange> ): Array<ModelRange> {
	const rangesToMerge = [ ...ranges ];
	const rangeIndexesToRemove = new Set();
	let currentRangeIndex = 1;

	while ( currentRangeIndex < rangesToMerge.length ) {
		const currentRange = rangesToMerge[ currentRangeIndex ];
		const previousRanges = rangesToMerge.slice( 0, currentRangeIndex );

		for ( const [ previousRangeIndex, previousRange ] of previousRanges.entries() ) {
			if ( rangeIndexesToRemove.has( previousRangeIndex ) ) {
				continue;
			}

			if ( currentRange.isEqual( previousRange ) ) {
				rangeIndexesToRemove.add( previousRangeIndex );
			} else if ( currentRange.isIntersecting( previousRange ) ) {
				rangeIndexesToRemove.add( previousRangeIndex );
				rangeIndexesToRemove.add( currentRangeIndex );

				const mergedRange = currentRange.getJoined( previousRange );
				rangesToMerge.push( mergedRange! );
			}
		}

		currentRangeIndex++;
	}

	const nonIntersectingRanges = rangesToMerge.filter( ( _, index ) => !rangeIndexesToRemove.has( index ) );

	return nonIntersectingRanges;
}

/**
 * Checks if node exists and if it's a selectable.
 */
function isSelectable( node: ModelNode, schema: ModelSchema ) {
	return node && schema.isSelectable( node );
}
