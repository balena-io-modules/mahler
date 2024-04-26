import { Distance } from '../distance';
import type { Target } from '../target';
import { Task } from '../task';
import { findPlan } from './findPlan';
import type { PlannerConfig } from './types';
import { Aborted } from './types';
import type { Plan } from './plan';
import { assert } from '../assert';
import * as DAG from '../dag';

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
					const start = DAG.reverse(res.start);
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
