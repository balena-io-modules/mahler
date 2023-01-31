import { Task, Action } from './task';
import { Patch, patch } from './patch';

export interface Planner<TState = any> {
	/**
	 * Update the initial state
	 */
	initial(s: TState): Planner<TState>;

	/**
	 * Add a new task to the planner
	 */
	task(t: Task<TState, any, any>): Planner<TState>;

	/**
	 * Calculate a plan to get from the current state
	 * to the target state. It will throw an exception if a plan
	 * cannot be found.
	 */
	plan(target: Patch<TState>): Array<Action<TState>>;

	/**
	 * Calculate and follow the plan to the target state
	 */
	seek(target: Patch<TState>): Promise<TState>;
}

function plan<TState = any>(
	_initial: TState,
	_target: TState,
	_tasks: Array<Task<TState>>,
): Array<Action<TState>> {
	throw new Error('Planner not implemented');
}

function of<TState = any>(
	initial: TState,
	tasks = [] as Array<Task<TState, any, any>>,
): Planner<TState> {
	return {
		initial(s: TState) {
			return of(s, tasks);
		},
		task(t: Task<TState>) {
			return of(initial, [...tasks, t]);
		},
		plan(target: Patch<TState>) {
			return plan(initial, patch(initial, target), tasks);
		},
		seek(_target: Patch<TState>) {
			return Promise.reject('Not implemented');
		},
	};
}

export const Planner = {
	of,
};
