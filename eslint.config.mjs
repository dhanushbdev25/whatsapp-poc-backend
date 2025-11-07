import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import importPlugin from 'eslint-plugin-import';
import prettierPlugin from 'eslint-plugin-prettier';

export default tseslint.config(
	{
		ignores: ['node_modules/**', 'build/**', 'dist/**', 'coverage/**'],
	},
	js.configs.recommended,
	...tseslint.configs.recommended,
	{
		files: ['**/*.ts'],
		languageOptions: {
			parser: tseslint.parser,
			parserOptions: {
				project: './tsconfig.json',
				tsconfigRootDir: import.meta.dirname,
			},
		},
		plugins: {
			import: importPlugin,
			prettier: prettierPlugin,
		},
		rules: {
			'no-useless-constructor': 'off',
			'prettier/prettier': ['error', { singleQuote: true }],
			semi: ['error', 'always'],
			'object-curly-spacing': ['error', 'always'],
			camelcase: 'off',
			'@typescript-eslint/explicit-function-return-type': 'off',
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-inferrable-types': [
				'warn',
				{
					ignoreParameters: true,
				},
			],
			'no-underscore-dangle': 'off',
			'no-shadow': 'off',
			'@typescript-eslint/no-shadow': ['error'],
			'@typescript-eslint/no-unused-vars': [
				'warn',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
				},
			],
			quotes: ['error', 'single', { avoidEscape: true }],
			'class-methods-use-this': 'off',
			'no-restricted-properties': [
				'error',
				{
					object: 'process',
					property: 'env',
					message: 'Use validated env from env.ts instead of process.env',
				},
			],
			'import/order': [
				'error',
				{
					groups: ['builtin', 'external', 'parent', 'sibling', 'index'],
					alphabetize: {
						order: 'asc',
					},
				},
			],
			'import/extensions': 'off', // Disabled for TypeScript path aliases
			'import/no-unresolved': [
				'error',
				{
					ignore: ['^@/', '^\\$', '\\.json$'],
				},
			],
		},
		settings: {
			'import/resolver': {
				typescript: {
					alwaysTryTypes: true,
					project: './tsconfig.json',
				},
				node: {
					extensions: ['.js', '.jsx', '.ts', '.tsx'],
				},
			},
		},
	},
	{
		// Allow process.env usage in env.ts where validation happens
		files: ['src/env.ts'],
		rules: {
			'no-restricted-properties': 'off',
		},
	},
	prettier,
);
