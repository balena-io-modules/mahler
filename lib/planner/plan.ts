import type { PlanNode } from './node';
import type { PlanningStats, PlanningError } from './types';

import type { Operation } from 'mahler-wasm';

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
			start: PlanNode<TState> | null;

			/**
			 * The expected state at the end of the plan. This is
			 * probably not useful for end users, but is useful to keep
			 * track of intermediate steps in the planning process.
			 */
			state: TState;

			/**
			 * The changes that will be applied to the initial
			 * state as part of the plan. We need this in order
			 * to be able to merge the changes from parallel
			 * operations
			 */
			pendingChanges: Operation[];

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
