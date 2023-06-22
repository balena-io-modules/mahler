import { Target } from '../target';
import { Task } from '../task';
import { PlanningResult, PlannerConfig } from './types';
import { Diff } from '../diff';
import { assert } from '../assert';
import { findPlan } from './findPlan';

export * from './types';

export interface Planner<TState = any> {
	/**
	 * Calculate a plan to get from the current state
	 * to the target state. It will throw an exception if a plan
	 * cannot be found.
	 */
	findPlan(current: TState, target: Target<TState>): PlanningResult<TState>;
}

function of<TState = any>({
	tasks = [],
	config = {},
}: {
	tasks?: Array<Task<TState, any, any>>;
	config?: Partial<PlannerConfig>;
}): Planner<TState> {
	const taskIds = new Set<string>();
	tasks.forEach((t) => {
		assert(
			!taskIds.has(t.id),
			`Found duplicate task ID '${t.id}'. Task IDs must be unique`,
		);

		taskIds.add(t.id);
	});

	// Sort the tasks putting methods and redirects first
	tasks = tasks.sort((a, b) => {
		if ((Task.isMethod(a) || Task.isRedirect(a)) && Task.isAction(b)) {
			return -1;
		}
		if (Task.isAction(a) && (Task.isMethod(b) || Task.isRedirect(b))) {
			return 1;
		}
		return 0;
	});

	return {
		findPlan(current: TState, target: Target<TState>) {
			const time = performance.now();
			const res = findPlan({
				current,
				diff: Diff.of(current, target),
				tasks,
				trace: config.trace,
			});
			res.stats = { ...res.stats, time: performance.now() - time };
			return res;
		},
	};
}

export const Planner = {
	of,
};
