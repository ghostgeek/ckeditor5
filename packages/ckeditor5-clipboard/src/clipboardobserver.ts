/**
 * @license Copyright (c) 2003-2025, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-licensing-options
 */

/**
 * @module clipboard/clipboardobserver
 */

import { EventInfo, getRangeFromMouseEvent } from '@ckeditor/ckeditor5-utils';

import {
	ViewDataTransfer,
	DomEventObserver,
	type ViewDocumentDomEventData,
	type EditingView,
	type ViewDocumentFragment,
	type ViewElement,
	type ViewRange
} from '@ckeditor/ckeditor5-engine';

/**
 * Clipboard events observer.
 *
 * Fires the following events:
 *
 * * {@link module:engine/view/document~ViewDocument#event:clipboardInput},
 * * {@link module:engine/view/document~ViewDocument#event:paste},
 * * {@link module:engine/view/document~ViewDocument#event:copy},
 * * {@link module:engine/view/document~ViewDocument#event:cut},
 * * {@link module:engine/view/document~ViewDocument#event:drop},
 * * {@link module:engine/view/document~ViewDocument#event:dragover},
 * * {@link module:engine/view/document~ViewDocument#event:dragging},
 * * {@link module:engine/view/document~ViewDocument#event:dragstart},
 * * {@link module:engine/view/document~ViewDocument#event:dragend},
 * * {@link module:engine/view/document~ViewDocument#event:dragenter},
 * * {@link module:engine/view/document~ViewDocument#event:dragleave}.
 *
 * **Note**: This observer is not available by default (ckeditor5-engine does not add it on its own).
 * To make it available, it needs to be added to {@link module:engine/view/document~ViewDocument} by using
 * the {@link module:engine/view/view~EditingView#addObserver `View#addObserver()`} method. Alternatively, you can load the
 * {@link module:clipboard/clipboard~Clipboard} plugin which adds this observer automatically (because it uses it).
 */
export class ClipboardObserver extends DomEventObserver<
	'paste' | 'copy' | 'cut' | 'drop' | 'dragover' | 'dragstart' | 'dragend' | 'dragenter' | 'dragleave',
	ClipboardEventData
> {
	public readonly domEventType = [
		'paste', 'copy', 'cut', 'drop', 'dragover', 'dragstart', 'dragend', 'dragenter', 'dragleave'
	] as const;

	constructor( view: EditingView ) {
		super( view );

		const viewDocument = this.document;

		this.listenTo<ViewDocumentPasteEvent>( viewDocument, 'paste', handleInput( 'clipboardInput' ), { priority: 'low' } );
		this.listenTo<ViewDocumentDropEvent>( viewDocument, 'drop', handleInput( 'clipboardInput' ), { priority: 'low' } );
		this.listenTo<ViewDocumentDragOverEvent>( viewDocument, 'dragover', handleInput( 'dragging' ), { priority: 'low' } );

		function handleInput( type: 'clipboardInput' | 'dragging' ) {
			return ( evt: EventInfo, data: ViewDocumentDomEventData & ClipboardEventData ) => {
				data.preventDefault();

				const targetRanges = data.dropRange ? [ data.dropRange ] : null;
				const eventInfo = new EventInfo( viewDocument, type );

				viewDocument.fire( eventInfo, {
					dataTransfer: data.dataTransfer,
					method: evt.name,
					targetRanges,
					target: data.target,
					domEvent: data.domEvent
				} );

				// If CKEditor handled the input, do not bubble the original event any further.
				// This helps external integrations recognize that fact and act accordingly.
				// https://github.com/ckeditor/ckeditor5-upload/issues/92
				if ( eventInfo.stop.called ) {
					data.stopPropagation();
				}
			};
		}
	}

	public onDomEvent( domEvent: ClipboardEvent | DragEvent ): void {
		const nativeDataTransfer = 'clipboardData' in domEvent ? domEvent.clipboardData! : domEvent.dataTransfer!;
		const cacheFiles = domEvent.type == 'drop' || domEvent.type == 'paste';

		const evtData: ClipboardEventData = {
			dataTransfer: new ViewDataTransfer( nativeDataTransfer, { cacheFiles } )
		};

		if ( domEvent.type == 'drop' || domEvent.type == 'dragover' ) {
			const domRange = getRangeFromMouseEvent( domEvent as DragEvent );

			evtData.dropRange = domRange && this.view.domConverter.domRangeToView( domRange );
		}

		this.fire( domEvent.type, domEvent, evtData );
	}
}

/**
 * The data of 'paste', 'copy', 'cut', 'drop', 'dragover', 'dragstart', 'dragend', 'dragenter' and 'dragleave' events.
 */
export interface ClipboardEventData {

	/**
	 * The data transfer instance.
	 */
	dataTransfer: ViewDataTransfer;

	/**
	 * The position into which the content is dropped.
	 */
	dropRange?: ViewRange | null;
}

/**
 * Fired as a continuation of the {@link module:engine/view/document~ViewDocument#event:paste} and
 * {@link module:engine/view/document~ViewDocument#event:drop} events.
 *
 * It is a part of the {@glink framework/deep-dive/clipboard#input-pipeline clipboard input pipeline}.
 *
 * This event carries a `dataTransfer` object which comes from the clipboard and whose content should be processed
 * and inserted into the editor.
 *
 * **Note**: This event is not available by default. To make it available, {@link module:clipboard/clipboardobserver~ClipboardObserver}
 * needs to be added to the {@link module:engine/view/document~ViewDocument} by using the
 * {@link module:engine/view/view~EditingView#addObserver} method. This is usually done by the {@link module:clipboard/clipboard~Clipboard}
 * plugin, but if for some reason it is not loaded, the observer must be added manually.
 *
 * @see module:clipboard/clipboardobserver~ClipboardObserver
 * @see module:clipboard/clipboard~Clipboard
 *
 * @eventName module:engine/view/document~ViewDocument#clipboardInput
 * @param data The event data.
 */
export type ViewDocumentClipboardInputEvent = {
	name: 'clipboardInput';
	args: [ data: ViewDocumentDomEventData<ClipboardEvent | DragEvent> & ClipboardInputEventData ];
};

/**
 * The value of the {@link module:engine/view/document~ViewDocument#event:paste},
 * {@link module:engine/view/document~ViewDocument#event:copy} and {@link module:engine/view/document~ViewDocument#event:cut} events.
 *
 * In order to access the clipboard data, use the `dataTransfer` property.
 */
export interface ClipboardInputEventData {

	/**
	 * Data transfer instance.
	 */
	dataTransfer: ViewDataTransfer;

	/**
	 * Whether the event was triggered by a paste or a drop operation.
	 */
	method: 'paste' | 'drop';

	/**
	 * The tree view element representing the target.
	 */
	target: ViewElement;

	/**
	 * The ranges which are the target of the operation (usually – into which the content should be inserted).
	 * If the clipboard input was triggered by a paste operation, this property is not set. If by a drop operation,
	 * then it is the drop position (which can be different than the selection at the moment of the drop).
	 */
	targetRanges: Array<ViewRange> | null;

	/**
	 * The content of clipboard input.
	 */
	content?: ViewDocumentFragment;
}

/**
 * Fired when the user drags the content over one of the editing roots of the editor.
 *
 * Introduced by {@link module:clipboard/clipboardobserver~ClipboardObserver}.
 *
 * **Note**: This event is not available by default. To make it available, {@link module:clipboard/clipboardobserver~ClipboardObserver}
 * needs to be added to the {@link module:engine/view/document~ViewDocument} by using the
 * {@link module:engine/view/view~EditingView#addObserver} method. This is usually done by the {@link module:clipboard/clipboard~Clipboard}
 * plugin, but if for some reason it is not loaded, the observer must be added manually.
 *
 * @see module:engine/view/document~ViewDocument#event:clipboardInput
 *
 * @eventName module:engine/view/document~ViewDocument#dragover
 * @param data The event data.
 */
export type ViewDocumentDragOverEvent = {
	name: 'dragover';
	args: [ data: ViewDocumentDomEventData<DragEvent> & ClipboardEventData ];
};

/**
 * Fired when the user dropped the content into one of the editing roots of the editor.
 *
 * Introduced by {@link module:clipboard/clipboardobserver~ClipboardObserver}.
 *
 * **Note**: This event is not available by default. To make it available, {@link module:clipboard/clipboardobserver~ClipboardObserver}
 * needs to be added to the {@link module:engine/view/document~ViewDocument} by using the
 * {@link module:engine/view/view~EditingView#addObserver} method. This is usually done by the {@link module:clipboard/clipboard~Clipboard}
 * plugin, but if for some reason it is not loaded, the observer must be added manually.
 *
 * @see module:engine/view/document~ViewDocument#event:clipboardInput
 *
 * @eventName module:engine/view/document~ViewDocument#drop
 * @param data The event data.
 */
export type ViewDocumentDropEvent = {
	name: 'drop';
	args: [ data: ViewDocumentDomEventData<DragEvent> & ClipboardEventData ];
};

/**
 * Fired when the user pasted the content into one of the editing roots of the editor.
 *
 * Introduced by {@link module:clipboard/clipboardobserver~ClipboardObserver}.
 *
 * **Note**: This event is not available by default. To make it available, {@link module:clipboard/clipboardobserver~ClipboardObserver}
 * needs to be added to the {@link module:engine/view/document~ViewDocument} by using the
 * {@link module:engine/view/view~EditingView#addObserver} method. This is usually done by the {@link module:clipboard/clipboard~Clipboard}
 * plugin, but if for some reason it is not loaded, the observer must be added manually.
 *
 * @see module:engine/view/document~ViewDocument#event:clipboardInput
 *
 * @eventName module:engine/view/document~ViewDocument#paste
 * @param {module:clipboard/clipboardobserver~ClipboardEventData} data The event data.
 */
export type ViewDocumentPasteEvent = {
	name: 'paste';
	args: [ data: ViewDocumentDomEventData<ClipboardEvent> & ClipboardEventData ];
};

/**
 * Fired when the user copied the content from one of the editing roots of the editor.
 *
 * Introduced by {@link module:clipboard/clipboardobserver~ClipboardObserver}.
 *
 * **Note**: This event is not available by default. To make it available, {@link module:clipboard/clipboardobserver~ClipboardObserver}
 * needs to be added to the {@link module:engine/view/document~ViewDocument} by using the
 * {@link module:engine/view/view~EditingView#addObserver} method. This is usually done by the {@link module:clipboard/clipboard~Clipboard}
 * plugin, but if for some reason it is not loaded, the observer must be added manually.
 *
 * @see module:clipboard/clipboardobserver~ClipboardObserver
 *
 * @eventName module:engine/view/document~ViewDocument#copy
 * @param data The event data.
 */
export type ViewDocumentCopyEvent = {
	name: 'copy';
	args: [ data: ViewDocumentDomEventData<ClipboardEvent> & ClipboardEventData ];
};

/**
 * Fired when the user cut the content from one of the editing roots of the editor.
 *
 * Introduced by {@link module:clipboard/clipboardobserver~ClipboardObserver}.
 *
 * **Note**: This event is not available by default. To make it available, {@link module:clipboard/clipboardobserver~ClipboardObserver}
 * needs to be added to the {@link module:engine/view/document~ViewDocument} by using the
 * {@link module:engine/view/view~EditingView#addObserver} method. This is usually done by the {@link module:clipboard/clipboard~Clipboard}
 * plugin, but if for some reason it is not loaded, the observer must be added manually.
 *
 * @see module:clipboard/clipboardobserver~ClipboardObserver
 *
 * @eventName module:engine/view/document~ViewDocument#cut
 * @param data The event data.
 */
export type ViewDocumentCutEvent = {
	name: 'cut';
	args: [ data: ViewDocumentDomEventData<ClipboardEvent> & ClipboardEventData ];
};

/**
 * Fired as a continuation of the {@link module:engine/view/document~ViewDocument#event:dragover} event.
 *
 * It is a part of the {@glink framework/deep-dive/clipboard#input-pipeline clipboard input pipeline}.
 *
 * This event carries a `dataTransfer` object which comes from the clipboard and whose content should be processed
 * and inserted into the editor.
 *
 * **Note**: This event is not available by default. To make it available, {@link module:clipboard/clipboardobserver~ClipboardObserver}
 * needs to be added to the {@link module:engine/view/document~ViewDocument} by using the
 * {@link module:engine/view/view~EditingView#addObserver}  method. This is usually done by the
 * {@link module:clipboard/clipboard~Clipboard} plugin, but if for some reason it is not loaded,
 * the observer must be added manually.
 *
 * @see module:clipboard/clipboardobserver~ClipboardObserver
 * @see module:clipboard/clipboard~Clipboard
 *
 * @eventName module:engine/view/document~ViewDocument#dragging
 * @param data The event data.
 */
export type ViewDocumentDraggingEvent = {
	name: 'dragging';
	args: [ data: ViewDocumentDomEventData<DragEvent> & DraggingEventData ];
};

export interface DraggingEventData {

	/**
	 * The data transfer instance.
	 */
	dataTransfer: ViewDataTransfer;

	/**
	 * Whether the event was triggered by a paste or a drop operation.
	 */
	method: 'dragover';

	/**
	 * The tree view element representing the target.
	 */
	target: Element;

	/**
	 * Ranges which are the target of the operation (usually – into which the content should be inserted).
	 * It is the drop position (which can be different than the selection at the moment of drop).
	 */
	targetRanges: Array<ViewRange> | null;
}

/**
 * Fired when the user starts dragging the content in one of the editing roots of the editor.
 *
 * Introduced by {@link module:clipboard/clipboardobserver~ClipboardObserver}.
 *
 * **Note**: This event is not available by default. To make it available, {@link module:clipboard/clipboardobserver~ClipboardObserver}
 * needs to be added to the {@link module:engine/view/document~ViewDocument} by using the
 * {@link module:engine/view/view~EditingView#addObserver} method. This is usually done by the {@link module:clipboard/clipboard~Clipboard}
 * plugin, but if for some reason it is not loaded, the observer must be added manually.
 *
 * @see module:engine/view/document~ViewDocument#event:clipboardInput
 *
 * @eventName module:engine/view/document~ViewDocument#dragstart
 * @param data The event data.
 */
export type ViewDocumentDragStartEvent = {
	name: 'dragstart';
	args: [ data: ViewDocumentDomEventData<DragEvent> & ClipboardEventData ];
};

/**
 * Fired when the user ended dragging the content.
 *
 * Introduced by {@link module:clipboard/clipboardobserver~ClipboardObserver}.
 *
 * **Note**: This event is not available by default. To make it available, {@link module:clipboard/clipboardobserver~ClipboardObserver}
 * needs to be added to the {@link module:engine/view/document~ViewDocument} by using the
 * {@link module:engine/view/view~EditingView#addObserver} method. This is usually done by the {@link module:clipboard/clipboard~Clipboard}
 * plugin, but if for some reason it is not loaded, the observer must be added manually.
 *
 * @see module:engine/view/document~ViewDocument#event:clipboardInput
 *
 * @eventName module:engine/view/document~ViewDocument#dragend
 * @param data The event data.
 */
export type ViewDocumentDragEndEvent = {
	name: 'dragend';
	args: [ data: ViewDocumentDomEventData<DragEvent> & ClipboardEventData ];
};

/**
 * Fired when the user drags the content into one of the editing roots of the editor.
 *
 * Introduced by {@link module:clipboard/clipboardobserver~ClipboardObserver}.
 *
 * **Note**: This event is not available by default. To make it available, {@link module:clipboard/clipboardobserver~ClipboardObserver}
 * needs to be added to the {@link module:engine/view/document~ViewDocument} by using the
 * {@link module:engine/view/view~EditingView#addObserver} method. This is usually done by the {@link module:clipboard/clipboard~Clipboard}
 * plugin, but if for some reason it is not loaded, the observer must be added manually.
 *
 * @see module:engine/view/document~ViewDocument#event:clipboardInput
 *
 * @eventName module:engine/view/document~ViewDocument#dragenter
 * @param data The event data.
 */
export type ViewDocumentDragEnterEvent = {
	name: 'dragenter';
	args: [ data: ViewDocumentDomEventData<DragEvent> & ClipboardEventData ];
};

/**
 * Fired when the user drags the content out of one of the editing roots of the editor.
 *
 * Introduced by {@link module:clipboard/clipboardobserver~ClipboardObserver}.
 *
 * **Note**: This event is not available by default. To make it available, {@link module:clipboard/clipboardobserver~ClipboardObserver}
 * needs to be added to the {@link module:engine/view/document~ViewDocument} by using the
 * {@link module:engine/view/view~EditingView#addObserver} method. This is usually done by the {@link module:clipboard/clipboard~Clipboard}
 * plugin, but if for some reason it is not loaded, the observer must be added manually.
 *
 * @see module:engine/view/document~ViewDocument#event:clipboardInput
 *
 * @eventName module:engine/view/document~ViewDocument#dragleave
 * @param data The event data.
 */
export type ViewDocumentDragLeaveEvent = {
	name: 'dragleave';
	args: [ data: ViewDocumentDomEventData<DragEvent> & ClipboardEventData ];
};
