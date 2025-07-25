/**
 * @license Copyright (c) 2003-2025, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-licensing-options
 */

import { ModelTestEditor } from '@ckeditor/ckeditor5-core/tests/_utils/modeltesteditor.js';
import { Paragraph } from '@ckeditor/ckeditor5-paragraph/src/paragraph.js';
import { _setModelData, _getModelData } from '@ckeditor/ckeditor5-engine/src/dev-utils/model.js';

import { TableEditing } from '../../src/tableediting.js';
import { TableSelection } from '../../src/tableselection.js';
import { modelTable } from '../_utils/utils.js';

import { SplitCellCommand } from '../../src/commands/splitcellcommand.js';

describe( 'SplitCellCommand', () => {
	let editor, model, command;

	beforeEach( () => {
		return ModelTestEditor
			.create( {
				plugins: [ Paragraph, TableEditing, TableSelection ]
			} )
			.then( newEditor => {
				editor = newEditor;
				model = editor.model;
				command = new SplitCellCommand( editor );
			} );
	} );

	afterEach( () => {
		return editor.destroy();
	} );

	describe( 'direction=vertically', () => {
		beforeEach( () => {
			command = new SplitCellCommand( editor, { direction: 'vertically' } );
		} );

		describe( 'isEnabled', () => {
			it( 'should be true if in a table cell', () => {
				_setModelData( model, modelTable( [
					[ '00[]' ]
				] ) );

				expect( command.isEnabled ).to.be.true;
			} );

			it( 'should be true if in an entire cell is selected', () => {
				_setModelData( model, modelTable( [
					[ '00', '01' ]
				] ) );

				const tableSelection = editor.plugins.get( TableSelection );
				const modelRoot = model.document.getRoot();
				tableSelection.setCellSelection(
					modelRoot.getNodeByPath( [ 0, 0, 0 ] ),
					modelRoot.getNodeByPath( [ 0, 0, 0 ] )
				);

				expect( command.isEnabled ).to.be.true;
			} );

			it( 'should be false if multiple cells are selected', () => {
				_setModelData( model, modelTable( [
					[ '00', '01' ]
				] ) );

				const tableSelection = editor.plugins.get( TableSelection );
				const modelRoot = model.document.getRoot();
				tableSelection.setCellSelection(
					modelRoot.getNodeByPath( [ 0, 0, 0 ] ),
					modelRoot.getNodeByPath( [ 0, 0, 1 ] )
				);

				expect( command.isEnabled ).to.be.false;
			} );

			it( 'should be false if not in cell', () => {
				_setModelData( model, '<paragraph>11[]</paragraph>' );

				expect( command.isEnabled ).to.be.false;
			} );
		} );

		describe( 'execute()', () => {
			it( 'should split table cell for two table cells', () => {
				_setModelData( model, modelTable( [
					[ '00', '01', '02' ],
					[ '10', '[]11', '12' ],
					[ '20', { colspan: 2, contents: '21' } ],
					[ { colspan: 2, contents: '30' }, '32' ]
				] ) );

				command.execute();

				expect( _getModelData( model ) ).to.equalMarkup( modelTable( [
					[ '00', { colspan: 2, contents: '01' }, '02' ],
					[ '10', '[]11', '', '12' ],
					[ '20', { colspan: 3, contents: '21' } ],
					[ { colspan: 3, contents: '30' }, '32' ]
				] ) );
			} );

			it( 'should unsplit table cell if split is equal to colspan', () => {
				_setModelData( model, modelTable( [
					[ '00', '01', '02' ],
					[ '10', '11', '12' ],
					[ '20', { colspan: 2, contents: '21[]' } ],
					[ { colspan: 2, contents: '30' }, '32' ]
				] ) );

				command.execute();

				expect( _getModelData( model ) ).to.equalMarkup( modelTable( [
					[ '00', '01', '02' ],
					[ '10', '11', '12' ],
					[ '20', '21[]', '' ],
					[ { colspan: 2, contents: '30' }, '32' ]
				] ) );
			} );

			it( 'should properly unsplit table cell if split is uneven', () => {
				_setModelData( model, modelTable( [
					[ '00', '01', '02' ],
					[ { colspan: 3, contents: '10[]' } ]
				] ) );

				command.execute();

				expect( _getModelData( model ) ).to.equalMarkup( modelTable( [
					[ '00', '01', '02' ],
					[ { colspan: 2, contents: '10[]' }, '' ]
				] ) );
			} );

			it( 'should properly set colspan of inserted cells', () => {
				_setModelData( model, modelTable( [
					[ '00', '01', '02', '03' ],
					[ { colspan: 4, contents: '10[]' } ]
				] ) );

				command.execute();

				expect( _getModelData( model ) ).to.equalMarkup( modelTable( [
					[ '00', '01', '02', '03' ],
					[ { colspan: 2, contents: '10[]' }, { colspan: 2, contents: '' } ]
				] ) );
			} );

			it( 'should keep rowspan attribute for newly inserted cells', () => {
				_setModelData( model, modelTable( [
					[ '00', '01', '02', '03', '04', '05' ],
					[ { colspan: 5, rowspan: 2, contents: '10[]' }, '15' ],
					[ '25' ]
				] ) );

				command.execute();

				expect( _getModelData( model ) ).to.equalMarkup( modelTable( [
					[ '00', '01', '02', '03', '04', '05' ],
					[ { colspan: 3, rowspan: 2, contents: '10[]' }, { colspan: 2, rowspan: 2, contents: '' }, '15' ],
					[ '25' ]
				] ) );
			} );
		} );
	} );

	describe( 'direction=horizontally', () => {
		beforeEach( () => {
			command = new SplitCellCommand( editor, { direction: 'horizontally' } );
		} );

		describe( 'isEnabled', () => {
			it( 'should be true if in a table cell', () => {
				_setModelData( model, modelTable( [
					[ '00[]' ]
				] ) );

				expect( command.isEnabled ).to.be.true;
			} );

			it( 'should be false if not in cell', () => {
				_setModelData( model, '<paragraph>11[]</paragraph>' );

				expect( command.isEnabled ).to.be.false;
			} );
		} );

		describe( 'execute()', () => {
			it( 'should split table cell for two table cells', () => {
				_setModelData( model, modelTable( [
					[ '00', '01', '02' ],
					[ '10', '[]11', '12' ],
					[ '20', '21', '22' ]
				] ) );

				command.execute();

				expect( _getModelData( model ) ).to.equalMarkup( modelTable( [
					[ '00', '01', '02' ],
					[ { rowspan: 2, contents: '10' }, '[]11', { rowspan: 2, contents: '12' } ],
					[ '' ],
					[ '20', '21', '22' ]
				] ) );
			} );
		} );
	} );
} );
