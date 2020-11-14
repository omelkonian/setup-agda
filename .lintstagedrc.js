module.exports = {
  '!(*test).{js,ts}': 'eslint --cache --fix',
  'src/**/*.ts': () => ['ncc build', 'git add dist'],
  'src/**/*.ts': () => 'tsc -p tsconfig.json',
  '*.{js,ts,json,md}': 'prettier --write'
};
