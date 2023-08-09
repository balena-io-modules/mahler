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

function reverse<T>(head: Node<T> | null): Node<T> | null {
	let curr = head;
	let prev: Node<T> | null = null;

	while (curr != null) {
		const next = curr.next;
		curr.next = prev;
		prev = curr;
		curr = next;
	}

	return prev;
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
				res.start = reverse(res.start);
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
