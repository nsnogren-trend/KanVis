import typescriptEslint from 'typescript-eslint';

export default typescriptEslint.config(
    { ignores: ['out', 'dist', '**/*.d.ts'] },
    {
        files: ['src/**/*.ts'],
        extends: [
            ...typescriptEslint.configs.recommended,
            ...typescriptEslint.configs.stylistic,
        ],
        rules: {
            '@typescript-eslint/naming-convention': [
                'warn',
                { selector: 'import', format: ['camelCase', 'PascalCase'] },
            ],
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
            ],
            '@typescript-eslint/consistent-generic-constructors': 'off',
            curly: 'warn',
            eqeqeq: 'warn',
            'no-throw-literal': 'warn',
            semi: 'warn',
        },
    }
);
