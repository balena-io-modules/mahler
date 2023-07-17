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

export interface PlannerConfig {
	/**
	 * A function used by the planner to debug the search
	 * for a plan. It defaults to a noop.
	 */
	trace: (...args: any[]) => void;
}

/**
 * A node defines a specific step in a plan.
 */
export interface Node<TState> {
	/**
	 * Unique id for the node. This is calculated from the
	 * action metadata and the current runtime state expected
	 * by the planner. This is used for loop detection in the plan.
	 */
	readonly id: string;

	/**
	 * The action to execute
	 */
	readonly action: Action<TState, any, any>;

	/**
	 * The next step in the plan
	 */
	next: Node<TState> | null;
}

export type Plan<TState> =
	| {
			/**
			 * A plan was found
			 */
			success: true;

			/**
			 * The initial step in the plan. If the start
			 * node is null, that means the plan is empty.
			 */
			start: Node<TState> | null;

			/**
			 * The expected state at the end of the plan. This is
			 * probably not useful for end users, but is useful to keep
			 * track of intermediate steps in the planning process.
			 */
			state: TState;

			/**
			 * The resulting stats of the planning process
			 */
			stats: PlanningStats;
	  }
	| {
			/**
			 * A plan could not be found
			 */
			success: false;

			/**
			 * The resulting stats of the planning process
			 */
			stats: PlanningStats;
	  };
