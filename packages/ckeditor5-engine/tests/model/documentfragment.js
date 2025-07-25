/**
 * @license Copyright (c) 2003-2025, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-licensing-options
 */

import { ModelElement } from '../../src/model/element.js';
import { ModelText } from '../../src/model/text.js';
import { ModelTextProxy } from '../../src/model/textproxy.js';
import { ModelDocumentFragment } from '../../src/model/documentfragment.js';
import { expectToThrowCKEditorError } from '@ckeditor/ckeditor5-utils/tests/_utils/utils.js';

describe( 'DocumentFragment', () => {
	describe( 'constructor()', () => {
		it( 'should create empty document fragment', () => {
			const frag = new ModelDocumentFragment();

			expect( frag.childCount ).to.equal( 0 );
			expect( frag.maxOffset ).to.equal( 0 );
		} );

		it( 'should create document fragment with children', () => {
			const frag = new ModelDocumentFragment( [ new ModelText( 'xx' ), new ModelElement( 'p' ), new ModelText( 'yy' ) ] );

			expect( frag.childCount ).to.equal( 3 );
			expect( frag.maxOffset ).to.equal( 5 );

			expect( frag.getChild( 0 ) ).to.have.property( 'data' ).that.equals( 'xx' );
			expect( frag.getChild( 1 ) ).to.have.property( 'name' ).that.equals( 'p' );
			expect( frag.getChild( 2 ) ).to.have.property( 'data' ).that.equals( 'yy' );
		} );

		it( 'should have markers list', () => {
			const frag = new ModelDocumentFragment();

			expect( frag ).to.have.property( 'markers' ).to.instanceof( Map );
		} );

		it( 'should have artificial properties', () => {
			const frag = new ModelDocumentFragment();

			expect( frag ).to.have.property( 'root' ).that.equals( frag );
			expect( frag ).to.have.property( 'parent' ).that.is.null;
			expect( frag ).to.have.property( 'nextSibling' ).that.is.null;
			expect( frag ).to.have.property( 'previousSibling' ).that.is.null;
			expect( frag ).to.have.property( 'document' ).that.is.null;
		} );

		it( 'should have `getAncestor` method that returns empty array', () => {
			const frag = new ModelDocumentFragment();

			expect( frag.getAncestors() ).to.be.an( 'array' ).that.is.empty;
		} );
	} );

	describe( 'iterator', () => {
		it( 'should iterate over document fragment\'s children', () => {
			const xx = new ModelText( 'xx' );
			const p = new ModelElement( 'p' );
			const yy = new ModelText( 'yy' );
			const frag = new ModelDocumentFragment( [ xx, p, yy ] );

			expect( Array.from( frag ) ).to.deep.equal( [ xx, p, yy ] );
		} );
	} );

	describe( 'getPath', () => {
		it( 'should return empty array', () => {
			const frag = new ModelDocumentFragment( [ new ModelText( 'x' ), new ModelElement( 'p' ), new ModelText( 'y' ) ] );

			expect( frag.getPath() ).to.deep.equal( [] );
		} );
	} );

	describe( 'is()', () => {
		let frag;

		before( () => {
			frag = new ModelDocumentFragment();
		} );

		it( 'should return true for documentFragment', () => {
			expect( frag.is( 'documentFragment' ) ).to.be.true;
			expect( frag.is( 'model:documentFragment' ) ).to.be.true;
		} );

		it( 'should return false for other values', () => {
			expect( frag.is( 'node' ) ).to.be.false;
			expect( frag.is( '$text' ) ).to.be.false;
			expect( frag.is( '$textProxy' ) ).to.be.false;
			expect( frag.is( 'element' ) ).to.be.false;
			expect( frag.is( 'rootElement' ) ).to.be.false;
			expect( frag.is( 'view:documentFragment' ) ).to.be.false;
		} );
	} );

	describe( 'isEmpty', () => {
		it( 'should return true if document fragment has no children', () => {
			const frag = new ModelDocumentFragment();

			expect( frag.isEmpty ).to.be.true;
		} );

		it( 'should return false if document fragment has children', () => {
			const frag = new ModelDocumentFragment( new ModelText( 'a' ) );

			expect( frag.isEmpty ).to.be.false;
		} );
	} );

	describe( 'isAttached()', () => {
		it( 'returns false', () => {
			const frag = new ModelDocumentFragment();

			expect( frag.isAttached() ).to.be.false;
		} );
	} );

	describe( 'offsetToIndex', () => {
		let frag;

		beforeEach( () => {
			frag = new ModelElement( 'elem', [], [ new ModelElement( 'p' ), new ModelText( 'bar' ), new ModelElement( 'h' ) ] );
		} );

		it( 'should return index of a node that occupies given offset in this element', () => {
			expect( frag.offsetToIndex( 0 ) ).to.equal( 0 );
			expect( frag.offsetToIndex( 1 ) ).to.equal( 1 );
			expect( frag.offsetToIndex( 2 ) ).to.equal( 1 );
			expect( frag.offsetToIndex( 3 ) ).to.equal( 1 );
			expect( frag.offsetToIndex( 4 ) ).to.equal( 2 );
		} );

		it( 'should throw if given offset is too high or too low', () => {
			expectToThrowCKEditorError( () => {
				frag.offsetToIndex( -1 );
			}, /nodelist-offset-out-of-bounds/, frag );

			expectToThrowCKEditorError( () => {
				frag.offsetToIndex( 55 );
			}, /nodelist-offset-out-of-bounds/, frag );
		} );

		it( 'should return length if given offset is equal to maxOffset', () => {
			expect( frag.offsetToIndex( 5 ) ).to.equal( 3 );
		} );
	} );

	describe( '_insertChild', () => {
		it( 'should add children to the document fragment', () => {
			const frag = new ModelDocumentFragment( new ModelText( 'xy' ) );
			frag._insertChild( 1, new ModelText( 'foo' ) );

			expect( frag.childCount ).to.equal( 2 );
			expect( frag.maxOffset ).to.equal( 5 );
			expect( frag.getChild( 0 ) ).to.have.property( 'data' ).that.equals( 'xy' );
			expect( frag.getChild( 1 ) ).to.have.property( 'data' ).that.equals( 'foo' );
		} );

		it( 'should accept strings and arrays', () => {
			const frag = new ModelDocumentFragment();

			frag._insertChild( 0, 'abc' );
			expect( frag.childCount ).to.equal( 1 );
			expect( frag.maxOffset ).to.equal( 3 );
			expect( frag.getChild( 0 ) ).to.have.property( 'data' ).that.equals( 'abc' );

			frag._removeChildren( 0, 1 );
			frag._insertChild( 0, [ new ModelElement( 'p' ), 'abc' ] );

			expect( frag.childCount ).to.equal( 2 );
			expect( frag.maxOffset ).to.equal( 4 );
			expect( frag.getChild( 0 ) ).to.have.property( 'name' ).that.equals( 'p' );
			expect( frag.getChild( 1 ) ).to.have.property( 'data' ).that.equals( 'abc' );
		} );

		it( 'should accept and correctly handle text proxies', () => {
			const frag = new ModelDocumentFragment();
			const text = new ModelText( 'abcxyz', { bold: true } );
			const textProxy = new ModelTextProxy( text, 2, 3 );

			frag._insertChild( 0, textProxy );

			expect( frag.childCount ).to.equal( 1 );
			expect( frag.maxOffset ).to.equal( 3 );
			expect( frag.getChild( 0 ) ).to.be.instanceof( ModelText );
			expect( frag.getChild( 0 ).data ).to.equal( 'cxy' );
			expect( frag.getChild( 0 ).getAttribute( 'bold' ) ).to.equal( true );
		} );
	} );

	describe( '_appendChild', () => {
		it( 'should add children to the end of the element', () => {
			const frag = new ModelDocumentFragment( new ModelText( 'xy' ) );
			frag._appendChild( new ModelText( 'foo' ) );

			expect( frag.childCount ).to.equal( 2 );
			expect( frag.maxOffset ).to.equal( 5 );
			expect( frag.getChild( 0 ) ).to.have.property( 'data' ).that.equals( 'xy' );
			expect( frag.getChild( 1 ) ).to.have.property( 'data' ).that.equals( 'foo' );
		} );
	} );

	describe( '_removeChildren', () => {
		it( 'should remove children from the element and return them as an array', () => {
			const frag = new ModelDocumentFragment( [ new ModelText( 'foobar' ), new ModelElement( 'imageBlock' ) ] );
			const removed = frag._removeChildren( 1, 1 );

			expect( frag.childCount ).to.equal( 1 );
			expect( frag.maxOffset ).to.equal( 6 );

			expect( frag.getChild( 0 ) ).to.have.property( 'data' ).that.equals( 'foobar' );

			expect( removed.length ).to.equal( 1 );
			expect( removed[ 0 ].name ).to.equal( 'imageBlock' );
		} );

		it( 'should remove one child when second parameter is not specified', () => {
			const frag = new ModelDocumentFragment( [ new ModelText( 'foo' ), new ModelElement( 'imageBlock' ) ] );
			const removed = frag._removeChildren( 0 );

			expect( frag.childCount ).to.equal( 1 );
			expect( frag.maxOffset ).to.equal( 1 );
			expect( frag.getChild( 0 ).name ).to.equal( 'imageBlock' );

			expect( removed.length ).to.equal( 1 );
			expect( removed[ 0 ].data ).to.equal( 'foo' );
		} );
	} );

	describe( '_removeChildrenArray', () => {
		it( 'should remove children from the element', () => {
			const _1 = new ModelText( '_1' );
			const _2 = new ModelText( '_2' );
			const _3 = new ModelText( '_3' );
			const _4 = new ModelText( '_4' );
			const _5 = new ModelText( '_5' );
			const _6 = new ModelText( '_6' );

			const frag = new ModelDocumentFragment( [ _1, _2, _3, _4, _5, _6 ] );

			frag._removeChildrenArray( [ _2, _3, _4 ] );

			expect( frag.childCount ).to.equal( 3 );

			expect( frag.getChild( 0 ) ).to.have.property( 'data' ).that.equals( '_1' );
			expect( frag.getChild( 1 ) ).to.have.property( 'data' ).that.equals( '_5' );
			expect( frag.getChild( 2 ) ).to.have.property( 'data' ).that.equals( '_6' );
		} );
	} );

	describe( 'getChildIndex', () => {
		it( 'should return child index', () => {
			const frag = new ModelDocumentFragment( [ new ModelElement( 'p' ), new ModelText( 'bar' ), new ModelElement( 'h' ) ] );
			const p = frag.getChild( 0 );
			const textBAR = frag.getChild( 1 );
			const h = frag.getChild( 2 );

			expect( frag.getChildIndex( p ) ).to.equal( 0 );
			expect( frag.getChildIndex( textBAR ) ).to.equal( 1 );
			expect( frag.getChildIndex( h ) ).to.equal( 2 );
		} );
	} );

	describe( 'getChildStartOffset', () => {
		it( 'should return child start offset', () => {
			const frag = new ModelDocumentFragment( [ new ModelElement( 'p' ), new ModelText( 'bar' ), new ModelElement( 'h' ) ] );

			const p = frag.getChild( 0 );
			const textBAR = frag.getChild( 1 );
			const h = frag.getChild( 2 );

			expect( frag.getChildStartOffset( p ) ).to.equal( 0 );
			expect( frag.getChildStartOffset( textBAR ) ).to.equal( 1 );
			expect( frag.getChildStartOffset( h ) ).to.equal( 4 );
		} );

		it( 'should return null if node is not a child of that document fragment', () => {
			const frag = new ModelDocumentFragment( [ new ModelElement( 'p' ), new ModelText( 'bar' ), new ModelElement( 'h' ) ] );

			const p = new ModelElement( 'p' );

			expect( frag.getChildStartOffset( p ) ).to.equal( null );
		} );
	} );

	describe( 'getChildAtOffset', () => {
		it( 'should return child at given offset', () => {
			const frag = new ModelDocumentFragment( [ new ModelElement( 'p' ), new ModelText( 'bar' ), new ModelElement( 'h' ) ] );

			const p = frag.getChild( 0 );
			const textBAR = frag.getChild( 1 );
			const h = frag.getChild( 2 );

			expect( frag.getChildAtOffset( 0 ) ).to.equal( p );
			expect( frag.getChildAtOffset( 1 ) ).to.equal( textBAR );
			expect( frag.getChildAtOffset( 2 ) ).to.equal( textBAR );
			expect( frag.getChildAtOffset( 3 ) ).to.equal( textBAR );
			expect( frag.getChildAtOffset( 4 ) ).to.equal( h );
		} );

		it( 'should return null for incorrect offset', () => {
			const frag = new ModelDocumentFragment( [ new ModelElement( 'p' ), new ModelText( 'bar' ), new ModelElement( 'h' ) ] );

			expect( frag.getChildAtOffset( -1 ) ).to.be.null;
			expect( frag.getChildAtOffset( 5 ) ).to.be.null;
		} );
	} );

	describe( 'getChildCount', () => {
		it( 'should return number of children nodes', () => {
			const frag = new ModelDocumentFragment( new ModelText( 'bar' ) );

			expect( frag.childCount ).to.equal( 1 );
		} );
	} );

	describe( 'getMaxOffset', () => {
		it( 'should return offset after the last children', () => {
			const frag = new ModelDocumentFragment( new ModelText( 'bar' ) );

			expect( frag.maxOffset ).to.equal( 3 );
		} );
	} );

	describe( 'toJSON', () => {
		it( 'should serialize empty document fragment', () => {
			const frag = new ModelDocumentFragment();

			expect( frag.toJSON() ).to.deep.equal( [] );
		} );

		it( 'should serialize document fragment with children', () => {
			const img = new ModelElement( 'img' );
			const one = new ModelElement( 'one' );
			const two = new ModelElement( 'two', null, [ new ModelText( 'ba' ), img, new ModelText( 'r' ) ] );
			const three = new ModelElement( 'three' );

			const frag = new ModelDocumentFragment( [ one, two, three ] );

			expect( frag.toJSON() ).to.deep.equal( [
				{ name: 'one' },
				{
					name: 'two',
					children: [
						{ data: 'ba' },
						{ name: 'img' },
						{ data: 'r' }
					]
				},
				{ name: 'three' }
			] );
		} );
	} );

	describe( 'fromJSON', () => {
		it( 'should create document fragment without children', () => {
			const frag = new ModelDocumentFragment();

			const serialized = frag.toJSON();
			const deserialized = ModelDocumentFragment.fromJSON( serialized );

			expect( deserialized.isEmpty ).to.be.true;
		} );

		it( 'should create element with children', () => {
			const p = new ModelElement( 'p' );
			const foo = new ModelText( 'foo' );
			const frag = new ModelDocumentFragment( [ p, foo ] );

			const serialized = frag.toJSON();
			const deserialized = ModelDocumentFragment.fromJSON( serialized );

			expect( deserialized.childCount ).to.equal( 2 );

			expect( deserialized.getChild( 0 ).name ).to.equal( 'p' );
			expect( deserialized.getChild( 0 ).parent ).to.equal( deserialized );

			expect( deserialized.getChild( 1 ).data ).to.equal( 'foo' );
			expect( deserialized.getChild( 1 ).parent ).to.equal( deserialized );
		} );
	} );

	describe( 'getNodeByPath', () => {
		it( 'should return the whole document fragment if path is empty', () => {
			const frag = new ModelDocumentFragment();

			expect( frag.getNodeByPath( [] ) ).to.equal( frag );
		} );

		it( 'should return a descendant of this node', () => {
			const foo = new ModelText( 'foo' );
			const image = new ModelElement( 'imageBlock' );
			const element = new ModelElement( 'elem', [], [
				new ModelElement( 'elem', [], [
					foo,
					image
				] )
			] );
			const frag = new ModelDocumentFragment( element );

			expect( frag.getNodeByPath( [ 0, 0, 0 ] ) ).to.equal( foo );
			expect( frag.getNodeByPath( [ 0, 0, 1 ] ) ).to.equal( foo );
			expect( frag.getNodeByPath( [ 0, 0, 2 ] ) ).to.equal( foo );
			expect( frag.getNodeByPath( [ 0, 0, 3 ] ) ).to.equal( image );
		} );

		it( 'works fine with offsets', () => {
			const abc = new ModelText( 'abc' );
			const xyz = new ModelText( 'xyz' );
			const bar = new ModelText( 'bar' );
			const foo = new ModelText( 'foo' );
			const bom = new ModelText( 'bom' );
			const bold = new ModelElement( 'b', [], [
				bar
			] );
			const paragraph = new ModelElement( 'paragraph', [], [
				foo,
				bold,
				bom
			] );
			const frag = new ModelDocumentFragment( [
				abc,
				paragraph,
				xyz
			] );

			// abc<paragraph>foo<bold>bar</bold>bom</paragraph>xyz

			expect( frag.getNodeByPath( [ 0 ] ), 1 ).to.equal( abc );
			expect( frag.getNodeByPath( [ 1 ] ), 2 ).to.equal( abc );
			expect( frag.getNodeByPath( [ 2 ] ), 3 ).to.equal( abc );
			expect( frag.getNodeByPath( [ 3 ] ), 4 ).to.equal( paragraph );
			expect( frag.getNodeByPath( [ 3, 0 ] ), 5 ).to.equal( foo );
			expect( frag.getNodeByPath( [ 3, 1 ] ), 6 ).to.equal( foo );
			expect( frag.getNodeByPath( [ 3, 2 ] ), 7 ).to.equal( foo );
			expect( frag.getNodeByPath( [ 3, 3 ] ), 8 ).to.equal( bold );
			expect( frag.getNodeByPath( [ 3, 3, 0 ] ), 9 ).to.equal( bar );
			expect( frag.getNodeByPath( [ 3, 3, 1 ] ), 10 ).to.equal( bar );
			expect( frag.getNodeByPath( [ 3, 3, 2 ] ), 11 ).to.equal( bar );
			expect( frag.getNodeByPath( [ 3, 3, 3 ] ), 12 ).to.equal( null );
			expect( frag.getNodeByPath( [ 3, 4 ] ), 13 ).to.equal( bom );
			expect( frag.getNodeByPath( [ 3, 5 ] ), 14 ).to.equal( bom );
			expect( frag.getNodeByPath( [ 3, 6 ] ), 15 ).to.equal( bom );
			expect( frag.getNodeByPath( [ 3, 7 ] ), 16 ).to.equal( null );
			expect( frag.getNodeByPath( [ 4 ] ), 17 ).to.equal( xyz );
			expect( frag.getNodeByPath( [ 5 ] ), 18 ).to.equal( xyz );
			expect( frag.getNodeByPath( [ 6 ] ), 19 ).to.equal( xyz );
			expect( frag.getNodeByPath( [ 7 ] ), 20 ).to.equal( null );
		} );
	} );
} );
