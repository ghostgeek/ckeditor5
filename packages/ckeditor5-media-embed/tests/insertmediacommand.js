/**
 * @license Copyright (c) 2003-2025, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-licensing-options
 */

import { ModelTestEditor } from '@ckeditor/ckeditor5-core/tests/_utils/modeltesteditor.js';
import { _setModelData, _getModelData } from '@ckeditor/ckeditor5-engine/src/dev-utils/model.js';
import { MediaEmbedEditing } from '../src/mediaembedediting.js';
import { MediaEmbedCommand } from '../src/mediaembedcommand.js';

describe( 'MediaEmbedCommand', () => {
	let editor, model, command;

	beforeEach( () => {
		return ModelTestEditor
			.create( {
				plugins: [ MediaEmbedEditing ]
			} )
			.then( newEditor => {
				editor = newEditor;
				model = editor.model;
				command = new MediaEmbedCommand( editor );

				model.schema.register( 'p', { inheritAllFrom: '$block' } );
			} );
	} );

	afterEach( () => {
		return editor.destroy();
	} );

	describe( 'isEnabled', () => {
		it( 'should be true if in a root', () => {
			_setModelData( model, '[]' );
			expect( command.isEnabled ).to.be.true;
		} );

		it( 'should be true if in a paragraph (collapsed)', () => {
			_setModelData( model, '<p>foo[]</p>' );
			expect( command.isEnabled ).to.be.true;
		} );

		it( 'should be true if in a paragraph (not collapsed)', () => {
			_setModelData( model, '<p>[foo]</p>' );
			expect( command.isEnabled ).to.be.true;
		} );

		it( 'should be true if a media is selected', () => {
			_setModelData( model, '[<media url="http://ckeditor.com"></media>]' );
			expect( command.isEnabled ).to.be.true;
		} );

		it( 'should be true if a media is selected in a table cell', () => {
			model.schema.register( 'table', { allowIn: '$root', isLimit: true, isObject: true, isBlock: true } );
			model.schema.register( 'tableRow', { allowIn: 'table', isLimit: true } );
			model.schema.register( 'tableCell', { allowIn: 'tableRow', isLimit: true, isSelectable: true } );
			model.schema.extend( 'media', { allowIn: 'tableCell' } );

			_setModelData( model, '<table><tableRow><tableCell>[<media></media>]</tableCell></tableRow></table>' );

			expect( command.isEnabled ).to.be.true;
		} );

		it( 'should be true if in a table cell', () => {
			model.schema.register( 'table', { allowIn: '$root', isLimit: true, isObject: true, isBlock: true } );
			model.schema.register( 'tableRow', { allowIn: 'table', isLimit: true } );
			model.schema.register( 'tableCell', { allowIn: 'tableRow', isLimit: true, isSelectable: true } );
			model.schema.extend( '$block', { allowIn: 'tableCell' } );

			_setModelData( model, '<table><tableRow><tableCell><p>foo[]</p></tableCell></tableRow></table>' );

			expect( command.isEnabled ).to.be.true;
		} );

		it( 'should be true when the selection directly in a block', () => {
			model.schema.register( 'block', { inheritAllFrom: '$block', allowChildren: '$text' } );

			_setModelData( model, '<block>foo[]</block>' );
			expect( command.isEnabled ).to.be.true;
		} );

		it( 'should be false when the selection in a limit element', () => {
			model.schema.register( 'block', { inheritAllFrom: '$block' } );
			model.schema.register( 'limit', { allowIn: 'block', isLimit: true } );
			model.schema.extend( '$text', { allowIn: 'limit' } );

			_setModelData( model, '<block><limit>foo[]</limit></block>' );
			expect( command.isEnabled ).to.be.false;
		} );

		it( 'should be true if a non-object element is selected', () => {
			model.schema.register( 'element', { allowIn: '$root', isSelectable: true } );

			_setModelData( model, '[<element></element>]' );
			expect( command.isEnabled ).to.be.true;
		} );

		it( 'should be true if a non-media object is selected', () => {
			model.schema.register( 'imageBlock', { isObject: true, isBlock: true, allowWhere: '$block' } );

			_setModelData( model, '[<imageBlock src="http://ckeditor.com"></imageBlock>]' );
			expect( command.isEnabled ).to.be.true;
		} );
	} );

	describe( 'value', () => {
		it( 'should be null when no media is selected (paragraph)', () => {
			_setModelData( model, '<p>foo[]</p>' );
			expect( command.value ).to.be.undefined;
		} );

		it( 'should equal the url of the selected media', () => {
			_setModelData( model, '[<media url="http://ckeditor.com"></media>]' );
			expect( command.value ).to.equal( 'http://ckeditor.com' );
		} );
	} );

	describe( 'execute()', () => {
		it( 'should create a single batch', () => {
			_setModelData( model, '<p>foo[]</p>' );

			const spy = sinon.spy();

			model.document.on( 'change', spy );

			command.execute( 'http://ckeditor.com' );

			sinon.assert.calledOnce( spy );
		} );

		it( 'should insert a media in an empty root and select it', () => {
			_setModelData( model, '[]' );

			command.execute( 'http://ckeditor.com' );

			expect( _getModelData( model ) ).to.equal( '[<media url="http://ckeditor.com"></media>]' );
		} );

		it( 'should update media url', () => {
			_setModelData( model, '[<media url="http://ckeditor.com"></media>]' );

			command.execute( 'http://cksource.com' );

			expect( _getModelData( model ) ).to.equal( '[<media url="http://cksource.com"></media>]' );
		} );

		it( 'should replace an existing selected object with a media', () => {
			model.schema.register( 'object', { isObject: true, allowIn: '$root' } );
			editor.conversion.for( 'downcast' ).elementToElement( { model: 'object', view: 'object' } );

			_setModelData( model, '<p>foo</p>[<object></object>]<p>bar</p>' );

			command.execute( 'http://ckeditor.com' );

			expect( _getModelData( model ) ).to.equal(
				'<p>foo</p>[<media url="http://ckeditor.com"></media>]<p>bar</p>'
			);
		} );

		describe( 'inheriting attributes', () => {
			beforeEach( () => {
				const attributes = [ 'smart', 'pretty' ];

				model.schema.extend( '$block', {
					allowAttributes: attributes
				} );

				model.schema.extend( '$blockObject', {
					allowAttributes: attributes
				} );

				for ( const attribute of attributes ) {
					model.schema.setAttributeProperties( attribute, {
						copyOnReplace: true
					} );
				}
			} );

			it( 'should copy $block attributes on a media element when inserting it in $block', () => {
				_setModelData( model, '<p pretty="true" smart="true" >[]</p>' );

				command.execute( 'http://cksource.com' );

				expect( _getModelData( model ) ).to.equalMarkup( '[<media pretty="true" smart="true" url="http://cksource.com"></media>]' );
			} );

			it( 'should copy attributes from first selected element', () => {
				_setModelData( model, '<p pretty="true">[foo</p><p smart="true">bar]</p>' );

				command.execute( 'http://cksource.com' );

				expect( _getModelData( model ) ).to.equalMarkup(
					'[<media pretty="true" url="http://cksource.com"></media>]' +
					'<p pretty="true">foo</p>' +
					'<p smart="true">bar</p>'
				);
			} );

			it( 'should only copy $block attributes marked with copyOnReplace', () => {
				_setModelData( model, '<p pretty="true" smart="true" nice="true" >[]</p>' );

				command.execute( 'http://cksource.com' );

				expect( _getModelData( model ) ).to.equalMarkup( '[<media pretty="true" smart="true" url="http://cksource.com"></media>]' );
			} );

			it( 'should copy attributes from object when it is selected during insertion', () => {
				model.schema.register( 'object', { isObject: true, inheritAllFrom: '$blockObject' } );
				editor.conversion.for( 'downcast' ).elementToElement( { model: 'object', view: 'object' } );

				_setModelData( model, '<p>foo</p>[<object pretty="true" smart="true"></object>]<p>bar</p>' );

				command.execute( 'http://cksource.com' );

				expect( _getModelData( model ) ).to.equalMarkup(
					'<p>foo</p>[<media pretty="true" smart="true" url="http://cksource.com"></media>]<p>bar</p>'
				);
			} );
		} );
	} );
} );
