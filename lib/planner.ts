import { Option, none } from 'fp-ts/lib/Option';
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
	 * to the target state
	 */
	plan(target: Patch<TState>): Option<Array<Action<TState>>>;
}

function plan<TState = any>(
	_initial: TState,
	_target: TState,
	_tasks: Array<Task<TState>>,
) {
	return none;
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
	};
}

export const Planner = {
	of,
};
