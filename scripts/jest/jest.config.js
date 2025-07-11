const { defaults } = require('jest-config');

module.exports = {
	...defaults,
	rootDir: process.cwd(),
	modulePathIgnorePatterns: ['<rootDir>/.history'],
	moduleDirectories: [
		// 对于第三方依赖
		...defaults.moduleDirectories,
		// 对于 React ReactDOM
		'dist/node_modules'
	],
	testEnvironment: 'jsdom'
};
