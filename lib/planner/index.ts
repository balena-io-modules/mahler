import { Distance } from '../distance';
import type { Target } from '../target';
import { Task } from '../task';
import { findPlan } from './findPlan';
import type { PlannerConfig } from './types';
import { Aborted } from './types';
import type { Plan } from './plan';
import { Node } from './node';
import { assert } from '../assert';

export * from './types';
export * from './plan';
export * from './node';

export interface Planner<TState = any> {
	/**
	 * Calculate a plan to get from the current state
	 * to the target state. It will throw an exception if a plan
	 * cannot be found.
	 */
	findPlan(current: TState, target: Target<TState>): Plan<TState>;
}

function reversePlan<T>(
	curr: Node<T> | null,
	prev: Node<T> | null = null,
): Node<T> | null | [Node<T>, Node<T> | null] {
	if (curr == null) {
		return prev;
	}

	if (Node.isFork(curr)) {
		// When reversing a fork node, we are turning the node
		// into an empty node. For this reason, we create the empty node
		// first that we pass as the `prev` argument to the recursive call to
		// reversePlan for each of the children
		const empty = Node.empty(prev);

		// We then recursively call reversePlan on each of the branches,
		// this will run until finding an empty node, at which point it will
		// return. The ends will be disconected so we will need to join them
		// as part of a new fork node
		const ends = curr.next.map((n) => reversePlan(n, empty));
		const forkNext: Array<Node<T>> = [];
		let next: Node<T> | null = null;
		for (const node of ends) {
			// If this fails the algorithm has a bug
			assert(node != null && Array.isArray(node));

			// We get the pointers from the fork node end
			const [p, n] = node;

			// The prev pointer of the fork end will be part of the
			// next list of the fork node
			forkNext.push(p);

			// Every next pointer should be the same, so we just assign it here
			next = n;
		}

		const fork = Node.fork(forkNext);

		// We continue the recursion here
		return reversePlan(next, fork);
	}

	if (Node.isAction(curr)) {
		const next = curr.next;
		curr.next = prev;
		return reversePlan(next, curr);
	}

	// If the node is empty, that means
	// that a previous node must exist
	assert(prev != null);

	// If empty we want the fork to handle
	// the continuation, so we need to return
	// the previous and next nodes of the empty node
	return [prev, curr.next];
}

function from<TState = any>({
	tasks: inputTasks = [],
	config = {},
}: {
	tasks?: Array<Task<TState, any, any>>;
	config?: Partial<PlannerConfig<TState>>;
}): Planner<TState> {
	const ids = new Set<string>();
	let tasks: Array<Task<TState, any, any>> = [];

	// Remove repeated tasks
	for (const task of inputTasks) {
		if (!ids.has(task.id)) {
			ids.add(task.id);
			tasks.push(task);
		}
	}

	// Sort the tasks putting methods and redirects first
	tasks = tasks.sort((a, b) => {
		if (Task.isMethod(a) && Task.isAction(b)) {
			return -1;
		}
		if (Task.isAction(a) && Task.isMethod(b)) {
			return 1;
		}
		return 0;
	});

	const {
		trace = () => {
			/* noop */
		},
		maxSearchDepth = 1000,
	} = config;

	return {
		findPlan(current: TState, target: Target<TState>) {
			// We clone the current state so the plan cannot be affected
			// by external changes (e.g. from sensors)
			current = structuredClone(current);
			const time = performance.now();
			trace({ event: 'start', target });
			try {
				const res = findPlan({
					initialPlan: {
						success: true,
						state: current,
						start: null,
						stats: { iterations: 0, maxDepth: 0, time: 0 },
						pendingChanges: [],
					},
					distance: Distance.from(current, target),
					tasks,
					trace,
					maxSearchDepth,
				});
				res.stats = { ...res.stats, time: performance.now() - time };
				if (res.success) {
					const start = reversePlan(res.start);
					assert(!Array.isArray(start));

					res.start = start;
					trace({ event: 'success', start });
				} else {
					trace({ event: 'failed' });
				}

				return res;
			} catch (e) {
				if (e instanceof Aborted) {
					trace(e);
					trace({ event: 'failed' });

					return { success: false, stats: e.stats, error: e };
				}
				throw e;
			}
		},
	};
}

export const Planner = {
	from,
};
