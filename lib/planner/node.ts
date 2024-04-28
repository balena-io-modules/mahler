import { createHash } from 'crypto';

import { Action } from '../task';
import { Pointer } from '../pointer';

import type { Join, Fork } from '../dag';
import * as DAG from '../dag';

/**
 * An action node defines an executable step of a plan
 */
export interface PlanAction<TState> extends DAG.Value {
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
}

export type PlanNode<TState> = PlanAction<TState> | Fork | Join;

function isPlanAction<TState>(n: DAG.Node): n is PlanAction<TState> {
	return (
		DAG.isValue(n) && (n as any).action != null && Action.is((n as any).action)
	);
}

export const PlanAction = {
	/**
	 * Create a new Plan action node from a given action and a state
	 */
	from<TState>(s: TState, a: Action<TState, any, any>): PlanAction<TState> {
		// We don't use the full state to calculate the
		// id as there may be changes in the state that have nothing
		// to do with the action. We just use the part of the state
		// that is relevant to the action according to the path
		const state = Pointer.from(s, a.path);

		// md5 should be good enough for this purpose
		// and it's the fastest of the available options
		// TODO: this is sensitive to key reordering, we might
		// need sorting before, but we need to benchmark first
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

		return DAG.createValue({
			id,
			action: a,
			next: null,
		});
	},
	is: isPlanAction,
};
