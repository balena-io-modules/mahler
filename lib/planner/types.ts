import type { Operation } from '../operation';
import type { Target } from '../target';
import type { Instruction, Method } from '../task';

import type { PlanNode } from './node';

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

export type PlanningEvent<TState> =
	| {
			/**
			 * Planning has started
			 */
			event: 'start';
			/**
			 * The target state to reach
			 */
			target: Target<TState>;
	  }
	| {
			/**
			 * Search expansion started
			 */
			event: 'find-next';

			/**
			 * The last node in the plan
			 */
			prev: PlanNode<TState> | null;
			/**
			 * The current state at this planning stage
			 */
			state: TState;
			/**
			 * The current search depth
			 */
			depth: number;

			/**
			 * List of pending operations
			 */
			operations: Array<Operation<TState, any>>;
	  }
	| {
			/**
			 * An instruction was chosen
			 */
			event: 'try-instruction';

			/**
			 * The caller instruction
			 */
			parent: Method<TState, any, any> | undefined;

			/**
			 * The previous node in the plan
			 */
			prev: PlanNode<TState> | null;

			/**
			 * The instruction chosen
			 */
			instruction: Instruction<TState, any, any>;

			/**
			 * What is the operation for which the instruction
			 * was chosen
			 */
			operation: Operation<TState, any>;

			/**
			 * The current state at this planning state. If the instruction
			 * is a method, the current state may evolve as the method is unwrapped
			 */
			state: TState;
	  }
	| { event: 'backtrack-method'; method: Method<TState>; state: TState }
	| {
			/**
			 * No more operations remain to be tested
			 */
			event: 'found';

			/**
			 * The last node added to the plan
			 */
			prev: PlanNode<TState> | null;
	  }
	| {
			/**
			 * A plan was found
			 */
			event: 'success';

			/**
			 * The start node of the plan
			 */
			start: PlanNode<TState> | null;
	  }
	| {
			/**
			 * Failed to find a plan
			 */
			event: 'failed';
	  };

export class PlanningError extends Error {
	event = 'error' as const;
	constructor(reason: string, cause?: unknown) {
		super(reason, { cause });
	}
}

export const ConditionNotMet = new PlanningError('Task condition was not met');
export const LoopDetected = new PlanningError(
	'A loop was introduced by the task',
);
export const MethodExpansionEmpty = new PlanningError(
	'No instructions were returned by this method',
);
export const SearchFailed = new PlanningError(
	'No more applicable tasks found at this search depth',
);
export class Aborted extends PlanningError {
	constructor(
		cause: unknown,
		public stats: PlanningStats,
	) {
		super((cause as Error).message ?? cause, cause);
	}
}

export type Trace<TState> = (e: PlanningEvent<TState> | PlanningError) => void;

export interface PlannerConfig<TState> {
	/**
	 * A function used by the planner to debug the search
	 * for a plan. It defaults to a noop.
	 */
	trace: Trace<TState>;

	/**
	 * Max search depth before giving up. Defaults to 1000.
	 *
	 * While the planner implements loop detection, depending on the task
	 * implementation, there still can be cases where the planner can keep adding
	 * the same action in an infinite loop. This parameter allows to stop the
	 * search after a certain number of iterations to avoid this.
	 */
	maxSearchDepth: number;
}
