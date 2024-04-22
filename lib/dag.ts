import { assert } from './assert';

/**
 * An element in the DAG
 */
export interface Value {
	readonly _tag: 'value';

	/**
	 * The next step in the plan.
	 */
	next: Node | null;
}

/**
 * A fork node defines a branching in the DAG. A fork node can
 * have zero or more next nodes.
 */
export interface Fork {
	readonly _tag: 'fork';
	next: Node[];
}

/**
 * An join node is a node to indicate a joining of the branches
 * created by the split node.
 */
export interface Join {
	readonly _tag: 'join';
	next: Node | null;
}

export type Node = Value | Fork | Join;

export function isValue(n: Node): n is Value {
	return n._tag === 'value';
}

export function isFork(n: Node): n is Fork {
	return n._tag === 'fork';
}

type Visitor<T> =
	| { done: true; exited: boolean; acc: T }
	| { done: false; node: Join; acc: T };

interface Coords {
	/**
	 * Depth of the node on the DAG
	 */
	depth: number;
	/**
	 * Depth of the fork on the DAG
	 */
	fork: number;
	/**
	 * The index of the branch on its current fork
	 */
	branch: number;
	/**
	 * The index of the element within the current branch
	 */
	index: number;
}

// Utility function to visit every node while applying
// a reducer function
function visit<T, N extends Node>(
	root: Node | null,
	initial: T,
	reducer: (acc: T, n: N, coords: Coords) => T,
	exit: (acc: T) => boolean = () => false,
	coords: Coords = { fork: 0, branch: 0, index: 0, depth: 0 },
): Visitor<T> {
	if (root == null) {
		// We have reached the end of the graph without
		// triggering the exit condition

		return { done: true, exited: false, acc: initial };
	}

	//
	if (exit(initial)) {
		// The exit condition was met, terminate the search
		return { done: true, exited: true, acc: initial };
	}

	if (isValue(root)) {
		return visit(
			root.next,
			reducer(initial, root as N, coords),
			reducer,
			exit,
			{
				...coords,
				index: coords.index + 1,
				depth: coords.depth + 1,
			},
		);
	}

	// Process the node, we need to increase the fork index before
	// processing
	if (isFork(root)) {
		initial = reducer(initial, root as N, coords);
		let res = null;
		for (const [index, bNode] of root.next.entries()) {
			const r = visit(bNode, initial, reducer, exit, {
				...coords,
				index: 0,
				branch: index,
				fork: coords.fork + 1,
				depth: coords.depth + 1,
			});

			if (r.done && r.exited) {
				return r;
			} else if (!r.done) {
				res = r;
			}
			initial = r.acc;
		}

		// Call the reducer once on the join node
		let next = null;
		if (res != null) {
			assert(!res.done);
			initial = reducer(initial, res.node as N, coords);
			next = res.node.next;
		}

		return visit(next, initial, reducer, exit, {
			...coords,
			depth: coords.depth + 1,
		});
	}

	// if the first node of the graph is a JOIN then
	// we need to continue processing normally
	if (coords.depth === 0) {
		return visit(root.next, initial, reducer, exit, {
			...coords,
			depth: coords.depth + 1,
		});
	}

	return { done: false, node: root, acc: initial };
}

/**
 * Visit every node once, applying reducer function for every node and
 * exiting early if an exit predicate is met.
 *
 * Iteration of the dag is done Depth-first. When a fork node is
 * reached, branches are traversed in order until a join node (or a null) is found
 * before continuing with the following branch
 */
export function iterate<T>(
	node: Node | null,
	initial: T,
	reducer?: (acc: T, n: Node, c: Coords) => T,
	exit?: (acc: T) => boolean,
): T;
export function iterate<T, N extends Node>(
	node: N | null,
	initial: T,
	reducer?: (acc: T, n: N, c: Coords) => T,
	exit?: (acc: T) => boolean,
): T;
export function iterate<T, N extends Node>(
	node: N | null,
	initial: T,
	reducer: (acc: T, n: N, c: Coords) => T = (acc) => acc,
	exit: (acc: T) => boolean = () => false,
): T {
	const res = visit(node, initial, reducer, exit);
	return res.acc;
}

/**
 * Apply a reducer function to every element of the dag and return the
 * accumulated result
 *
 * The order of evaluation is given by the traverse function
 */
export function reduce<T>(
	node: Node | null,
	reducer: (acc: T, v: Value) => T,
	initial: T,
): T;
export function reduce<T, V extends Value>(
	node: Node | null,
	reducer: (acc: T, v: V) => T,
	initial: T,
): T;
export function reduce<T, V extends Value>(
	node: Node | null,
	reducer: (acc: T, v: V) => T,
	initial: T,
): T {
	return iterate(node, initial, (acc, n) => {
		if (isValue(n)) {
			return reducer(acc, n as V);
		}
		return acc;
	});
}

/**
 * Find the first element matching the predicate
 */
export function find(
	root: Node | null,
	condition: (v: Value) => boolean,
): Value | null;
export function find<V extends Value>(
	root: Node | null,
	condition: (v: V) => boolean,
): V | null;
export function find<V extends Value>(
	root: Node | null,
	condition: (v: V) => boolean,
): V | null {
	return iterate(
		root,
		null,
		// Select the node if it matches the condition
		(_: V | null, n) => (isValue(n) && condition(n as V) ? (n as V) : null),
		// Exit as soon as the node is found
		(v) => v != null,
	);
}

/**
 * Return true if every element in the dag satisfies the predicate
 */
export function every(
	node: Node | null,
	predicate: (v: Value) => boolean,
): boolean;
export function every<V extends Value>(
	node: Node | null,
	predicate: (v: V) => boolean,
): boolean;
export function every<V extends Value>(
	node: Node | null,
	predicate: (v: V) => boolean,
): boolean {
	return iterate(
		node,
		true,
		(res, t) => (isValue(t) ? res && predicate(t as V) : res),
		// Exit on the first false result
		(res) => !res,
	);
}

function indentIf(r: number, cond = true) {
	if (!cond) {
		return '';
	}
	return '  '.repeat(r);
}

/**
 * Returns a compact string representation of the plan, useful for debugging
 * and for comparing between results.
 *
 * The string representation of a plan works as follows
 * - `-` indicates a node in the plan
 * - `+` indicates a fork
 * - `~` indicates a branch in the fork
 * Depth of the node is indicated using indentation (2 spaces per level)
 *
 * For example, the following output:
 * - a
 * + ~ - b
 *     - c
 *   ~ - d
 * - f
 *
 * Indicates a plan that first performs an action 'a', then a fork is reached, where the first
 * branch will perform action 'b', then action 'c', and the second branch will perform action 'd'.
 * Finally the plan will perform action 'f'.
 *
 * Labels for the nodes are obtained by calling the toStr function on every value node.
 *
 * The `toStr` should not return new lines for the representation to work properly
 */
export function toString(
	root: Node | null,
	toStr: (v: Value) => string,
): string;
export function toString<V extends Value>(
	root: Node | null,
	toStr: (v: V) => string,
): string;
export function toString<V extends Value>(
	root: Node | null,
	toStr: (v: V) => string,
): string {
	const res = iterate(
		root,
		{ str: '', indent: -2 },
		(acc, node, { fork, branch, index }) => {
			let str = acc.str;
			if (index === 0 && fork > 0) {
				// add a `~` to mark the first element of the branch
				str += indentIf(acc.indent + 1, branch > 0) + '~ ';
			}

			if (isFork(node)) {
				acc.str = str + indentIf(acc.indent + 2, index > 0) + '+ ';

				// A new fork increases the base indent by 2
				acc.indent += 2;
				return acc;
			}

			if (isValue(node)) {
				str += indentIf(acc.indent + 2, index > 0) + '- ';
				str += toStr(node as V) + '\n';
				acc.str = str;
				return acc;
			}

			// An empty node resets the fork depth
			acc.indent -= 2;
			return acc;
		},
	);

	return res.str.trim();
}

export const Node = {
	value<T extends object>(data: T): Value & T {
		return { _tag: 'value', next: null, ...data };
	},
	fork(next: Node[] = []): Fork {
		return { _tag: 'fork', next };
	},
	join(next: Node | null = null): Join {
		return { _tag: 'join', next };
	},
};
