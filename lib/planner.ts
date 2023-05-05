import { Path } from './path';
import { Pointer } from './pointer';
import { Context } from './context';
import { Task, Action, Instruction, Method } from './task';
import { Target } from './target';
import { Diff } from './diff';
import { assert } from './assert';

interface PlannerStats {
	/**
	 * Number of iterations (tasks tested) in total
	 */
	iterations: number;

	/**
	 * Search depth
	 */
	depth: number;

	/**
	 * Total search time in ms
	 */
	time: number;
}

export type PlannerResult<TState> =
	| { success: true; plan: Array<Action<TState>>; stats: PlannerStats }
	| { success: false; stats: PlannerStats };

export interface Planner<TState = any> {
	/**
	 * Calculate a plan to get from the current state
	 * to the target state. It will throw an exception if a plan
	 * cannot be found.
	 * TODO: accept a diff too
	 */
	find(current: TState, target: Target<TState>): PlannerResult<TState>;
}

export interface PlannerOpts {
	/**
	 * A function used by the planner to debug the search
	 * for a plan. It defaults to a noop.
	 */
	trace: (...args: any[]) => void;
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
function findPlan<TState = any>({
	current,
	target,
	diff,
	tasks,
	trace = () => {
		/* noop */
	},
	initial = [],
	stats = { iterations: 0, depth: 0, time: 0 },
}: {
	current: TState;
	target: TState;
	diff: Diff<TState>;
	tasks: Array<Task<TState>>;
	trace?: PlannerOpts['trace'];
	initial?: Array<Action<TState>>;
	stats?: PlannerStats;
}): PlannerResult<TState> {
	// Get the list of operations from the patch
	const ops = diff.operations(current);

	// If there are no operations left, we have reached
	// the target
	if (ops.length === 0) {
		return { success: true, plan: [], stats };
	}

	trace({
		depth: stats.depth,
		current,
		target,
		pending: ops,
		plan: initial.map((a) => a.description),
	});
	for (const operation of ops) {
		// Find the tasks that are applicable to the operations
		const applicable = tasks.filter((t) => Task.isApplicable(t, operation));
		for (const task of applicable) {
			stats.iterations++;

			// Extract the path from the task template and the
			// operation
			const path = extractPath(task.path, operation.path);

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
			trace({
				depth: stats.depth,
				operation,
				task: description,
				status: 'checking condition',
			});
			if (!task.condition(current, ctx)) {
				trace({
					depth: stats.depth,
					operation,
					task: description,
					status: 'condition is not met',
				});
				continue;
			}

			if (Task.isMethod(task)) {
				// If the task is a method we need to expand it recursively and check that none of
				// the operations has an invalid condition
				// if all of the operations are applicable, continue evaluating the plan with the
				// added operations
				trace({
					depth: stats.depth,
					operation,
					method: description,
					status: 'expanding method',
				});
				const actions = expandMethod(current, task(ctx as any));
				if (actions.length === 0) {
					continue;
				}

				let state = current;
				let isValid = true;
				for (const action of actions) {
					trace({
						depth: stats.depth,
						operation,
						method: description,
						action: action.description,
						status: 'testing condition',
					});
					if (!action.condition(state)) {
						trace({
							depth: stats.depth,
							operation,
							method: description,
							action: action.description,
							status: 'condition is not met',
							state,
						});
						isValid = false;
						break;
					}

					// Prevent loops by avoiding adding the same instruction over
					// and over to the plane
					if (initial.find((a) => Action.equals(a, action))) {
						trace({
							depth: stats.depth,
							operation,
							method: description,
							action: action.description,
							status: 'action already in plan',
						});
						isValid = false;
						break;
					}
					state = action.effect(state);
				}

				// This is not a valid path
				if (!isValid) {
					continue;
				}
				trace({
					depth: stats.depth,
					operation,
					method: description,
					status: 'selected',
				});

				// This is a valid path, continue finding a plan recursively
				const res = findPlan({
					current: state,
					target,
					diff,
					tasks,
					trace,
					initial: [...initial, ...actions],
					stats: { ...stats, depth: stats.depth + 1 },
				});

				if (res.success) {
					return { ...res, plan: [...actions, ...res.plan] };
				}
			} else {
				// If the task is an action, then we can just apply it
				const action = task(ctx as any);
				const state = action.effect(current);

				trace({
					depth: stats.depth,
					operation,
					action: description,
					status: 'selected',
				});
				const res = findPlan({
					current: state,
					target,
					diff,
					tasks,
					trace,
					initial: [...initial, action],
					stats: { ...stats, depth: stats.depth + 1 },
				});

				if (res.success) {
					return { ...res, plan: [action, ...res.plan] };
				}
			}
		}
	}

	return { success: false, stats };
}

function of<TState = any>({
	tasks = [],
	opts = {},
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
		find(current: TState, target: Target<TState>) {
			const diff = Diff.of(target);
			const time = performance.now();
			const res = findPlan({
				current,
				target: diff.patch(current),
				diff,
				tasks,
				trace: opts.trace,
			});
			res.stats = { ...res.stats, time: performance.now() - time };
			return res;
		},
	};
}

export const Planner = {
	of,
};
