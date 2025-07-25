/**
 * @license Copyright (c) 2003-2025, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-licensing-options
 */

import { ModelTestEditor } from '@ckeditor/ckeditor5-core/tests/_utils/modeltesteditor.js';
import { HorizontalLineEditing } from '@ckeditor/ckeditor5-horizontal-line/src/horizontallineediting.js';
import { Paragraph } from '@ckeditor/ckeditor5-paragraph/src/paragraph.js';
import { _setModelData, _getModelData } from '@ckeditor/ckeditor5-engine/src/dev-utils/model.js';

import { TableEditing } from '../../src/tableediting.js';
import { TableSelection } from '../../src/tableselection.js';
import { assertSelectedCells, modelTable } from '../_utils/utils.js';

import { InsertRowCommand } from '../../src/commands/insertrowcommand.js';

describe( 'InsertRowCommand', () => {
	let editor, model, command;

	beforeEach( () => {
		return ModelTestEditor
			.create( {
				plugins: [ Paragraph, TableEditing, TableSelection, HorizontalLineEditing ]
			} )
			.then( newEditor => {
				editor = newEditor;
				model = editor.model;
			} );
	} );

	afterEach( () => {
		return editor.destroy();
	} );

	describe( 'order=below', () => {
		beforeEach( () => {
			command = new InsertRowCommand( editor );
		} );

		describe( 'isEnabled', () => {
			it( 'should be false if wrong node', () => {
				_setModelData( model, '<paragraph>foo[]</paragraph>' );
				expect( command.isEnabled ).to.be.false;
			} );

			it( 'should be true if in table', () => {
				_setModelData( model, modelTable( [ [ '[]' ] ] ) );
				expect( command.isEnabled ).to.be.true;
			} );
		} );

		describe( 'execute()', () => {
			it( 'should insert row after current position', () => {
				_setModelData( model, modelTable( [
					[ '00[]', '01' ],
					[ '10', '11' ]
				] ) );

				command.execute();

				expect( _getModelData( model ) ).to.equalMarkup( modelTable( [
					[ '00[]', '01' ],
					[ '', '' ],
					[ '10', '11' ]
				] ) );
			} );

			it( 'should insert row after current position (selection in block content)', () => {
				_setModelData( model, modelTable( [
					[ '00' ],
					[ '<paragraph>[]10</paragraph>' ],
					[ '20' ]
				] ) );

				command.execute();

				expect( _getModelData( model ) ).to.equalMarkup( modelTable( [
					[ '00' ],
					[ '<paragraph>[]10</paragraph>' ],
					[ '' ],
					[ '20' ]
				] ) );
			} );

			it( 'should update table heading rows attribute when inserting row in headings section', () => {
				_setModelData( model, modelTable( [
					[ '00[]', '01' ],
					[ '10', '11' ],
					[ '20', '21' ]
				], { headingRows: 2 } ) );

				command.execute();

				expect( _getModelData( model ) ).to.equalMarkup( modelTable( [
					[ '00[]', '01' ],
					[ '', '' ],
					[ '10', '11' ],
					[ '20', '21' ]
				], { headingRows: 3 } ) );
			} );

			it( 'should not update table heading rows attribute when inserting row after headings section', () => {
				_setModelData( model, modelTable( [
					[ '00', '01' ],
					[ '10[]', '11' ],
					[ '20', '21' ]
				], { headingRows: 2 } ) );

				command.execute();

				expect( _getModelData( model ) ).to.equalMarkup( modelTable( [
					[ '00', '01' ],
					[ '10[]', '11' ],
					[ '', '' ],
					[ '20', '21' ]
				], { headingRows: 2 } ) );
			} );

			it( 'should expand rowspan of a cell that overlaps inserted rows', () => {
				// +----+----+----+----+
				// | 00      | 02 | 03 |
				// +----+----+----+----+ <-- heading rows
				// | 10      | 12 | 13 |
				// +         +----+----+
				// |         | 22 | 23 |
				// +----+----+----+----+
				//                     ^-- heading columns
				_setModelData( model, modelTable( [
					[ { contents: '00', colspan: 2 }, '02', '03' ],
					[ { contents: '10[]', colspan: 2, rowspan: 2 }, '12', '13' ],
					[ '22', '23' ]
				], { headingColumns: 3, headingRows: 1 } ) );

				command.execute();

				// +----+----+----+----+
				// | 00      | 02 | 03 |
				// +----+----+----+----+ <-- heading rows
				// | 10      | 12 | 13 |
				// +         +----+----+
				// |         |    |    |
				// +         +----+----+
				// |         | 22 | 23 |
				// +----+----+----+----+
				//                     ^-- heading columns
				expect( _getModelData( model ) ).to.equalMarkup( modelTable( [
					[ { contents: '00', colspan: 2 }, '02', '03' ],
					[ { contents: '10[]', colspan: 2, rowspan: 3 }, '12', '13' ],
					[ '', '' ],
					[ '22', '23' ]
				], { headingColumns: 3, headingRows: 1 } ) );
			} );

			it( 'should not expand rowspan of a cell that does not overlaps inserted rows', () => {
				// +----+----+----+
				// | 00 | 01 | 02 |
				// +    +----+----+
				// |    | 11 | 12 |
				// +----+----+----+ <-- heading rows
				// | 20 | 21 | 22 |
				// +----+----+----+
				_setModelData( model, modelTable( [
					[ { contents: '00', rowspan: 2 }, '01', '02' ],
					[ '11[]', '12' ],
					[ '20', '21', '22' ]
				], { headingRows: 2 } ) );

				command.execute();

				// +----+----+----+
				// | 00 | 01 | 02 |
				// +    +----+----+
				// |    | 11 | 12 |
				// +----+----+----+ <-- heading rows
				// |    |    |    |
				// +----+----+----+
				// | 20 | 21 | 22 |
				// +----+----+----+
				expect( _getModelData( model ) ).to.equalMarkup( modelTable( [
					[ { contents: '00', rowspan: 2 }, '01', '02' ],
					[ '11[]', '12' ],
					[ '', '', '' ],
					[ '20', '21', '22' ]
				], { headingRows: 2 } ) );
			} );

			it( 'should properly calculate columns if next row has colspans', () => {
				// +----+----+----+
				// | 00 | 01 | 02 |
				// +    +----+----+
				// |    | 11 | 12 |
				// +----+----+----+ <-- heading rows
				// | 20           |
				// +----+----+----+
				_setModelData( model, modelTable( [
					[ { contents: '00', rowspan: 2 }, '01', '02' ],
					[ '11[]', '12' ],
					[ { contents: '20', colspan: 3 } ]
				], { headingRows: 2 } ) );

				command.execute();

				// +----+----+----+
				// | 00 | 01 | 02 |
				// +    +----+----+
				// |    | 11 | 12 |
				// +----+----+----+ <-- heading rows
				// |    |    |    |
				// +----+----+----+
				// | 20           |
				// +----+----+----+
				expect( _getModelData( model ) ).to.equalMarkup( modelTable( [
					[ { contents: '00', rowspan: 2 }, '01', '02' ],
					[ '11[]', '12' ],
					[ '', '', '' ],
					[ { contents: '20', colspan: 3 } ]
				], { headingRows: 2 } ) );
			} );

			it( 'should insert rows at the end of a table', () => {
				_setModelData( model, modelTable( [
					[ '00', '01' ],
					[ '10[]', '11' ]
				] ) );

				command.execute();

				expect( _getModelData( model ) ).to.equalMarkup( modelTable( [
					[ '00', '01' ],
					[ '10[]', '11' ],
					[ '', '' ]
				] ) );
			} );

			it( 'should insert a row when multiple rows are selected', () => {
				_setModelData( model, modelTable( [
					[ '11', '12' ],
					[ '21', '22' ],
					[ '31', '32' ]
				] ) );

				const tableSelection = editor.plugins.get( TableSelection );
				const modelRoot = model.document.getRoot();

				tableSelection.setCellSelection(
					modelRoot.getNodeByPath( [ 0, 0, 0 ] ),
					modelRoot.getNodeByPath( [ 0, 1, 1 ] )
				);

				command.execute();

				expect( _getModelData( model, { withoutSelection: true } ) ).to.equalMarkup( modelTable( [
					[ '11', '12' ],
					[ '21', '22' ],
					[ '', '' ],
					[ '31', '32' ]
				] ) );

				assertSelectedCells( model, [
					[ 1, 1 ],
					[ 1, 1 ],
					[ 0, 0 ],
					[ 0, 0 ]
				] );
			} );

			it( 'should insert a row when a widget in the table cell is selected', () => {
				_setModelData( model, modelTable( [
					[ '11', '12' ],
					[ '21', '22' ],
					[ '31', '[<horizontalLine></horizontalLine>]' ]
				] ) );

				command.execute();

				expect( _getModelData( model, { withoutSelection: true } ) ).to.equalMarkup( modelTable( [
					[ '11', '12' ],
					[ '21', '22' ],
					[ '31', '<horizontalLine></horizontalLine>' ],
					[ '', '' ]
				] ) );
			} );

			it( 'should copy the row structure from the selected row', () => {
				// +----+----+----+
				// | 00 | 01      |
				// +----+----+----+
				// | 10 | 11 | 12 |
				// +----+----+----+
				_setModelData( model, modelTable( [
					[ '[]00', { contents: '01', colspan: 2 } ],
					[ '10', '11', '12' ]
				] ) );

				command.execute();

				// +----+----+----+
				// | 00 | 01      |
				// +----+----+----+
				// |    |         |
				// +----+----+----+
				// | 10 | 11 | 12 |
				// +----+----+----+
				expect( _getModelData( model, { withoutSelection: true } ) ).to.equalMarkup( modelTable( [
					[ '00', { contents: '01', colspan: 2 } ],
					[ '', { contents: '', colspan: 2 } ],
					[ '10', '11', '12' ]
				] ) );
			} );
		} );

		it( 'should be false when non-cell elements are in the selection', () => {
			model.schema.register( 'foo', {
				allowIn: 'table',
				allowContentOf: '$block'
			} );
			editor.conversion.elementToElement( {
				model: 'foo',
				view: 'foo'
			} );

			_setModelData( model,
				'<table>' +
					'<tableRow>' +
						'<tableCell></tableCell>' +
					'</tableRow>' +
					'<foo>bar[]</foo>' +
				'</table>'
			);
			expect( command.isEnabled ).to.be.false;
		} );
	} );

	describe( 'order=above', () => {
		beforeEach( () => {
			command = new InsertRowCommand( editor, { order: 'above' } );
		} );

		describe( 'isEnabled', () => {
			it( 'should be false if wrong node', () => {
				_setModelData( model, '<paragraph>foo[]</paragraph>' );
				expect( command.isEnabled ).to.be.false;
			} );

			it( 'should be true if in table', () => {
				_setModelData( model, modelTable( [ [ '[]' ] ] ) );
				expect( command.isEnabled ).to.be.true;
			} );
		} );

		describe( 'execute()', () => {
			it( 'should insert row before current position (selection in block content)', () => {
				_setModelData( model, modelTable( [
					[ '00' ],
					[ '<paragraph>[]10</paragraph>' ],
					[ '20' ]
				] ) );

				command.execute();

				expect( _getModelData( model ) ).to.equalMarkup( modelTable( [
					[ '00' ],
					[ '' ],
					[ '<paragraph>[]10</paragraph>' ],
					[ '20' ]
				] ) );
			} );

			it( 'should insert row at the beginning of a table', () => {
				_setModelData( model, modelTable( [
					[ '00[]', '01' ],
					[ '10', '11' ]
				] ) );

				command.execute();

				expect( _getModelData( model ) ).to.equalMarkup( modelTable( [
					[ '', '' ],
					[ '00[]', '01' ],
					[ '10', '11' ]
				] ) );
			} );

			it( 'should insert row at the end of a table', () => {
				_setModelData( model, modelTable( [
					[ '00', '01' ],
					[ '10', '11' ],
					[ '20[]', '21' ]
				] ) );

				command.execute();

				expect( _getModelData( model ) ).to.equalMarkup( modelTable( [
					[ '00', '01' ],
					[ '10', '11' ],
					[ '', '' ],
					[ '20[]', '21' ]
				] ) );
			} );

			it( 'should update table heading rows attribute when inserting row in headings section', () => {
				_setModelData( model, modelTable( [
					[ '00[]', '01' ],
					[ '10', '11' ],
					[ '20', '21' ]
				], { headingRows: 2 } ) );

				command.execute();

				expect( _getModelData( model ) ).to.equalMarkup( modelTable( [
					[ '', '' ],
					[ '00[]', '01' ],
					[ '10', '11' ],
					[ '20', '21' ]
				], { headingRows: 3 } ) );
			} );

			it( 'should not update table heading rows attribute when inserting row after headings section', () => {
				_setModelData( model, modelTable( [
					[ '00', '01' ],
					[ '10', '11' ],
					[ '20[]', '21' ]
				], { headingRows: 2 } ) );

				command.execute();

				expect( _getModelData( model ) ).to.equalMarkup( modelTable( [
					[ '00', '01' ],
					[ '10', '11' ],
					[ '', '' ],
					[ '20[]', '21' ]
				], { headingRows: 2 } ) );
			} );

			it( 'should insert a row when multiple rows are selected', () => {
				_setModelData( model, modelTable( [
					[ '11', '12' ],
					[ '21', '22' ],
					[ '31', '32' ]
				] ) );

				const tableSelection = editor.plugins.get( TableSelection );
				const modelRoot = model.document.getRoot();

				tableSelection.setCellSelection(
					modelRoot.getNodeByPath( [ 0, 0, 0 ] ),
					modelRoot.getNodeByPath( [ 0, 1, 1 ] )
				);

				command.execute();

				expect( _getModelData( model, { withoutSelection: true } ) ).to.equalMarkup( modelTable( [
					[ '', '' ],
					[ '11', '12' ],
					[ '21', '22' ],
					[ '31', '32' ]
				] ) );

				assertSelectedCells( model, [
					[ 0, 0 ],
					[ 1, 1 ],
					[ 1, 1 ],
					[ 0, 0 ]
				] );
			} );

			it( 'should copy the row structure from the selected row', () => {
				// +----+----+----+
				// | 00 | 01      |
				// +----+----+----+
				// | 10 | 11 | 12 |
				// +----+----+----+
				_setModelData( model, modelTable( [
					[ '[]00', { contents: '01', colspan: 2 } ],
					[ '10', '11', '12' ]
				] ) );

				command.execute();

				// +----+----+----+
				// |    |         |
				// +----+----+----+
				// | 00 | 01      |
				// +----+----+----+
				// | 10 | 11 | 12 |
				// +----+----+----+
				expect( _getModelData( model, { withoutSelection: true } ) ).to.equalMarkup( modelTable( [
					[ '', { contents: '', colspan: 2 } ],
					[ '00', { contents: '01', colspan: 2 } ],
					[ '10', '11', '12' ]
				] ) );
			} );
		} );

		it( 'should be false when non-cell elements are in the selection', () => {
			model.schema.register( 'foo', {
				allowIn: 'table',
				allowContentOf: '$block'
			} );
			editor.conversion.elementToElement( {
				model: 'foo',
				view: 'foo'
			} );

			_setModelData( model,
				'<table>' +
					'<tableRow>' +
						'<tableCell></tableCell>' +
					'</tableRow>' +
					'<foo>bar[]</foo>' +
				'</table>'
			);
			expect( command.isEnabled ).to.be.false;
		} );
	} );
} );
