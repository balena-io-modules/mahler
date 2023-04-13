import * as Optic from 'optics-ts';
import * as assert from 'assert';
import { Path } from '../path';

import { ContextWithSlash, Identity } from './types';

/**
 * A Context type provides information about a desired change on a path
 *
 * The properties of a context object are the following
 *
 * @property op - The operation taking place
 * @property target - The target value of the referenced element (TODO: this probably should be undefined if the operation is `remove`)
 * @property params - If route parameters are given in the path, e.g. /people/:name/location, then this property includes the relevant values for the operation. e.g. if the change is in `/people/alice/location`, the params.name will have the value 'alice'
 * @property get - A function that returns the value of the referenced element on the state
 * @property set - A funciton that allows to modify the referenced element in a state object
 *
 * The functions `get` and `set` make the contet a functional lens, which by definition follows the following laws:
 *
 *  get(set(a)(s)) = a
 *  set(s, get(s)) = s
 *  set(set(s, a), a) = set(s,a)
 */
export type Context<S, P extends Path> = Identity<
	ContextWithSlash<S, S, P, {}>
>;

// Redeclare the type for exporting
export type ContextAsArgs<TState = any, TPath extends Path = '/'> = Identity<
	Omit<Context<TState, TPath>, 'get' | 'set'>
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
	const templateParts = Path.elems(template);
	const parts = Path.elems(path);

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
	const parts = Path.elems(path);

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

export const Context = {
	of,
};

export default Context;
