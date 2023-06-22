import { TaskOp } from '../context';
import { Path } from '../path';

import { ActionTask, Task } from './tasks';

export const NoAction = <T>(s: T) => Promise.resolve(s);
export const NoEffect = <T>(s: T) => s;

/**
 * A pure task does not have an `action` property
 * and requires that `op` is defined
 */
type PureTaskProps<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = 'update',
> = Partial<Omit<ActionTask<TState, TPath, TOp>, 'effect' | 'action' | 'op'>> &
	Pick<ActionTask<TState, TPath, TOp>, 'effect' | 'op'>;

/**
 * A pure task is a task that has no side effects,
 * that is, it does not interact with the underlying system being
 * controlled, it only transforms the internal state of the agent/planner
 * in some way.
 */
export const Pure = {
	of: <TState = any, TPath extends Path = '/', TOp extends TaskOp = 'update'>({
		effect,
		...props
	}: PureTaskProps<TState, TPath, TOp>) =>
		Task.of({
			effect,
			...props,
			action: (s, c) => Promise.resolve(effect(s, c)),
		}),
};

/**
 * A constructor task is a pure task that is used to initialize
 * the value of a property in the internal state of the system.
 * It is useful in the case of nested properties, where creating the
 * parent property has no effects on the system but is necessary in order
 * for a task for the creation of the child property to be picked up.
 */
export const Constructor = {
	of: <TState = any, TPath extends Path = '/'>(
		props: Omit<PureTaskProps<TState, TPath, 'create'>, 'op'>,
	) =>
		// Only execute the task if the property does not exist
		Pure.of({ op: 'create', condition: (s, c) => c.get(s) == null, ...props }),
};
