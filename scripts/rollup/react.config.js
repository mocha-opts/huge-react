import { getBaseRollupPlugins, getPackageJSON, resolvePkgPath } from './utils';
const { name, module } = getPackageJSON('react');
//react 包路径
const pkgPath = resolvePkgPath(name);
//react 产物路径
const pkgDistPath = resolvePkgPath(name, true);
import generatePackageJson from 'rollup-plugin-generate-package-json';

export default [
	//1.0 不符合要求 没分包
	{
		input: `${pkgPath}/${module}`,
		output: {
			file: `${pkgDistPath}/index.js`,
			name: 'index.js',
			format: 'umd'
		},
		plugins: [
			...getBaseRollupPlugins(),
			generatePackageJson({
				inputFolder: pkgPath,
				outputFolder: pkgDistPath,
				baseContents: ({ name, description, version }) => ({
					name,
					description,
					version,
					main: 'index.js'
				})
			})
		]
	},

	// jsx runtime
	{
		input: `${pkgPath}/src/jsx.ts`,
		output: [
			//jsx-runtime
			{
				file: `${pkgDistPath}/jsx-runtime.js`,
				name: 'jsx-runtime.js',
				format: 'umd'
			},
			{
				file: `${pkgDistPath}/jsx-dev-runtime.js`,
				name: 'jsx-dev-runtime.js',
				format: 'umd'
			}
		],
		plugins: getBaseRollupPlugins()
	}
];
