/**
 * @license Copyright (c) 2003-2025, CKSource Holding sp. z o.o. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-licensing-options
 */

import type {
	CKFinder,
	CKFinderCommand,
	CKFinderConfig,
	CKFinderEditing
} from './index.js';

declare module '@ckeditor/ckeditor5-core' {
	interface EditorConfig {

		/**
		 * The configuration of the {@link module:ckfinder/ckfinder~CKFinder CKFinder feature}.
		 *
		 * Read more in {@link module:ckfinder/ckfinderconfig~CKFinderConfig}.
		 */
		ckfinder?: CKFinderConfig;
	}

	interface PluginsMap {
		[ CKFinder.pluginName ]: CKFinder;
		[ CKFinderEditing.pluginName ]: CKFinderEditing;
	}

	interface CommandsMap {
		ckfinder: CKFinderCommand;
	}
}
