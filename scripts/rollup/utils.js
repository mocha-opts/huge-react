import path from 'path';
import fs from 'fs';
import ts from 'rollup-plugin-typescript2';
import cjs from '@rollup/plugin-commonjs';
import replace from '@rollup/plugin-replace';
//path.resolve 就是对参数进行了一系列cd操作
//__dirname => /Users/coconut / dev / github / huge - react / scripts / rollup
//__dirname  代码当前文件目录
const pkgPath = path.resolve(__dirname, '../../packages');

//
const distPath = path.join(__dirname, '../../dist/node_modules');

export function resolvePkgPath(pkgName, isDist) {
	if (isDist) {
		return `${distPath}/${pkgName}`;
	}
	return `${pkgPath}/${pkgName}`;
}

export function getPackageJSON(pkgName) {
	const path = `${resolvePkgPath(pkgName)}/package.json`;
	const str = fs.readFileSync(path, { encoding: 'utf-8' });
	return JSON.parse(str);
}

export function getBaseRollupPlugins({
	alias = { __DEV__: true ,preventAssignment:true},
	typescript = {}
} = {}) {
	return [replace(alias), cjs(), ts(typescript)];
}
