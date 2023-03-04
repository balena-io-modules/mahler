// import * as rfc6902 from 'rfc6902';

import { Task, Action } from './task';
import { Goal } from './goal';
import { patch } from './json';

export interface Planner<TState = any> {
	/**
	 * Calculate a plan to get from the current state
	 * to the target state. It will throw an exception if a plan
	 * cannot be found.
	 */
	plan(current: TState, target: Goal<TState>): Array<Action<TState>>;
}

// Parameters for the plan function
// Level
// Target as a combination of the level patches
// Tentative plan
// Stack ?
function plan<TState = any>(
	_current: TState,
	_target: TState,
	_tasks: Array<Task<TState>>,
): Array<Action<TState>> {
	// TODO: compare current and target state objects using json diff
	// const _diff = rfc6902.createPatch(current, target);
	// TODO: find a task for the current level json object that can be applied
	// TODO: group all operatios in the diff as an update operation
	// TODO: apply the task, if it's a method, add the output to the top of the instruction list
	// TODO: go through the instruction list and apply the tasks to the current state object sequentially
	//  TODO: if the top of the stack is a method instruction, apply and add the resulting tasks to the tentative plan.
	// If at any point we reach the target state, then return the plan
	// TODO: if the end of the instruction list is reached and we have not reached the target state
	// then look for another applicable task on this level
	// TODO: if no applicable task is found, then look for a task on the next level ?
	// QUESTION: how do we keep track of the actions that we have already used? If we are using a method, then we'll get a
	// few actions applied to a specific path. We don't want to use the same action with the same context so we need
	// to take that out of the applicable list
	// QUESTION: if multiple methods are applicable, how do we know if there is a shorter path available?
	// QUESTION: what if the method is applicable, but one of the submethod or actions is not? we need to remove all the subtasks from the stack
	throw new Error('Planner not implemented');
}

function of<TState = any>(
	tasks = [] as Array<Task<TState, any, any>>,
): Planner<TState> {
	// Sort the tasks putting methods first
	tasks = tasks.sort((a, b) => {
		if (Task.isMethod(a) && Task.isAction(b)) {
			return -1;
		}
		if (Task.isAction(a) && Task.isMethod(b)) {
			return 1;
		}
		return 0;
	});

	return {
		plan(current: TState, target: Goal<TState>) {
			return plan(current, patch(current, target), tasks);
		},
	};
}

export const Planner = {
	of,
};
