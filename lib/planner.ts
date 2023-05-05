import { Path } from './path';
import { Pointer } from './pointer';
import { Context } from './context';
import { Task, Action, Instruction, Method } from './task';
import { Target } from './target';
import { Diff } from './diff';
import { assert } from './assert';

export interface Planner<TState = any> {
	/**
	 * Calculate a plan to get from the current state
	 * to the target state. It will throw an exception if a plan
	 * cannot be found.
	 * TODO: accept a diff too
	 */
	plan(current: TState, target: Target<TState>): Array<Action<TState>>;
}

export interface PlannerOpts {
	/**
	 * A function used by the planner to debug the search
	 * for a plan. It defaults to a noop.
	 */
	trace: (...args: any[]) => void;
}

export class PlanNotFound extends Error {
	constructor() {
		super('Plan not found');
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
	// should we stop the operation entirely to avoid testing
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
	target: TState,
	diff: Diff<TState>,
	tasks: Array<Task<TState>>,
	trace: PlannerOpts['trace'],
	initial: Array<Action<TState>>,
): Array<Action<TState>> {
	// Get the list of operations from the patch
	const ops = diff.operations(current);

	// If there are no operations left, we have reached
	// the target
	if (ops.length === 0) {
		trace(`plan found`);
		return [];
	}

	trace('current state', JSON.stringify(current));
	trace('target state', JSON.stringify(target));
	trace('pending ops', JSON.stringify(ops));

	for (const op of ops) {
		// Find the tasks that are applicable to the operations
		const applicable = tasks.filter((t) => Task.isApplicable(t, op));
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

			const description =
				typeof task.description === 'function'
					? task.description(ctx)
					: task.description;

			// We check early if the action already exists on the path to
			// improve debugging
			if (Task.isAction(task)) {
				const action = task(ctx as any);
				if (initial.find((a) => Action.equals(a, action))) {
					continue;
				}
			}

			// If the task condition is not met, then go to the next task
			trace(`${description}: checking condition`);
			if (!task.condition(current, ctx)) {
				trace(`${description}: condition is not met`);
				continue;
			}
			trace(`${description}: condition met`);

			if (Task.isMethod(task)) {
				// If the task is a method we need to expand it recursively and check that none of
				// the operations has an invalid condition
				// if all of the operations are applicable, continue evaluating the plan with the
				// added operations
				trace(`${description}: expanding method`);
				const actions = expandMethod(current, task(ctx as any));
				if (actions.length === 0) {
					continue;
				}

				let state = current;
				let isValid = true;
				trace(`${description}: testing actions`);
				for (const action of actions) {
					trace(
						`${description}: action ${action.description}, testing condition`,
					);
					if (!action.condition(state)) {
						trace(
							`${description}: action ${action.description}, condition is not met`,
							'State',
							JSON.stringify(state),
						);
						isValid = false;
						break;
					}
					trace(`${description}: action ${action.description}, condition met`);

					// Prevent loops by avoiding adding the same instruction over
					// and over to the plane
					if (initial.find((a) => Action.equals(a, action))) {
						trace(
							`${description}: action ${action.description} is already on the plan`,
						);
						isValid = false;
						break;
					}
					state = action.effect(state);
				}

				// This is not a valid path
				if (!isValid) {
					continue;
				}
				trace(`${description}: selected`);

				// This is a valid path, continue finding a plan recursively
				try {
					const next = plan(state, target, diff, tasks, trace, [
						...initial,
						...actions,
					]);

					// TODO: how can we know if there is a shorter path available?
					return [...actions, ...next];
				} catch (e) {
					if (!(e instanceof PlanNotFound)) {
						throw e;
					}
					// No plans found under this branch
					continue;
				}
			} else {
				// If the task is an action, then we can just apply it
				const action = task(ctx as any);
				const state = action.effect(current);

				trace(`${description}: selected`);
				try {
					const next = plan(state, target, diff, tasks, trace, [
						...initial,
						action,
					]);
					return [action, ...next];
				} catch (e) {
					if (!(e instanceof PlanNotFound)) {
						throw e;
					}
					// No plans found under this branch
					continue;
				}
			}
		}
	}

	throw new PlanNotFound();
}

function of<TState = any>({
	tasks = [],
	opts: userOpts = {},
}: {
	tasks?: Array<Task<TState, any, any>>;
	opts?: Partial<PlannerOpts>;
}): Planner<TState> {
	const taskIds = new Set<string>();
	tasks.forEach((t) => {
		assert(
			!taskIds.has(t.id),
			`Found duplicate task ID '${t.id}'. Task IDs must be unique`,
		);

		taskIds.add(t.id);
	});

	const opts = {
		trace: () => {
			/* noop */
		},
		...userOpts,
	};

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
			const diff = Diff.of(target);
			return plan(current, diff.patch(current), diff, tasks, opts.trace, []);
		},
	};
}

export const Planner = {
	of,
};
