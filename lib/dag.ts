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
	| { done: true; exited?: boolean; acc: T }
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

// Utility function to visit every node in the DAG in a
// depth first fashion, applying a reducer function to every
// node
function iter<T, N extends Node>(
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
		return iter(root.next, reducer(initial, root as N, coords), reducer, exit, {
			...coords,
			index: coords.index + 1,
			depth: coords.depth + 1,
		});
	}

	// Process the node, we need to increase the fork index before
	// processing
	if (isFork(root)) {
		initial = reducer(initial, root as N, coords);
		let res = null;
		for (const [index, bNode] of root.next.entries()) {
			const r = iter(bNode, initial, reducer, exit, {
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

		return iter(next, initial, reducer, exit, {
			...coords,
			depth: coords.depth + 1,
		});
	}

	// if the first node of the graph is a JOIN then
	// we just ignore it
	if (coords.depth === 0) {
		return iter(root.next, initial, reducer, exit, coords);
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
export function reduceWhile<T>(
	node: Node | null,
	initial: T,
	reducer?: (acc: T, n: Node, c: Coords) => T,
	exit?: (acc: T) => boolean,
): T;
export function reduceWhile<T, N extends Node>(
	node: N | null,
	initial: T,
	reducer?: (acc: T, n: N, c: Coords) => T,
	exit?: (acc: T) => boolean,
): T;
export function reduceWhile<T, N extends Node>(
	node: N | null,
	initial: T,
	reducer: (acc: T, n: N, c: Coords) => T = (acc) => acc,
	exit: (acc: T) => boolean = () => false,
): T {
	const res = iter(node, initial, reducer, exit);
	return res.acc;
}

// Traverse the DAG following branches of a forking node in parallel
// and combining results after
function iterParallel<V extends Value, F extends Fork, J extends Join, T>(
	root: Node | null,
	initial: T,
	reducer: (acc: T, n: V | F, coords: Coords) => T,
	combiner: (acc: T[], n: J) => T,
	coords: Coords = { fork: 0, branch: 0, index: 0, depth: 0 },
): Visitor<T> {
	type N = V | F | J;
	if (root == null) {
		return { done: true, acc: initial };
	}

	if (isValue(root)) {
		return iterParallel(
			root.next as N,
			reducer(initial, root as V, coords),
			reducer,
			combiner,
			{
				...coords,
				index: coords.index + 1,
				depth: coords.depth + 1,
			},
		);
	}

	if (isFork(root)) {
		// Call the reducer with the fork node first
		initial = reducer(initial, root as F, coords);

		// Then call each branch independently
		const ends = root.next.map((n, branch) =>
			iterParallel(n as N, initial, reducer, combiner, {
				...coords,
				index: 0,
				branch,
				fork: coords.fork + 1,
				depth: coords.depth + 1,
			}),
		);

		assert(ends.length > 0, 'Malformed DAG found, empty Fork node');
		const [res] = ends;
		assert(!res.done, 'Malformed DAG found, disconnected fork branch');

		// Combine the results from the branches passing the
		// join node
		const acc = combiner(
			ends.map((r) => r.acc),
			res.node as J,
		);

		return iterParallel(res.node.next as N, acc, reducer, combiner, {
			...coords,
			depth: coords.depth + 1,
		});
	}

	// If the first node of the graph is a join, we ignore it
	if (coords.depth === 0) {
		return iterParallel(root.next as N, initial, reducer, combiner, coords);
	}

	return { done: false, node: root, acc: initial };
}

function reduceCombine<V extends Value, F extends Fork, J extends Join, T>(
	root: Node | null,
	initial: T,
	reducer: (acc: T, n: V | F, coords: Coords) => T,
	combiner: (acc: T[], n: J) => T,
): T {
	// The any below is because typescript is being weird in interpreting the types
	const res = iterParallel(root, initial, reducer as any, combiner);
	return res.acc;
}

export function mapReduce<T>(
	root: Node | null,
	initial: T,
	mapper: (v: Value, acc: T) => T,
	reducer: (acc: T[]) => T,
): T;
export function mapReduce<T, V extends Value>(
	root: Node | null,
	initial: T,
	mapper: (v: V, acc: T) => T,
	reducer: (acc: T[]) => T,
): T;
export function mapReduce<T, V extends Value>(
	root: Node | null,
	initial: T,
	mapper: (v: V, acc: T) => T,
	reducer: (acc: T[]) => T,
): T {
	return reduceCombine(
		root,
		initial,
		(acc, n) => (isValue(n) ? mapper(n as V, acc) : acc),
		reducer,
	);
}

export function reverse<N extends Node>(root: N | null): N | null {
	return reduceCombine(
		root,
		null,
		(prev: N | null, n): N => {
			if (isValue(n)) {
				n.next = prev;
				return n as N;
			}
			return Node.join(prev) as N;
		},
		(nodes) => Node.fork(nodes.filter((n) => n != null) as N[]) as N,
	);
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
	return reduceWhile(
		root,
		null,
		// Select the node if it matches the condition
		(_: V | null, n) => (isValue(n) && condition(n as V) ? (n as V) : null),
		// Exit as soon as the node is found
		(v) => v != null,
	);
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
	function indentIf(r: number, cond = true) {
		if (!cond) {
			return '';
		}
		return '  '.repeat(r);
	}

	const res = reduceWhile(
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
