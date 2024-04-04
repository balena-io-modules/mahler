import type { Context, TaskOp } from './context';
import type { PathType, Root } from '../path';
import type { Action } from './instructions';

export const NoAction = async () => void 0;
export const NoEffect = () => void 0;

/**
 * A NoOp task is a task that does not change the state, it can
 * be added to the plan under some condition for debugging purposes
 */
export function NoOp<
	TState = any,
	TPath extends PathType = Root,
	TOp extends TaskOp = '*',
>(ctx: Context<TState, TPath, TOp>): Action<TState> {
	return Object.assign(NoAction, {
		_tag: 'action' as const,
		id: 'noop',
		path: ctx.path,
		target: (ctx as any).target,
		description: 'no-op',
		effect: NoEffect,
		condition: () => true,
	});
}
