/**
 * @license Copyright (c) 2003-2025, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-licensing-options
 */

/**
 * @module table/tablecolumnresize/tablecolumnresizeediting
 */

import { throttle, isEqual } from 'es-toolkit/compat';

import {
	global,
	DomEmitterMixin,
	Rect,
	toUnit,
	type EventInfo,
	type DomEmitter,
	type ObservableChangeEvent
} from 'ckeditor5/src/utils.js';

import { Plugin, type Editor } from 'ckeditor5/src/core.js';

import type {
	Differ,
	ViewDocumentDomEventData,
	DowncastInsertEvent,
	ViewDowncastWriter,
	ModelElement,
	ViewElement,
	ViewNode
} from 'ckeditor5/src/engine.js';

import { MouseEventsObserver } from '../../src/tablemouse/mouseeventsobserver.js';
import { TableEditing } from '../tableediting.js';
import { TableUtils } from '../tableutils.js';
import { TableWalker } from '../tablewalker.js';

import { TableWidthsCommand } from './tablewidthscommand.js';

import { downcastTableResizedClass, upcastColgroupElement, upcastTableResizedClass } from './converters.js';

import {
	clamp,
	createFilledArray,
	sumArray,
	getColumnEdgesIndexes,
	getChangedResizedTables,
	getColumnMinWidthAsPercentage,
	getElementWidthInPixels,
	getTableWidthInPixels,
	normalizeColumnWidths,
	toPrecision,
	getDomCellOuterWidth,
	updateColumnElements,
	getColumnGroupElement,
	getTableColumnElements,
	getTableColumnsWidths
} from './utils.js';

import { COLUMN_MIN_WIDTH_IN_PIXELS, COLUMN_RESIZE_DISTANCE_THRESHOLD } from './constants.js';
import { type TableColumnResize } from '../tablecolumnresize.js';

const toPx = /* #__PURE__ */ toUnit( 'px' );

type ResizingData = {
	columnPosition: number;
	flags: {
		isRightEdge: boolean;
		isTableCentered: boolean;
		isLtrContent: boolean;
	};
	elements: {
		viewResizer: ViewElement;
		modelTable: ModelElement;
		viewFigure: ViewElement;
		viewColgroup: ViewElement;
		viewLeftColumn: ViewElement;
		viewRightColumn?: ViewElement;
	};
	widths: {
		viewFigureParentWidth: number;
		viewFigureWidth: number;
		tableWidth: number;
		leftColumnWidth: number;
		rightColumnWidth?: number;
	};
};

/**
 * The table column resize editing plugin.
 */
export class TableColumnResizeEditing extends Plugin {
	/**
	 * A flag indicating if the column resizing is in progress.
	 */
	private _isResizingActive: boolean;

	/**
	 * A flag indicating if the column resizing is allowed. It is not allowed if the editor is in read-only
	 * or comments-only mode or the `TableColumnResize` plugin is disabled.
	 *
	 * @observable
	 * @internal
	 */
	public declare _isResizingAllowed: boolean;

	/**
	 * A temporary storage for the required data needed to correctly calculate the widths of the resized columns. This storage is
	 * initialized when column resizing begins, and is purged upon completion.
	 */
	private _resizingData: ResizingData | null;

	/**
	 * DOM emitter.
	 */
	private _domEmitter: DomEmitter;

	/**
	 * A local reference to the {@link module:table/tableutils~TableUtils} plugin.
	 */
	private _tableUtilsPlugin: TableUtils;

	/**
	 * Starting mouse position data used to add a threshold to the resizing process.
	 */
	private _initialMouseEventData: ViewDocumentDomEventData | null = null;

	/**
	 * @inheritDoc
	 */
	public static get requires() {
		return [ TableEditing, TableUtils ] as const;
	}

	/**
	 * @inheritDoc
	 */
	public static get pluginName() {
		return 'TableColumnResizeEditing' as const;
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

		this._isResizingActive = false;
		this.set( '_isResizingAllowed', true );
		this._resizingData = null;
		this._domEmitter = new ( DomEmitterMixin() )();
		this._tableUtilsPlugin = editor.plugins.get( 'TableUtils' );

		this.on<ObservableChangeEvent<boolean>>( 'change:_isResizingAllowed', ( evt, name, value ) => {
			// Toggling the `ck-column-resize_disabled` class shows and hides the resizers through CSS.
			const classAction = value ? 'removeClass' : 'addClass';

			editor.editing.view.change( writer => {
				for ( const root of editor.editing.view.document.roots ) {
					writer[ classAction ]( 'ck-column-resize_disabled', editor.editing.view.document.getRoot( root.rootName )! );
				}
			} );
		} );
	}

	/**
	 * @inheritDoc
	 */
	public init(): void {
		this._extendSchema();
		this._registerPostFixer();
		this._registerConverters();
		this._registerResizingListeners();
		this._registerResizerInserter();

		const editor = this.editor;
		const columnResizePlugin: TableColumnResize = editor.plugins.get( 'TableColumnResize' );
		const tableEditing: TableEditing = editor.plugins.get( 'TableEditing' );

		tableEditing.registerAdditionalSlot( {
			filter: element => element.is( 'element', 'tableColumnGroup' ),
			positionOffset: 0
		} );

		const tableWidthsCommand = new TableWidthsCommand( editor );

		// For backwards compatibility we have two commands that perform exactly the same operation.
		editor.commands.add( 'resizeTableWidth', tableWidthsCommand );
		editor.commands.add( 'resizeColumnWidths', tableWidthsCommand );

		// Currently the states of column resize and table resize (which is actually the last column resize) features
		// are bound together. They can be separated in the future by adding distinct listeners and applying
		// different CSS classes (e.g. `ck-column-resize_disabled` and `ck-table-resize_disabled`) to the editor root.
		// See #12148 for the details.
		this.bind( '_isResizingAllowed' ).to(
			editor, 'isReadOnly',
			columnResizePlugin, 'isEnabled',
			tableWidthsCommand, 'isEnabled',
			( isEditorReadOnly, isPluginEnabled, isTableWidthsCommandCommandEnabled ) =>
				!isEditorReadOnly && isPluginEnabled && isTableWidthsCommandCommandEnabled
		);
	}

	/**
	 * @inheritDoc
	 */
	public override destroy(): void {
		this._domEmitter.stopListening();
		super.destroy();
	}

	/**
	 * Returns a 'tableColumnGroup' element from the 'table'.
	 *
	 * @param element A 'table' or 'tableColumnGroup' element.
	 * @returns A 'tableColumnGroup' element.
	 */
	public getColumnGroupElement( element: ModelElement ): ModelElement | undefined {
		return getColumnGroupElement( element );
	}

	/**
	 * Returns an array of 'tableColumn' elements.
	 *
	 * @param element A 'table' or 'tableColumnGroup' element.
	 * @returns An array of 'tableColumn' elements.
	 */
	public getTableColumnElements( element: ModelElement ): Array<ModelElement> {
		return getTableColumnElements( element );
	}

	/**
	 * Returns an array of table column widths.
	 *
	 * @param element A 'table' or 'tableColumnGroup' element.
	 * @returns An array of table column widths.
	 */
	public getTableColumnsWidths( element: ModelElement ): Array<string> {
		return getTableColumnsWidths( element );
	}

	/**
	 * Registers new attributes for a table model element.
	 */
	private _extendSchema() {
		const schema = this.editor.model.schema;

		schema.extend( 'table', {
			allowAttributes: [ 'tableWidth' ]
		} );

		schema.register( 'tableColumnGroup', {
			allowIn: 'table',
			isLimit: true
		} );

		schema.register( 'tableColumn', {
			allowIn: 'tableColumnGroup',
			allowAttributes: [ 'columnWidth', 'colSpan' ],
			isLimit: true
		} );

		schema.setAttributeProperties( 'columnWidth', { isFormatting: true } );
	}

	/**
	 * Registers table column resize post-fixer.
	 *
	 * It checks if the change from the differ concerns a table-related element or attribute. For detected changes it:
	 *  * Adjusts the `columnWidths` attribute to guarantee that the sum of the widths from all columns is 100%.
	 *  * Checks if the `columnWidths` attribute gets updated accordingly after columns have been added or removed.
	 */
	private _registerPostFixer() {
		const editor = this.editor;
		const model = editor.model;

		model.document.registerPostFixer( writer => {
			let changed = false;

			for ( const table of getChangedResizedTables( model ) ) {
				const tableColumnGroup = this.getColumnGroupElement( table )!;
				const columns = this.getTableColumnElements( tableColumnGroup );
				const columnWidths = this.getTableColumnsWidths( tableColumnGroup );

				// Adjust the `columnWidths` attribute to guarantee that the sum of the widths from all columns is 100%.
				let normalizedWidths = normalizeColumnWidths( columnWidths );

				// If the number of columns has changed, then we need to adjust the widths of the affected columns.
				normalizedWidths = adjustColumnWidths( normalizedWidths, table, this );

				if ( isEqual( columnWidths, normalizedWidths ) ) {
					continue;
				}

				updateColumnElements( columns, tableColumnGroup, normalizedWidths, writer );

				changed = true;
			}

			return changed;
		} );

		/**
		 * Adjusts if necessary the `columnWidths` in case if the number of column has changed.
		 *
		 * @param columnWidths Note: this array **may be modified** by the function.
		 * @param table Table to be checked.
		 */
		function adjustColumnWidths( columnWidths: Array<string>, table: ModelElement, plugin: TableColumnResizeEditing ): Array<string> {
			const newTableColumnsCount = plugin._tableUtilsPlugin.getColumns( table );
			const columnsCountDelta = newTableColumnsCount - columnWidths.length;

			if ( columnsCountDelta === 0 ) {
				return columnWidths;
			}

			const widths: Array<number> = columnWidths.map( width => Number( width.replace( '%', '' ) ) );

			// Collect all cells that are affected by the change.
			const cellSet = getAffectedCells( plugin.editor.model.document.differ, table ) as Set<ModelElement>;

			for ( const cell of cellSet ) {
				const currentColumnsDelta = newTableColumnsCount - widths.length;

				if ( currentColumnsDelta === 0 ) {
					continue;
				}

				// If the column count in the table changed, adjust the widths of the affected columns.
				const hasMoreColumns = currentColumnsDelta > 0;
				const currentColumnIndex = plugin._tableUtilsPlugin.getCellLocation( cell ).column;

				if ( hasMoreColumns ) {
					const columnMinWidthAsPercentage = getColumnMinWidthAsPercentage( table, plugin.editor );
					const columnWidthsToInsert = createFilledArray( currentColumnsDelta, columnMinWidthAsPercentage );

					widths.splice( currentColumnIndex, 0, ...columnWidthsToInsert );
				} else {
					// Moves the widths of the removed columns to the preceding one.
					// Other editors either reduce the width of the whole table or adjust the widths
					// proportionally, so change of this behavior can be considered in the future.
					const removedColumnWidths = widths.splice( currentColumnIndex, Math.abs( currentColumnsDelta ) );

					widths[ currentColumnIndex ] += sumArray( removedColumnWidths );
				}
			}

			return widths.map( width => width + '%' );
		}

		/**
		 * Returns a set of cells that have been changed in a given table.
		 */
		function getAffectedCells( differ: Differ, table: ModelElement ): Set<ModelElement> {
			const cellSet = new Set<ModelElement>();

			for ( const change of differ.getChanges() ) {
				if (
					change.type == 'insert' &&
					change.position.nodeAfter &&
					( change.position.nodeAfter as ModelElement ).name == 'tableCell' &&
					change.position.nodeAfter.getAncestors().includes( table )
				) {
					cellSet.add( change.position.nodeAfter as ModelElement );
				} else if ( change.type == 'remove' ) {
					// If the first cell was removed, use the node after the change position instead.
					const referenceNode = ( change.position.nodeBefore || change.position.nodeAfter ) as ModelElement;

					if ( referenceNode.name == 'tableCell' && referenceNode.getAncestors().includes( table ) ) {
						cellSet.add( referenceNode );
					}
				}
			}

			return cellSet;
		}
	}

	/**
	 * Registers table column resize converters.
	 */
	private _registerConverters() {
		const editor = this.editor;
		const conversion = editor.conversion;

		// Table width style
		conversion.for( 'upcast' ).attributeToAttribute( {
			view: {
				name: /^(figure|table)$/,
				styles: {
					width: /[\s\S]+/
				}
			},
			model: {
				key: 'tableWidth',
				value: ( viewElement: ViewElement ) => {
					const parent = viewElement.parent!;

					if ( parent.is( 'element', 'figure' ) ) {
						return;
					}

					return viewElement.getStyle( 'width' );
				}
			}
		} );

		conversion.for( 'downcast' ).attributeToAttribute( {
			model: {
				name: 'table',
				key: 'tableWidth'
			},
			view: ( width: string ) => ( {
				name: 'figure',
				key: 'style',
				value: {
					width
				}
			} )
		} );

		conversion.elementToElement( { model: 'tableColumnGroup', view: 'colgroup' } );
		conversion.elementToElement( { model: 'tableColumn', view: 'col' } );

		conversion.for( 'downcast' ).add( downcastTableResizedClass() );

		conversion.for( 'upcast' ).add( upcastTableResizedClass() );
		conversion.for( 'upcast' ).add( upcastColgroupElement( this._tableUtilsPlugin ) );
		conversion.for( 'upcast' ).attributeToAttribute( {
			view: {
				name: 'col',
				styles: {
					width: /.*/
				}
			},
			model: {
				key: 'columnWidth',
				value: ( viewElement: ViewElement ) => {
					const viewColWidth = viewElement.getStyle( 'width' );

					// 'pt' is the default unit for table column width pasted from MS Office.
					// See https://github.com/ckeditor/ckeditor5/issues/14521#issuecomment-1662102889 for more details.
					if ( !viewColWidth || ( !viewColWidth.endsWith( '%' ) && !viewColWidth.endsWith( 'pt' ) ) ) {
						return 'auto';
					}

					return viewColWidth;
				}
			}
		} );

		// The `col[span]` attribute is present in tables pasted from MS Excel. We use it to set the temporary `colSpan` model attribute,
		// which is consumed during the `colgroup` element upcast.
		// See https://github.com/ckeditor/ckeditor5/issues/14521#issuecomment-1662102889 for more details.
		conversion.for( 'upcast' ).attributeToAttribute( {
			view: {
				name: 'col',
				key: 'span'
			},
			model: 'colSpan'
		} );

		conversion.for( 'downcast' ).attributeToAttribute( {
			model: {
				name: 'tableColumn',
				key: 'columnWidth'
			},
			view: width => ( { key: 'style', value: { width } } )
		} );
	}

	/**
	 * Registers listeners to handle resizing process.
	 */
	private _registerResizingListeners() {
		const editingView = this.editor.editing.view;

		editingView.addObserver( MouseEventsObserver );
		editingView.document.on( 'mouseover', this._onMouseOverHandler.bind( this ), { priority: 'high' } );
		editingView.document.on( 'mousedown', this._onMouseDownHandler.bind( this ), { priority: 'high' } );
		editingView.document.on( 'mouseout', this._onMouseOutHandler.bind( this ), { priority: 'high' } );

		this._domEmitter.listenTo( global.window.document, 'mousemove', throttle( this._onMouseMoveHandler.bind( this ), 50 ) );
		this._domEmitter.listenTo( global.window.document, 'mouseup', this._onMouseUpHandler.bind( this ) );
	}

	/**
	 * Calculate and set `top` and `bottom` styles to the column resizer element to fit the height of the table.
	 *
	 * @param viewResizer The column resizer element.
	 */
	private _recalculateResizerElement( viewResizer: ViewElement ): void {
		const editor = this.editor;
		const domConverter = editor.editing.view.domConverter;

		// Get DOM target figure ancestor element.
		const domTable = domConverter.mapViewToDom( viewResizer.findAncestor( 'table' )! )!;

		// Get DOM table cell element.
		const domCell = domConverter.mapViewToDom(
			viewResizer.findAncestor( item => [ 'td', 'th' ].includes( item.name ) )!
		)!;

		const rectTable = new Rect( domTable );
		const rectCell = new Rect( domCell );

		// Calculate the top, and bottom positions of the column resizer element.
		const targetTopPosition = toPx( Number( ( rectTable.top - rectCell.top ).toFixed( 4 ) ) );
		const targetBottomPosition = toPx( Number( ( rectCell.bottom - rectTable.bottom ).toFixed( 4 ) ) );

		// Set `top` and `bottom` styles to the column resizer element.
		editor.editing.view.change( viewWriter => {
			viewWriter.setStyle( 'top', targetTopPosition, viewResizer );
			viewWriter.setStyle( 'bottom', targetBottomPosition, viewResizer );
		} );
	}

	/**
	 * Remove `top` and `bottom` styles of the column resizer element.
	 *
	 * @param viewResizer The column resizer element.
	 */
	private _resetResizerStyles( viewResizer: ViewElement ): void {
		this.editor.editing.view.change( viewWriter => {
			viewWriter.removeStyle( 'top', viewResizer );
			viewWriter.removeStyle( 'bottom', viewResizer );
		} );
	}

	/**
	 * Handles the `mouseover` event on column resizer element.
	 * Recalculates the `top` and `bottom` styles of the column resizer element to fit the height of the table.
	 *
	 * @param eventInfo An object containing information about the fired event.
	 * @param domEventData The data related to the DOM event.
	 */
	private _onMouseOverHandler( eventInfo: EventInfo, domEventData: ViewDocumentDomEventData ) {
		const target = domEventData.target;

		if ( !target.hasClass( 'ck-table-column-resizer' ) ) {
			return;
		}

		if ( !this._isResizingAllowed ) {
			return;
		}

		this._recalculateResizerElement( target );
	}

	/**
	 * Handles the `mouseout` event on column resizer element.
	 * When resizing is not active, it resets the `top` and `bottom` styles of the column resizer element.
	 *
	 * @param eventInfo An object containing information about the fired event.
	 * @param domEventData The data related to the DOM event.
	 */
	private _onMouseOutHandler( eventInfo: EventInfo, domEventData: ViewDocumentDomEventData ) {
		const target = domEventData.target;

		if ( !target.hasClass( 'ck-table-column-resizer' ) ) {
			return;
		}

		if ( !this._isResizingAllowed ) {
			return;
		}

		if ( this._isResizingActive ) {
			return;
		}

		this._resetResizerStyles( target );
	}

	/**
	 * Handles the `mousedown` event on column resizer element:
	 *  * calculates the initial column pixel widths,
	 *  * inserts the `<colgroup>` element if it is not present in the `<table>`,
	 *  * puts the necessary data in the temporary storage,
	 *  * applies the attributes to the `<table>` view element.
	 *
	 * @param eventInfo An object containing information about the fired event.
	 * @param domEventData The data related to the DOM event.
	 */
	private _onMouseDownHandler( eventInfo: EventInfo, domEventData: ViewDocumentDomEventData ) {
		const target = domEventData.target;

		if ( !target.hasClass( 'ck-table-column-resizer' ) ) {
			return;
		}

		if ( !this._isResizingAllowed ) {
			return;
		}

		const editor = this.editor;
		const modelTable = editor.editing.mapper.toModelElement( target.findAncestor( 'figure' )! )!;

		// Do not resize if table model is in non-editable place.
		if ( !editor.model.canEditAt( modelTable ) ) {
			return;
		}

		domEventData.preventDefault();
		eventInfo.stop();

		this._initialMouseEventData = domEventData;
	}

	/**
	 * Starts the resizing process after the threshold is reached.
	 */
	private _startResizingAfterThreshold() {
		const domEventData = this._initialMouseEventData!;
		const { target } = domEventData;

		const modelTable = this.editor.editing.mapper.toModelElement( target.findAncestor( 'figure' )! )!;
		const viewTable = target.findAncestor( 'table' )!;

		// Calculate the initial column widths in pixels.
		const columnWidthsInPx = _calculateDomColumnWidths( modelTable, this._tableUtilsPlugin, this.editor );

		// Insert colgroup for the table that is resized for the first time.
		if ( !Array.from( viewTable.getChildren() ).find( viewCol => viewCol.is( 'element', 'colgroup' ) ) ) {
			this.editor.editing.view.change( viewWriter => {
				_insertColgroupElement( viewWriter, columnWidthsInPx, viewTable );
			} );
		}

		this._isResizingActive = true;
		this._resizingData = this._getResizingData( domEventData, columnWidthsInPx );

		// At this point we change only the editor view - we don't want other users to see our changes yet,
		// so we can't apply them in the model.
		this.editor.editing.view.change( writer => _applyResizingAttributesToTable( writer, viewTable, this._resizingData! ) );

		/**
		 * Calculates the DOM columns' widths. It is done by taking the width of the widest cell
		 * from each table column (we rely on the  {@link module:table/tablewalker~TableWalker}
		 * to determine which column the cell belongs to).
		 *
		 * @param modelTable A table which columns should be measured.
		 * @param tableUtils The Table Utils plugin instance.
		 * @param editor The editor instance.
		 * @returns Columns' widths expressed in pixels (without unit).
		 */
		function _calculateDomColumnWidths( modelTable: ModelElement, tableUtilsPlugin: TableUtils, editor: Editor ) {
			const columnWidthsInPx = Array( tableUtilsPlugin.getColumns( modelTable ) );
			const tableWalker = new TableWalker( modelTable );

			for ( const cellSlot of tableWalker ) {
				const viewCell = editor.editing.mapper.toViewElement( cellSlot.cell )!;
				const domCell = editor.editing.view.domConverter.mapViewToDom( viewCell )!;
				const domCellWidth = getDomCellOuterWidth( domCell );

				if ( !columnWidthsInPx[ cellSlot.column ] || domCellWidth < columnWidthsInPx[ cellSlot.column ] ) {
					columnWidthsInPx[ cellSlot.column ] = toPrecision( domCellWidth );
				}
			}

			return columnWidthsInPx;
		}

		/**
		 * Creates a `<colgroup>` element with `<col>`s and inserts it into a given view table.
		 *
		 * @param viewWriter A writer instance.
		 * @param columnWidthsInPx Column widths.
		 * @param viewTable A table view element.
		 */
		function _insertColgroupElement( viewWriter: ViewDowncastWriter, columnWidthsInPx: Array<number>, viewTable: ViewElement ) {
			const colgroup = viewWriter.createContainerElement( 'colgroup' );

			for ( let i = 0; i < columnWidthsInPx.length; i++ ) {
				const viewColElement = viewWriter.createEmptyElement( 'col' );
				const columnWidthInPc = `${ toPrecision( columnWidthsInPx[ i ] / sumArray( columnWidthsInPx ) * 100 ) }%`;

				viewWriter.setStyle( 'width', columnWidthInPc, viewColElement );
				viewWriter.insert( viewWriter.createPositionAt( colgroup, 'end' ), viewColElement );
			}

			viewWriter.insert( viewWriter.createPositionAt( viewTable, 0 ), colgroup );
		}

		/**
		 * Applies the style and classes to the view table as the resizing begun.
		 *
		 * @param viewWriter A writer instance.
		 * @param viewTable A table containing the clicked resizer.
		 * @param resizingData Data related to the resizing.
		 */
		function _applyResizingAttributesToTable( viewWriter: ViewDowncastWriter, viewTable: ViewElement, resizingData: ResizingData ) {
			const figureInitialPcWidth = resizingData.widths.viewFigureWidth / resizingData.widths.viewFigureParentWidth;

			viewWriter.addClass( 'ck-table-resized', viewTable );
			viewWriter.addClass( 'ck-table-column-resizer__active', resizingData.elements.viewResizer );
			viewWriter.setStyle( 'width', `${ toPrecision( figureInitialPcWidth * 100 ) }%`, viewTable.findAncestor( 'figure' )! );
		}
	}

	/**
	 * Handles the `mousemove` event.
	 *  * If resizing process is not in progress, it does nothing.
	 *  * If resizing is active but not allowed, it stops the resizing process instantly calling the `mousedown` event handler.
	 *  * Otherwise it dynamically updates the widths of the resized columns.
	 *
	 * @param eventInfo An object containing information about the fired event.
	 * @param mouseEventData The native DOM event.
	 */
	private _onMouseMoveHandler( eventInfo: EventInfo, mouseEventData: MouseEvent ) {
		if ( this._initialMouseEventData ) {
			const mouseEvent = this._initialMouseEventData.domEvent as MouseEvent;
			const distanceX = Math.abs( mouseEventData.clientX - mouseEvent.clientX );

			if ( distanceX >= COLUMN_RESIZE_DISTANCE_THRESHOLD ) {
				this._startResizingAfterThreshold();
				this._initialMouseEventData = null;
			} else {
				return;
			}
		}

		if ( !this._isResizingActive ) {
			return;
		}

		if ( !this._isResizingAllowed ) {
			this._onMouseUpHandler();

			return;
		}

		const {
			columnPosition,
			flags: {
				isRightEdge,
				isTableCentered,
				isLtrContent
			},
			elements: {
				viewFigure,
				viewLeftColumn,
				viewRightColumn,
				viewResizer
			},
			widths: {
				viewFigureParentWidth,
				tableWidth,
				leftColumnWidth,
				rightColumnWidth
			}
		} = this._resizingData!;

		const dxLowerBound = -leftColumnWidth + COLUMN_MIN_WIDTH_IN_PIXELS;

		const dxUpperBound = isRightEdge ?
			viewFigureParentWidth - tableWidth :
			rightColumnWidth! - COLUMN_MIN_WIDTH_IN_PIXELS;

		// The multiplier is needed for calculating the proper movement offset:
		// - it should negate the sign if content language direction is right-to-left,
		// - it should double the offset if the table edge is resized and table is centered.
		const multiplier = ( isLtrContent ? 1 : -1 ) * ( isRightEdge && isTableCentered ? 2 : 1 );

		const dx = clamp(
			( mouseEventData.clientX - columnPosition ) * multiplier,
			Math.min( dxLowerBound, 0 ),
			Math.max( dxUpperBound, 0 )
		);

		if ( dx === 0 ) {
			return;
		}

		this.editor.editing.view.change( writer => {
			const leftColumnWidthAsPercentage = toPrecision( ( leftColumnWidth + dx ) * 100 / tableWidth );

			writer.setStyle( 'width', `${ leftColumnWidthAsPercentage }%`, viewLeftColumn );

			if ( isRightEdge ) {
				const tableWidthAsPercentage = toPrecision( ( tableWidth + dx ) * 100 / viewFigureParentWidth );

				writer.setStyle( 'width', `${ tableWidthAsPercentage }%`, viewFigure );
			} else {
				const rightColumnWidthAsPercentage = toPrecision( ( rightColumnWidth! - dx ) * 100 / tableWidth );

				writer.setStyle( 'width', `${ rightColumnWidthAsPercentage }%`, viewRightColumn! );
			}
		} );

		this._recalculateResizerElement( viewResizer );
	}

	/**
	 * Handles the `mouseup` event.
	 *  * If resizing process is not in progress, it does nothing.
	 *  * If resizing is active but not allowed, it cancels the resizing process restoring the original widths.
	 *  * Otherwise it propagates the changes from view to the model by executing the adequate commands.
	 */
	private _onMouseUpHandler() {
		this._initialMouseEventData = null;

		if ( !this._isResizingActive ) {
			return;
		}

		const {
			viewResizer,
			modelTable,
			viewFigure,
			viewColgroup
		} = this._resizingData!.elements;

		const editor = this.editor;
		const editingView = editor.editing.view;

		const tableColumnGroup = this.getColumnGroupElement( modelTable );
		const viewColumns: Array<ViewElement> = Array
			.from( viewColgroup.getChildren() )
			.filter( ( column: ViewNode ): column is ViewElement => column.is( 'view:element' ) );

		const columnWidthsAttributeOld = tableColumnGroup ?
			this.getTableColumnsWidths( tableColumnGroup )! :
			null;

		const columnWidthsAttributeNew = viewColumns.map( column => column.getStyle( 'width' ) );

		const isColumnWidthsAttributeChanged = !isEqual( columnWidthsAttributeOld, columnWidthsAttributeNew );

		const tableWidthAttributeOld = modelTable.getAttribute( 'tableWidth' ) as string;
		const tableWidthAttributeNew = viewFigure.getStyle( 'width' )!;

		const isTableWidthAttributeChanged = tableWidthAttributeOld !== tableWidthAttributeNew;

		if ( isColumnWidthsAttributeChanged || isTableWidthAttributeChanged ) {
			if ( this._isResizingAllowed ) {
				editor.execute( 'resizeTableWidth', {
					table: modelTable,
					tableWidth: `${ toPrecision( tableWidthAttributeNew ) }%`,
					columnWidths: columnWidthsAttributeNew
				} );
			} else {
				// In read-only mode revert all changes in the editing view. The model is not touched so it does not need to be restored.
				// This case can occur if the read-only mode kicks in during the resizing process.
				editingView.change( writer => {
					// If table had resized columns before, restore the previous column widths.
					// Otherwise clean up the view from the temporary column resizing markup.
					if ( columnWidthsAttributeOld ) {
						for ( const viewCol of viewColumns ) {
							writer.setStyle( 'width', columnWidthsAttributeOld.shift()!, viewCol );
						}
					} else {
						writer.remove( viewColgroup );
					}

					if ( isTableWidthAttributeChanged ) {
						// If the whole table was already resized before, restore the previous table width.
						// Otherwise clean up the view from the temporary table resizing markup.
						if ( tableWidthAttributeOld ) {
							writer.setStyle( 'width', tableWidthAttributeOld, viewFigure );
						} else {
							writer.removeStyle( 'width', viewFigure );
						}
					}

					// If a table and its columns weren't resized before,
					// prune the remaining common resizing markup.
					if ( !columnWidthsAttributeOld && !tableWidthAttributeOld ) {
						writer.removeClass(
							'ck-table-resized',
							[ ... viewFigure.getChildren() as IterableIterator<ViewElement> ].find( element => element.name === 'table' )!
						);
					}
				} );
			}
		}

		editingView.change( writer => {
			writer.removeClass( 'ck-table-column-resizer__active', viewResizer );
		} );

		const element = editingView.domConverter.mapViewToDom( viewResizer )!;

		if ( !element.matches( ':hover' ) ) {
			this._resetResizerStyles( viewResizer );
		}

		this._isResizingActive = false;
		this._resizingData = null;
	}

	/**
	 * Retrieves and returns required data needed for the resizing process.
	 *
	 * @param domEventData The data of the `mousedown` event.
	 * @param columnWidths The current widths of the columns.
	 * @returns The data needed for the resizing process.
	 */
	private _getResizingData( domEventData: ViewDocumentDomEventData, columnWidths: Array<number> ): ResizingData {
		const editor = this.editor;

		const columnPosition = ( domEventData.domEvent as Event & { clientX: number } ).clientX;

		const viewResizer = domEventData.target;
		const viewLeftCell = viewResizer.findAncestor( 'td' )! || viewResizer.findAncestor( 'th' )!;
		const modelLeftCell = editor.editing.mapper.toModelElement( viewLeftCell )!;
		const modelTable = modelLeftCell.findAncestor( 'table' )!;

		const leftColumnIndex = getColumnEdgesIndexes( modelLeftCell, this._tableUtilsPlugin ).rightEdge;
		const lastColumnIndex = this._tableUtilsPlugin.getColumns( modelTable ) - 1;

		const isRightEdge = leftColumnIndex === lastColumnIndex;
		const isTableCentered = !modelTable.hasAttribute( 'tableAlignment' );
		const isLtrContent = editor.locale.contentLanguageDirection !== 'rtl';

		const viewTable = viewLeftCell.findAncestor( 'table' )!;
		const viewFigure = viewTable.findAncestor( 'figure' ) as ViewElement;
		const viewColgroup = [ ...viewTable.getChildren() as IterableIterator<ViewElement> ]
			.find( viewCol => viewCol.is( 'element', 'colgroup' ) )!;
		const viewLeftColumn = viewColgroup.getChild( leftColumnIndex ) as ViewElement;
		const viewRightColumn = isRightEdge ? undefined : viewColgroup.getChild( leftColumnIndex + 1 ) as ViewElement;

		const viewFigureParentWidth = getElementWidthInPixels(
			editor.editing.view.domConverter.mapViewToDom( viewFigure.parent! ) as HTMLElement
		);
		const viewFigureWidth = getElementWidthInPixels( editor.editing.view.domConverter.mapViewToDom( viewFigure )! );
		const tableWidth = getTableWidthInPixels( modelTable, editor );
		const leftColumnWidth = columnWidths[ leftColumnIndex ];
		const rightColumnWidth = isRightEdge ? undefined : columnWidths[ leftColumnIndex + 1 ];

		return {
			columnPosition,
			flags: {
				isRightEdge,
				isTableCentered,
				isLtrContent
			},
			elements: {
				viewResizer,
				modelTable,
				viewFigure,
				viewColgroup,
				viewLeftColumn,
				viewRightColumn
			},
			widths: {
				viewFigureParentWidth,
				viewFigureWidth,
				tableWidth,
				leftColumnWidth,
				rightColumnWidth
			}
		};
	}

	/**
	 * Registers a listener ensuring that each resizable cell have a resizer handle.
	 */
	private _registerResizerInserter() {
		this.editor.conversion.for( 'editingDowncast' ).add( dispatcher => {
			dispatcher.on<DowncastInsertEvent<ModelElement>>( 'insert:tableCell', ( evt, data, conversionApi ) => {
				const modelElement = data.item;
				const viewElement = conversionApi.mapper.toViewElement( modelElement );
				const viewWriter = conversionApi.writer;

				viewWriter.insert(
					viewWriter.createPositionAt( viewElement!, 'end' ),
					viewWriter.createUIElement( 'div', { class: 'ck-table-column-resizer' } )
				);
			}, { priority: 'lowest' } );
		} );
	}
}
