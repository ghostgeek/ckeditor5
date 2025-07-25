/**
 * @license Copyright (c) 2003-2025, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-licensing-options
 */

/**
 * @module engine/model/operation/markeroperation
 */

import { Operation } from './operation.js';
import { ModelRange } from '../range.js';

import { type ModelDocument } from '../document.js';
import { type MarkerCollection } from '../markercollection.js';
import type { ModelSelectable } from '../selection.js';

export class MarkerOperation extends Operation {
	/**
	 * Marker name.
	 *
	 * @readonly
	 */
	public name: string;

	/**
	 * Marker range before the change.
	 *
	 * @readonly
	 */
	public oldRange: ModelRange | null;

	/**
	 * Marker range after the change.
	 *
	 * @readonly
	 */
	public newRange: ModelRange | null;

	/**
	 * Specifies whether the marker operation affects the data produced by the data pipeline
	 * (is persisted in the editor's data).
	 *
	 * @readonly
	 */
	public affectsData: boolean;

	/**
	 * Marker collection on which change should be executed.
	 */
	private readonly _markers: MarkerCollection;

	/**
	 * @param name Marker name.
	 * @param oldRange Marker range before the change.
	 * @param newRange Marker range after the change.
	 * @param markers Marker collection on which change should be executed.
	 * @param affectsData Specifies whether the marker operation affects the data produced by the data pipeline
	 * (is persisted in the editor's data).
	 * @param baseVersion Document {@link module:engine/model/document~ModelDocument#version} on which operation
	 * can be applied or `null` if the operation operates on detached (non-document) tree.
	 */
	constructor(
		name: string,
		oldRange: ModelRange | null,
		newRange: ModelRange | null,
		markers: MarkerCollection,
		affectsData: boolean,
		baseVersion: number | null
	) {
		super( baseVersion );

		this.name = name;
		this.oldRange = oldRange ? oldRange.clone() : null;
		this.newRange = newRange ? newRange.clone() : null;
		this.affectsData = affectsData;

		this._markers = markers;
	}

	/**
	 * @inheritDoc
	 */
	public get type(): 'marker' {
		return 'marker';
	}

	/**
	 * @inheritDoc
	 */
	public get affectedSelectable(): ModelSelectable {
		const ranges = [];

		if ( this.oldRange ) {
			ranges.push( this.oldRange.clone() );
		}

		if ( this.newRange ) {
			if ( this.oldRange ) {
				ranges.push( ...this.newRange.getDifference( this.oldRange ) );
			} else {
				ranges.push( this.newRange.clone() );
			}
		}

		return ranges;
	}

	/**
	 * Creates and returns an operation that has the same parameters as this operation.
	 */
	public clone(): MarkerOperation {
		return new MarkerOperation( this.name, this.oldRange, this.newRange, this._markers, this.affectsData, this.baseVersion );
	}

	/**
	 * See {@link module:engine/model/operation/operation~Operation#getReversed `Operation#getReversed()`}.
	 */
	public getReversed(): Operation {
		return new MarkerOperation( this.name, this.newRange, this.oldRange, this._markers, this.affectsData, this.baseVersion! + 1 );
	}

	/**
	 * @inheritDoc
	 * @internal
	 */
	public _execute(): void {
		if ( this.newRange ) {
			this._markers._set( this.name, this.newRange, true, this.affectsData );
		} else {
			this._markers._remove( this.name );
		}
	}

	/**
	 * @inheritDoc
	 * @internal
	 */
	public override toJSON(): unknown {
		const json: any = super.toJSON();

		if ( this.oldRange ) {
			json.oldRange = this.oldRange.toJSON();
		}

		if ( this.newRange ) {
			json.newRange = this.newRange.toJSON();
		}

		delete json._markers;

		return json;
	}

	/**
	 * @inheritDoc
	 */
	public static override get className(): string {
		return 'MarkerOperation';
	}

	/**
	 * Creates `MarkerOperation` object from deserialized object, i.e. from parsed JSON string.
	 *
	 * @param json Deserialized JSON object.
	 * @param document Document on which this operation will be applied.
	 */
	public static override fromJSON( json: any, document: ModelDocument ): MarkerOperation {
		return new MarkerOperation(
			json.name,
			json.oldRange ? ModelRange.fromJSON( json.oldRange, document ) : null,
			json.newRange ? ModelRange.fromJSON( json.newRange, document ) : null,
			document.model.markers,
			json.affectsData,
			json.baseVersion
		);
	}

	// @if CK_DEBUG_ENGINE // public override toString(): string {
	// @if CK_DEBUG_ENGINE // 	return `MarkerOperation( ${ this.baseVersion } ): ` +
	// @if CK_DEBUG_ENGINE //		`"${ this.name }": ${ this.oldRange } -> ${ this.newRange }`;
	// @if CK_DEBUG_ENGINE // }
}
