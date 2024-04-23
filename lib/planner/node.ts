import { createHash } from 'crypto';

import type { Action } from '../task';
import { Pointer } from '../pointer';

import * as dag from '../dag';

/**
 * An action node defines an executable step of a plan
 */
export interface ActionNode<TState> extends dag.Value {
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
	 * The next step in the plan.
	 */
	next: Node<TState> | null;
}

/**
 * A fork node defines a branching in the plan created
 * by the existence of a parallel task. A fork node can
 * have zero or more next nodes.
 */
export interface ForkNode<TState> extends dag.Fork {
	next: Array<Node<TState>>;
}

/**
 * An empty node is a node that doesn't specify a specific action but can be
 * use to indicate an empty step at the start of the plan, or a joining of the branches
 * created by the split node.
 */
export interface EmptyNode<TState> extends dag.Join {
	next: Node<TState> | null;
}

export type Node<TState> =
	| ActionNode<TState>
	| ForkNode<TState>
	| EmptyNode<TState>;

function isActionNode<TState>(n: Node<TState>): n is ActionNode<TState> {
	return dag.isValue(n);
}

function isForkNode<TState>(n: Node<TState>): n is ForkNode<TState> {
	return dag.isFork(n);
}

export const Node = {
	of<TState>(s: TState, a: Action<TState, any, any>): ActionNode<TState> {
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

		return dag.Node.value({
			id,
			action: a,
			next: null,
		});
	},
	empty<TState>(next: Node<TState> | null): EmptyNode<TState> {
		return dag.Node.join(next) as EmptyNode<TState>;
	},
	fork<TState>(next: Array<Node<TState>>): ForkNode<TState> {
		return dag.Node.fork(next) as ForkNode<TState>;
	},
	isAction: isActionNode,
	isFork: isForkNode,
};
