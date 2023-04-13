export type Path = string;

function isPath(x: unknown): x is Path {
	return (
		x != null &&
		typeof x === 'string' &&
		(x.startsWith('/') || x === '') &&
		/[-a-zA-Z0-9@:%._\\+~#?&\/=]*/.test(x)
	);
}

function elems(p: Path) {
	return p
		.slice(1)
		.split('/')
		.filter((s) => s.length > 0);
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

export const Path = {
	is: isPath,
	elems,
	assert,
};
