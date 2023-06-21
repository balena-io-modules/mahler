import { Action } from '../task';

/**
 * Stats about the planning process
 */
export interface PlanningStats {
	/**
	 * Number of iterations (tasks tested) in total
	 */
	iterations: number;

	/**
	 * Maximum search depth
	 */
	maxDepth: number;

	/**
	 * Total search time in ms
	 */
	time: number;
}

/**
 * Result of the planning process
 */
export type PlanningResult<TState> =
	| {
			/**
			 * Planning was successful
			 */
			success: true;
			/**
			 * The plan to get from the current state to the target state
			 */
			plan: Array<Action<TState>>;
			/**
			 * The expected state after applying the plan
			 */
			state: TState;
			/**
			 * Stats about the planning process
			 */
			stats: PlanningStats;
	  }
	| {
			/**
			 * Planning was not successful
			 */
			success: false;

			/**
			 * Stats about the planning process
			 */
			stats: PlanningStats;
	  };

export interface PlannerConfig {
	/**
	 * A function used by the planner to debug the search
	 * for a plan. It defaults to a noop.
	 */
	trace: (...args: any[]) => void;
}
