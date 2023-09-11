import * as Optic from 'optics-ts';
import assert from '../assert';
import { Path } from '../path';

import { ContextWithSlash, Identity, TaskOp } from './types';

export { TaskOp } from './types';

/**
 * A Context type provides information about a desired change on a path
 *
 * The properties of a context object are the following
 *
 * @property target - The target value of the referenced element. The target only exists for `create` or `update` operations
 * @property get - A function that returns the value of the referenced element on the state
 * @property set - A function that allows to modify the referenced element in a state object
 * @property del - A function that allows to delete the referenced element in a state object
 *
 * If the path defines any parameters using the `:<param>` syntax, the values of those parameters will also
 * be included in the Context object.
 *
 * The functions `get` and `set` make the contet a functional lens, which by definition follows the following laws:
 *
 *  get(set(a)(s)) = a
 *  set(s, get(s)) = s
 *  set(set(s, a), a) = set(s,a)
 */
export type Context<TState, TPath extends Path, TOp extends TaskOp> = Identity<
	ContextWithSlash<TState, TPath, TOp, TState, object>
>;

// Redeclare the type for exporting
export type ContextAsArgs<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> = Identity<
	Omit<Context<TState, TPath, TOp>, 'get' | 'set' | 'del' | 'op' | 'path'>
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

function of<TState, TPath extends Path, TOp extends 'update' | 'create'>(
	template: TPath,
	path: Path,
	target: Context<TState, TPath, TOp>['target'],
): Context<TState, TPath, TOp>;
function of<
	TState = any,
	TPath extends Path = '/',
	TOp extends 'delete' | '*' = 'delete',
>(template: TPath, path: Path): Context<TState, TPath, TOp>;
function of<
	TState,
	TPath extends Path,
	TOp extends TaskOp,
	TTState = TOp extends 'update' | 'create'
		? Context<TState, TPath, TOp>['target']
		: never,
>(template: TPath, path: Path, target?: TTState): Context<TState, TPath, TOp> {
	const parts = Path.elems(path);

	// Get route parameters
	const args = params(template, path);

	// Save the last element of the path so we can delete it
	const last = parts.pop();

	// Create a lens for the path
	// use any since, because of the generics, the types are impossible
	// to get right. However, since we know that the path exists, we won't have
	// any undefined values
	const parent = parts.reduce(
		(l: any, p) => (isArrayIndex(p) ? l.nth(+p) : l.prop(p)),
		Optic.optic<TState>(),
	);

	const lens =
		last != null
			? isArrayIndex(last)
				? parent.nth(+last)
				: parent.prop(last)
			: parent;

	return {
		...args,
		path,
		...(target && { target }),
		get(s: TState) {
			return Optic.get(lens)(s);
		},
		set(s: TState, a: TTState) {
			return Optic.set(lens)(a)(s);
		},
		del(s: TState): TState {
			let ps: any = Optic.get(parent)(s);
			if (last != null) {
				// Remove the element from the parent
				// state if it exists
				if (isArrayIndex(last)) {
					ps = ps.filter((_: any, i: number) => i !== +last);
				} else {
					const { [last]: _, ...rest } = ps;
					ps = rest;
				}

				// Return the modified object as the new state
				return Optic.set(parent)(ps)(s) as any;
			}
			return s;
		},
		// We are not going to bother validating types here
	} as any;
}

export const Context = {
	of,
};

export default Context;
