import obsidianmd from 'eslint-plugin-obsidianmd';
import globals from 'globals';
import { globalIgnores, defineConfig } from 'eslint/config';

export default defineConfig(
	globalIgnores([
		'node_modules',
		'dist',
		'test/stress/dist',
		'esbuild.config.mjs',
		'version-bump.mjs',
		'versions.json',
		'main.js',
		'package.json',
		'package-lock.json',
		'tsconfig.json',
	]),
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: ['eslint.config.mts', 'manifest.json'],
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json'],
			},
		},
	},
	...obsidianmd.configs.recommended,
	// Stress-test harness: node scripts with an 'obsidian' module alias at
	// bundle time. Included in tsconfig so the project service resolves them.
	// Placed AFTER the recommended configs so these relaxations win.
	{
		files: ['test/**/*.ts'],
		languageOptions: {
			globals: {
				...globals.node,
			},
		},
		rules: {
			// The harness is a CLI runner: console output and node builtins
			// are the whole point. Never bundled into the plugin.
			'no-console': 'off',
			'obsidianmd/rule-custom-message': 'off',
			'obsidianmd/no-nodejs-modules': 'off',
		},
	},
);
