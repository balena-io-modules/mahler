import * as Optic from 'optics-ts';
import * as assert from 'assert';

import { Context as C, Path as P, Identity } from './types';

// Redeclare the type for exporting
export type Context<TState = any, TPath extends Path = '/'> = C<TState, TPath>;
export type Path = P;

export type ContextAsArgs<TState = any, TPath extends Path = '/'> = Identity<
	Omit<C<TState, TPath>, 'get' | 'set'>
>;

function isArrayIndex(x: unknown): x is number {
	return (
		x != null &&
		typeof x === 'string' &&
		!isNaN(+x) &&
		+x === parseInt(x, 10) &&
		+x >= 0
	);
}

function params(template: Path, path: Path) {
	const templateParts = template
		.slice(1)
		.split('/')
		.filter((s) => s.length > 0);

	const parts = path
		.slice(1)
		.split('/')
		.filter((s) => s.length > 0);

	assert(
		parts.length === templateParts.length,
		`Path '${path} should match its template '${template}'`,
	);

	const args = {} as { [k: string]: any };

	for (const templateElem of templateParts) {
		const pathElem = parts.shift();
		if (templateElem.startsWith(':')) {
			const key = templateElem.slice(1);
			// Convert the value to a number if it is an array index
			args[key] = isArrayIndex(pathElem) ? +pathElem : pathElem;
		} else {
			assert(
				templateElem === pathElem,
				`Path '${path} should match its template '${template}'`,
			);
		}
	}

	return args;
}

function of<TState = any, TPath extends Path = '/'>(
	template: TPath,
	path: Path,
	target: Context<TState, TPath>['target'],
): Context<TState, TPath> {
	const parts = path
		.slice(1)
		.split('/')
		.filter((s) => s.length > 0);

	// Get route parameters
	const args = params(template, path);

	// Create a lens for the path
	// use any since, because of the generics, the types are impossible
	// to get right. However, since we know that the path exists, we won't have
	// any undefined values
	const lens = parts.reduce(
		(l: any, p) => (isArrayIndex(p) ? l.nth(+p) : l.prop(p)),
		Optic.optic<TState>(),
	);

	return {
		...args,
		target,
		get(s: TState) {
			return Optic.get(lens)(s);
		},
		set(s: TState, a: Context<TState, TPath>['target']) {
			return Optic.set(lens)(a)(s);
		},
		// We are not going to bother validating types here
	} as any;
}

export { Operation } from './types';
export const Context = {
	of,
};

function isPath(x: unknown): x is Path {
	return (
		x != null &&
		typeof x === 'string' &&
		x.startsWith('/') &&
		/[-a-zA-Z0-9@:%._\\+~#?&\/=]*/.test(x)
	);
}

export const Path = {
	is: isPath,
};

export default Context;