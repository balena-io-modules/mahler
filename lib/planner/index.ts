import { Diff } from '../diff';
import { Target } from '../target';
import { Task } from '../task';
import { findPlan } from './findPlan';
import { PlannerConfig } from './types';
import { Plan } from './plan';
import { Node } from './node';

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
): Node<T> | null {
	if (curr == null) {
		return prev;
	}
	if (Node.isFork(curr)) {
		// When reversing a fork node, we are turning the node
		// into an empty node. For this reason, we create the empty node
		// first that we pass as the `prev` argument to the recursive call to
		// reversePlan for each of the children
		const empty = { next: prev };
		curr.next.map((n) => reversePlan(n, empty));
		return empty;
	}

	const next = curr.next;
	curr.next = prev;
	return reversePlan(next, curr);
}

function of<TState = any>({
	tasks = [],
	config = {},
}: {
	tasks?: Array<Task<TState, any, any>>;
	config?: Partial<PlannerConfig<TState>>;
}): Planner<TState> {
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
	} = config;

	return {
		findPlan(current: TState, target: Target<TState>) {
			const time = performance.now();
			trace({ event: 'start', target });
			const res = findPlan({
				initialPlan: {
					success: true,
					state: current,
					start: null,
					stats: { iterations: 0, maxDepth: 0, time: 0 },
				},
				diff: Diff.of(current, target),
				tasks,
				trace,
			});
			res.stats = { ...res.stats, time: performance.now() - time };
			if (res.success) {
				res.start = reversePlan(res.start);
				trace({ event: 'success', start: res.start });
			} else {
				trace({ event: 'failed' });
			}

			return res;
		},
	};
}

export const Planner = {
	of,
};
