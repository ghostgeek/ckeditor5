/**
 * @license Copyright (c) 2003-2025, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-licensing-options
 */

/**
 * @module engine/model/operation/nooperation
 */

import { Operation } from './operation.js';
import type { ModelSelectable } from '../selection.js';

/**
 * Operation which is doing nothing ("empty operation", "do-nothing operation", "noop"). This is an operation,
 * which when executed does not change the tree model. It still has some parameters defined for transformation purposes.
 *
 * In most cases this operation is a result of transforming operations. When transformation returns
 * {@link module:engine/model/operation/nooperation~NoOperation} it means that changes done by the transformed operation
 * have already been applied.
 */
export class NoOperation extends Operation {
	public get type(): 'noop' {
		return 'noop';
	}

	/**
	 * @inheritDoc
	 */
	public get affectedSelectable(): ModelSelectable {
		return null;
	}

	/**
	 * Creates and returns an operation that has the same parameters as this operation.
	 */
	public clone(): NoOperation {
		return new NoOperation( this.baseVersion );
	}

	/**
	 * See {@link module:engine/model/operation/operation~Operation#getReversed `Operation#getReversed()`}.
	 */
	public getReversed(): Operation {
		return new NoOperation( this.baseVersion! + 1 );
	}

	/** @internal */
	public _execute(): void {
	}

	/**
	 * @inheritDoc
	 */
	public static override get className(): string {
		return 'NoOperation';
	}

	// @if CK_DEBUG_ENGINE // public override toString(): string {
	// @if CK_DEBUG_ENGINE // 	return `NoOperation( ${ this.baseVersion } )`;
	// @if CK_DEBUG_ENGINE // }
}
