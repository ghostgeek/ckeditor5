/**
 * @license Copyright (c) 2003-2025, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-licensing-options
 */

/**
 * @module highlight/highlightediting
 */

import { Plugin, type Editor } from 'ckeditor5/src/core.js';

import { HighlightCommand } from './highlightcommand.js';
import type { HighlightOption } from './highlightconfig.js';

/**
 * The highlight editing feature. It introduces the {@link module:highlight/highlightcommand~HighlightCommand command} and the `highlight`
 * attribute in the {@link module:engine/model/model~Model model} which renders in the {@link module:engine/view/view view}
 * as a `<mark>` element with a `class` attribute (`<mark class="marker-green">...</mark>`) depending
 * on the {@link module:highlight/highlightconfig~HighlightConfig configuration}.
 */
export class HighlightEditing extends Plugin {
	/**
	 * @inheritDoc
	 */
	public static get pluginName() {
		return 'HighlightEditing' as const;
	}

	/**
	 * @inheritDoc
	 */
	public static override get isOfficialPlugin(): true {
		return true;
	}

	/**
	 * @inheritDoc
	 */
	constructor( editor: Editor ) {
		super( editor );

		editor.config.define( 'highlight', {
			options: [
				{
					model: 'yellowMarker',
					class: 'marker-yellow',
					title: 'Yellow marker',
					color: 'var(--ck-content-highlight-marker-yellow)',
					type: 'marker'
				},
				{
					model: 'greenMarker',
					class: 'marker-green',
					title: 'Green marker',
					color: 'var(--ck-content-highlight-marker-green)',
					type: 'marker'
				},
				{
					model: 'pinkMarker',
					class: 'marker-pink',
					title: 'Pink marker',
					color: 'var(--ck-content-highlight-marker-pink)',
					type: 'marker'
				},
				{
					model: 'blueMarker',
					class: 'marker-blue',
					title: 'Blue marker',
					color: 'var(--ck-content-highlight-marker-blue)',
					type: 'marker'
				},
				{
					model: 'redPen',
					class: 'pen-red',
					title: 'Red pen',
					color: 'var(--ck-content-highlight-pen-red)',
					type: 'pen'
				},
				{
					model: 'greenPen',
					class: 'pen-green',
					title: 'Green pen',
					color: 'var(--ck-content-highlight-pen-green)',
					type: 'pen'
				}
			]
		} );
	}

	/**
	 * @inheritDoc
	 */
	public init(): void {
		const editor = this.editor;

		// Allow highlight attribute on text nodes.
		editor.model.schema.extend( '$text', { allowAttributes: 'highlight' } );

		const options = editor.config.get( 'highlight.options' )!;

		// Set-up the two-way conversion.
		editor.conversion.attributeToElement( _buildDefinition( options ) );

		editor.commands.add( 'highlight', new HighlightCommand( editor ) );
	}
}

/**
 * Converts the options array to a converter definition.
 *
 * @param options An array with configured options.
 */
function _buildDefinition( options: Array<HighlightOption> ): HighlightConverterDefinition {
	const definition: HighlightConverterDefinition = {
		model: {
			key: 'highlight',
			values: []
		},
		view: {}
	};

	for ( const option of options ) {
		definition.model.values.push( option.model );
		definition.view[ option.model ] = {
			name: 'mark',
			classes: option.class
		};
	}

	return definition;
}

type HighlightConverterDefinition = {
	model: { key: string; values: Array<string> };
	view: Record<string, { name: string; classes: string }>;
};
