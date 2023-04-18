import { Path } from './path';
import { Pointer } from './pointer';
import { Context } from './context';
import { Task, Action, Instruction, Method } from './task';
import { Target } from './target';
import { Diff } from './diff';
import { Operation } from './operation';
import { equals } from './json';
import { assert } from './assert';

export interface Planner<TState = any> {
	/**
	 * Calculate a plan to get from the current state
	 * to the target state. It will throw an exception if a plan
	 * cannot be found.
	 */
	plan(current: TState, target: Target<TState>): Array<Action<TState>>;
}

export class PlanNotFound extends Error {
	constructor(readonly unapplied: Operation[] = []) {
		super(
			'Plan not found' +
				(unapplied.length > 0
					? `, no tasks could be applied to ops: ${JSON.stringify(unapplied)}`
					: ''),
		);
	}
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
		return instruction.expand(state).flatMap((i) => expandMethod(state, i));
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
	diff: Diff<TState>,
	tasks: Array<Task<TState>>,
	initial: Array<Action<TState>>,
): Array<Action<TState>> {
	// Get the list of operations from the patch
	const ops = diff.operations(current);

	// If there are no operations left, we have reached
	// the target
	if (ops.length === 0) {
		return [];
	}

	const target = diff.patch(current);

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

				let state = current;
				let isValid = true;
				for (const action of actions) {
					if (!action.condition(state)) {
						isValid = false;
						break;
					}

					// Prevent loops by avoiding adding the same instruction over
					// and over to the plane
					if (initial.find((a) => Action.equals(a, action))) {
						isValid = false;
						break;
					}
					state = action.effect(state);
				}

				// This is not a valid path
				if (!isValid) {
					continue;
				}

				// This is a valid path, continue finding a plan recursively
				try {
					const next = plan(state, diff, tasks, [...initial, ...actions]);

					// TODO: how can we know if there is a shorter path available?
					return [...actions, ...next];
				} catch (e) {
					if (!(e instanceof PlanNotFound)) {
						throw e;
					}

					e.unapplied.forEach((o) => {
						if (!unapplied.find((eo) => equals(eo, o))) {
							unapplied.push(o);
						}
					});

					// No plans found under this branch
					continue;
				}
			} else {
				// If the task is an action, then we can just apply it
				const action = task(ctx as any);
				if (initial.find((a) => Action.equals(a, action))) {
					continue;
				}
				const state = action.effect(current);

				try {
					const next = plan(state, diff, tasks, [...initial, action]);
					return [action, ...next];
				} catch (e) {
					if (!(e instanceof PlanNotFound)) {
						throw e;
					}

					e.unapplied.forEach((o) => {
						if (!unapplied.find((eo) => equals(eo, o))) {
							unapplied.push(o);
						}
					});
					// No plans found under this branch
					continue;
				}
			}
		}
	}

	throw new PlanNotFound(unapplied);
}

function of<TState = any>(
	tasks = [] as Array<Task<TState, any, any>>,
): Planner<TState> {
	const taskIds = new Set<string>();
	tasks.forEach((t) => {
		assert(
			!taskIds.has(t.id),
			`Found duplicate task ID '${t.id}'. Task IDs must be unique`,
		);

		taskIds.add(t.id);
	});

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
		plan(current: TState, target: Target<TState>) {
			const patch = Diff.of(target);
			return plan(current, patch, tasks, []);
		},
	};
}

export const Planner = {
	of,
};
