import { Node } from './node';
import { PlanningStats, PlanningError } from './types';

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

			/**
			 * The error that caused the plan to fail
			 */
			error: PlanningError;
	  };
