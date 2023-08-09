import { createHash } from 'crypto';

import { Action } from '../task';
import { Pointer } from '../pointer';

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

export const Node = {
	of: <TState>(s: TState, a: Action<TState, any, any>): Node<TState> => {
		// We don't use the full state to calculate the
		// id as there may be changes in the state that have nothing
		// to do with the action. We just use the part of the state
		// that is relevant to the action according to the path
		const state = Pointer.of(s, a.path);

		// md5 should be good enough for this purpose
		// and it's the fastest of the available options
		const id = createHash('md5')
			.update(
				JSON.stringify({
					id: a.id,
					path: a.path,
					state,
					...(a.target && { target: a.target }),
				}),
			)
			.digest('hex');

		return {
			id,
			action: a,
			next: null,
		};
	},
};
