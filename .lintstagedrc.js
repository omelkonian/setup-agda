module.exports = {
  '!(*test).{js,ts}': 'eslint --cache --fix',
  '!(*test).ts': () => ['npm run bundle', 'git add dist'],
  'src/**/*.ts': () => 'tsc -p tsconfig.json',
  '*.{js,ts,json,md}': 'prettier --write'
};
