import { Op } from '../operation';
import { Path } from '../path';
import { Identity } from '../identity';
import { LensContext } from '../lens';

export type TaskOp = Op | '*';

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
	TOp extends '*' | 'delete'
		? Omit<LensContext<TState, TPath>, 'target'>
		: LensContext<TState, TPath>
>;

// Redeclare the type for exporting
export type TaskArgs<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> = Identity<Omit<Context<TState, TPath, TOp>, 'path'>>;

function from<TState, TPath extends Path, TOp extends TaskOp>(
	lensCtx: LensContext<TState, TPath>,
): Context<TState, TPath, TOp> {
	return lensCtx as any;
}

export const Context = {
	from,
};

export default Context;
