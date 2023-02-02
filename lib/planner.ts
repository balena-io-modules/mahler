import { Task, Action } from './task';
import { Patch, patch } from './patch';

export interface Planner<TState = any> {
	/**
	 * Calculate a plan to get from the current state
	 * to the target state. It will throw an exception if a plan
	 * cannot be found.
	 */
	plan(current: TState, target: Patch<TState>): Array<Action<TState>>;
}

function plan<TState = any>(
	_current: TState,
	_target: TState,
	_tasks: Array<Task<TState>>,
): Array<Action<TState>> {
	throw new Error('Planner not implemented');
}

function of<TState = any>(
	tasks = [] as Array<Task<TState, any, any>>,
): Planner<TState> {
	return {
		plan(current: TState, target: Patch<TState>) {
			return plan(current, patch(current, target), tasks);
		},
	};
}

export const Planner = {
	of,
};
