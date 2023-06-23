import { Context, TaskOp } from '../context';

import { Path } from '../path';

import { Action } from './instructions';
import { ActionTask, Task } from './tasks';
import { createInstructionId } from './utils';

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
const Pure = {
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
export const Initializer = {
	of: <
		TState = any,
		TPath extends Path = '/',
		TTarget extends Context<TState, TPath, 'create'>['target'] = Context<
			TState,
			TPath,
			'create'
		>['target'],
	>({
		create,
		condition = () => true,
		description,
		...props
	}: Omit<PureTaskProps<TState, TPath, 'create'>, 'op' | 'effect'> & {
		create: (t: TTarget) => TTarget;
	}): Task<TState, TPath, 'create'> =>
		// Only execute the task if the property does not exist
		Pure.of({
			op: 'create',
			condition: (s, c) => c.get(s) == null && condition(s, c),
			effect: (s, c) => c.set(s, create(c.target as any) as any),
			description: (c) =>
				description == null
					? `initialize '${c.path}'`
					: typeof description === 'function'
					? description(c)
					: description,
			...props,
		}),
};

/**
 * A disposer task is a pure task that is used to remove a
 * a property of the internal state of the system.
 * It is useful as a cleanup operation where there are no more changes needed
 * that affect the sub-state of a property but we want the property expunged from
 * the state.
 */
export const Disposer = {
	of: <TState = any, TPath extends Path = '/'>({
		condition,
		description,
		...props
	}: Omit<
		PureTaskProps<TState, TPath, 'delete'>,
		'op' | 'effect' | 'path' | 'condition'
	> &
		// Make the path required to prevent accidental deletion of the root
		Required<
			Pick<PureTaskProps<TState, TPath, 'delete'>, 'path' | 'condition'>
		>): Task<TState, TPath, 'delete'> =>
		// Only execute the task if the property does not exist
		Pure.of({
			op: 'delete',
			condition: (s, c) => c.get(s) != null && condition(s, c),
			effect: (s, c) => c.del(s),
			description: (c) =>
				description == null
					? `dispose '${c.path}'`
					: typeof description === 'function'
					? description(c)
					: description,
			...props,
		}),
};

/**
 * A NoOp task is a task that does not change the state, it can
 * be added to the plan under some condition for debugging purposes
 */
export function NoOp<
	TState = any,
	TPath extends Path = '/',
	TOp extends TaskOp = '*',
>(ctx: Context<TState, TPath, TOp>): Action<TState> {
	const id = createInstructionId('no-op', ctx.path, (ctx as any).target);

	return Object.assign((s: TState) => Promise.resolve(s), {
		_tag: 'action' as const,
		id,
		description: 'no-op',
		condition: () => true,
		effect: (s: TState) => s,
	});
}
