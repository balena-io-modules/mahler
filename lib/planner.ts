import { createPatch } from 'rfc6902';

import { Path } from './path';
import { Pointer } from './pointer';
import { Context } from './context';
import { Task, Action, Instruction, Method } from './task';
import { Goal } from './goal';
import { Operation } from './operation';
import { patch, equals } from './json';

export interface Planner<TState = any> {
	/**
	 * Calculate a plan to get from the current state
	 * to the target state. It will throw an exception if a plan
	 * cannot be found.
	 */
	plan(current: TState, target: Goal<TState>): Array<Action<TState>>;
}

function extractPath(t: Path, p: Path) {
	const tParts = Path.elems(t);
	const pParts = Path.elems(p);

	return (
		'/' +
		tParts
			.map((e, i) => {
				if (e.startsWith(':')) {
					return pParts[i];
				}
				return e;
			})
			.join('/')
	);
}

function expandMethod<TState = any>(
	state: TState,
	instruction: Instruction<TState>,
): Array<Action<TState>> {
	// QUESTION: if some instructions are not applicable,
	// should we stop the operation entirely to avoid creating
	// a plan that is not valid?
	if (Method.is(instruction)) {
		return instruction
			.method(state)
			.map((i) => expandMethod(state, i))
			.flat();
	}

	return [instruction];
}

// Parameters for the plan function
// Level
// Target as a combination of the level patches
// Tentative plan
// Stack ?
function plan<TState = any>(
	current: TState,
	target: TState,
	tasks: Array<Task<TState>>,
	initial: Array<Action<TState>>,
): Array<Action<TState>> {
	// We patch the current state with the target before comparing
	// so any optional elements in the state object can be ignored
	// in the comparison
	if (equals(current, patch(current, target))) {
		return [];
	}
	// compare current and target state objects using json diff
	const ops = createPatch(current, target).map((p) =>
		Operation.fromRFC6902<TState>(p as any),
	);

	const unapplied = [] as Array<Operation<TState>>;
	for (const op of ops) {
		// Find the tasks that are applicable to the operations
		const applicable = tasks.filter((t) => Task.isApplicable(t, op));
		if (applicable.length === 0) {
			unapplied.push(op);
		}

		for (const task of applicable) {
			// Extract the path from the task template and the
			// operation
			const path = extractPath(task.path, op.path);

			// Get the context expected by the task
			// we get the target value for the context from the pointer
			// if the operation is delete, the pointer will be undefined
			// which is the right value for that operation
			const ctx = Context.of<TState>(
				task.path,
				path,
				Pointer.of(target, path)!,
			);

			// If the task condition is not met, then go to the next task
			if (!task.condition(current, ctx)) {
				continue;
			}

			if (Task.isMethod(task)) {
				// If the task is a method we need to expand it recursively and check that none of
				// the operations has an invalid condition
				// if all of the operations are applicable, continue evaluating the plan with the
				// added operations
				const actions = expandMethod(current, task(ctx as any));
				if (actions.length === 0) {
					continue;
				}

				let s = current;
				let isValid = true;
				for (const action of actions) {
					if (!action.condition(s)) {
						isValid = false;
						break;
					}

					// Prevent loops by avoiding adding the same instruction over
					// and over to the plane
					if (initial.find((a) => Action.equals(a, action))) {
						isValid = false;
						break;
					}
					s = action.effect(s);
				}

				// This is not a valid path
				if (!isValid) {
					continue;
				}

				// This is a valid path, continue finding a plan recursively
				try {
					const next = plan(s, target, tasks, [...initial, ...actions]);

					// TODO: how can we know if there is a shorter path available?
					return [...actions, ...next];
				} catch (e) {
					const u = e as Operation[];
					u.forEach((o) => {
						if (!unapplied.find((eo) => equals(eo, o))) {
							unapplied.push(o);
						}
					});
					// No plans found under this branch
					continue;
				}
			}

			// If the task is an action, then we can just apply it
			const action = task(ctx as any);
			if (initial.find((a) => Action.equals(a, action))) {
				continue;
			}
			const s = action.effect(current);

			try {
				const next = plan(s, target, tasks, [...initial, action]);
				return [action, ...next];
			} catch (e) {
				const u = e as Operation[];
				u.forEach((o) => {
					if (!unapplied.find((eo) => equals(eo, o))) {
						unapplied.push(o);
					}
				});
				// No plans found under this branch
				continue;
			}
		}
	}

	throw unapplied;
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
			try {
				return plan(current, patch(current, target), tasks, []);
			} catch (e: any) {
				if (e.length) {
					throw new Error(
						`No plan found, no applicable tasks found for: ${JSON.stringify(
							e,
						)}`,
					);
				}

				throw new Error(`No plan found`);
			}
		},
	};
}

export const Planner = {
	of,
};
