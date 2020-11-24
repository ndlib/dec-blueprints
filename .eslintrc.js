module.exports = {
  parser: '@typescript-eslint/parser', // Specifies the ESLint parser
  parserOptions: {
    ecmaVersion: 2020, // Allows for the parsing of modern ECMAScript features
    sourceType: 'module', // Allows for the use of imports
  },
  plugins: [
    '@typescript-eslint',
    'jest',
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    'brace-style'             : ['error', '1tbs'],
    'comma-dangle'            : ['error', 'always-multiline'],
    'jsx-quotes'              : ['error', 'prefer-single'],
    'object-curly-spacing'    : ['error', 'always'],
    'space-in-parens'         : ['error', 'never'],
    'no-template-curly-in-string' : 'off', // disabling because of https://github.com/eslint/eslint/issues/12466 having not been resolved
    'semi'                    : 'off', // must be disabled for @typescript-eslint/semi to work
    '@typescript-eslint/semi' : ['error', 'never'],
    'no-unused-vars'          : 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    'no-useless-constructor'  : 'off', // TODO: Remove this once we get things filled in
    '@typescript-eslint/no-empty-interface' : 'off', // TODO: Remove this once we get things filled in
  },
  env: {
    'node': true,
    'jest': true,
  },
}