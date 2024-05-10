export type PathType = string;

type PathBrand = { __brand: 'Path' };
export type Path<T extends string[] | string = string> = T extends string[]
	? `/${PathArray<T>}` & PathBrand
	: T extends string
		? T & PathBrand
		: never;

export type Root = '/';

type PathArray<T extends string[]> = T extends [
	infer THead extends string,
	...infer TTail extends string[],
]
	? PathArrayWithHead<THead, TTail>
	: '';

type PathArrayWithHead<H extends string, T extends string[]> = T extends []
	? H
	: `${H}/${PathArray<T>}`;

function isPath(x: unknown): x is Path {
	return (
		x != null &&
		typeof x === 'string' &&
		(x.startsWith('/') || x === '') &&
		/[-a-zA-Z0-9@:%._\\+~#?&/=]*/.test(x)
	);
}

// Escape slashes according to RFC 6901
function encode(p: string) {
	return p.replace(/~/g, '~0').replace(/\//g, '~1');
}

function decode(s: string) {
	return s.replace(/~1/g, '/').replace(/~0/g, '~');
}

function split(p: Path) {
	return p
		.slice(1)
		.split('/')
		.filter((s) => s.length > 0)
		.map(decode);
}

export class PathIsInvalid extends Error {
	constructor(path: unknown) {
		super(`Path ${path} is not a valid path`);
	}
}

function assert(p: unknown) {
	if (!isPath(p)) {
		throw new PathIsInvalid(p);
	}
}

function from<const T extends string | string[]>(p: T): Path<T> {
	const res = Array.isArray(p) ? '/' + p.map(encode).join('/') : p;
	assert(res);
	return res as Path<T>;
}

function join<T extends string | string[]>(p: Path, s: T) {
	return from(split(p).concat(s));
}

/**
 * Return the source (parent) of the path
 *
 * e.g.
 * ```
 * Path.source(Path.from('/a/b/c')) // '/a/b'
 * ```
 */
function source(p: Path) {
	const parts = split(p);
	parts.pop();
	return from(parts);
}

/**
 * Return the path base name
 *
 * e.g.
 * ```
 * Path.basename(Path.from('/a/b/c')) // 'a'
 * ```
 */
function basename(p: Path) {
	const parts = split(p);
	return parts.pop() || '';
}

export const Path = {
	from,
	split,
	join,
	source,
	basename,
};
