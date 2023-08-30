import { Operation } from 'lib/operation';
import { Target } from '../target';
import { Instruction, Method, Parallel } from '../task';
import { Operation as PatchOperation } from 'mahler-wasm';

import { Node } from './node';

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
			prev: Node<TState> | null;
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
			parent: Method<TState, any, any> | Parallel<TState, any, any> | undefined;

			/**
			 * The previous node in the plan
			 */
			prev: Node<TState> | null;

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
	| {
			/**
			 * No more operations remain to be tested
			 */
			event: 'found';

			/**
			 * The last node added to the plan
			 */
			prev: Node<TState> | null;
	  }
	| {
			/**
			 * A plan was found
			 */
			event: 'success';

			/**
			 * The start node of the plan
			 */
			start: Node<TState> | null;
	  }
	| {
			/**
			 * Failed to find a plan
			 */
			event: 'failed';
	  };

// Instruction condition failed error
export const ConditionNotMet = {
	event: 'error' as const,
	cause: 'condition-failed' as const,
};
export type ConditionNotMet = typeof ConditionNotMet;

// Loop detected error
export const LoopDetected = {
	event: 'error' as const,
	cause: 'loop-detected' as const,
};
export type LoopDetected = typeof LoopDetected;

// Expanding the method returned an empty array
export const MethodExpansionEmpty = {
	event: 'error' as const,
	cause: 'method-expansion-empty' as const,
};
export type MethodExpansionEmpty = typeof MethodExpansionEmpty;

// Recursion in a method detected error
export const RecursionDetected = {
	event: 'error' as const,
	cause: 'recursion-detected' as const,
};
export type RecursionDetected = typeof RecursionDetected;

export function SearchFailed(depth: number) {
	return {
		event: 'error' as const,
		cause: 'search-failed' as const,
		depth,
	};
}

export type SearchFailed = ReturnType<typeof SearchFailed>;

export function MergeFailed(failure: Error) {
	return {
		event: 'error' as const,
		cause: 'merge-error' as const,
		failure,
	};
}

export type MergeFailed = ReturnType<typeof MergeFailed>;

export function ConflictDetected(conflict: [PatchOperation, PatchOperation]) {
	return {
		event: 'error' as const,
		cause: 'conflict-detected' as const,
		conflict,
	};
}

export type ConflictDetected = ReturnType<typeof ConflictDetected>;

export type PlanningError =
	| ConditionNotMet
	| LoopDetected
	| RecursionDetected
	| MethodExpansionEmpty
	| SearchFailed
	| MergeFailed
	| ConflictDetected;

export interface PlannerConfig<TState> {
	/**
	 * A function used by the planner to debug the search
	 * for a plan. It defaults to a noop.
	 */
	trace: (e: PlanningEvent<TState> | PlanningError) => void;
}
