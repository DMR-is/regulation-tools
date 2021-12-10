import { readFileSync, writeFileSync } from 'fs';
import dirtyClean from '../dirtyClean-server';
import { HTMLText } from '../types';

/**
 * Usage  yarn run script src/lib/__test__/cleanDirtyFile.ts [filename inside ./input]..
 */

const inputDir = new URL('input/', import.meta.url).pathname;
const outputdDir = new URL('expected/', import.meta.url).pathname;

process.argv
	.slice(2)
	.map((name) => name.replace(/^[./]+/, '').replace(/.html$/, '') + '.html')
	.forEach((fileName) => {
		try {
			const inHTML = readFileSync(inputDir + fileName, 'utf-8') as HTMLText;
			const cleanHTML = dirtyClean(inHTML);
			writeFileSync(outputdDir + fileName, cleanHTML);
		} catch (err: unknown) {
			console.error({ fileName, err });
		}
	});
