import type { Value } from '../dag';
import { Node, toString } from '../dag';

type Branch = DAG;
type Fork = Branch[];
type DAG = Array<string | Fork>;

export interface Label extends Value {
	readonly id: string;
}

const Label = {
	of(id: string): Label {
		return Node.value({ id });
	},
};

interface PlanBuilder {
	/**
	 * Adds an action to the plan
	 */
	action(description: string): PlanBuilder;

	/**
	 * Adds a list of actions to the plan
	 */
	actions(...descriptions: [string, ...string[]]): PlanBuilder;

	/**
	 * Fork the plan adding branches
	 */
	fork(...branches: [Branch, ...Branch[]]): PlanBuilder;

	/**
	 * Returns the root node for the plan
	 */
	root(): Node | null;

	/**
	 * Return the string representation
	 */
	end(): string;
}

// Create a linked list from a list of strings
// returns the head and tail of the list
function fromList(elems: [string, ...string[]]): [Node, Node] {
	const [first, ...labels] = elems;
	const root = Label.of(first);

	let tail = root;
	for (const label of labels) {
		const node = Label.of(label);
		tail.next = node;
		tail = node;
	}

	return [root, tail];
}

function fromFork(branches: Branch[]): [Node | null, Node | null] {
	branches = branches.filter((b) => b.length > 0);

	// If all branches are empty, return
	if (branches.length === 0) {
		return [null, null];
	}

	// If there is only a branch, call the branch method
	if (branches.length === 1) {
		return fromBranch(branches[0]!);
	}

	// For multiple branches, create a fork and
	// a join for the ends
	const root = Node.fork();
	const tail = Node.join();
	for (const b of branches) {
		const [r, t] = fromBranch(b);
		// We already checked that the branch is not empty
		// but typescript cannot infer that so we wrap this in
		// an if
		if (r != null && t != null) {
			t.next = tail;
			root.next.push(r);
		}
	}
	return [root, tail];
}

function fromBranch(elems: Branch): [Node | null, Node | null] {
	let root: Node | null = null;
	let tail: Node | null = null;

	while (elems.length > 0) {
		let r: Node | null = null;
		let t: Node | null = null;

		// Find the next fork
		const forkIndex = elems.findIndex((e) => Array.isArray(e));
		const length = forkIndex > 0 ? forkIndex : elems.length;

		if (forkIndex === 0) {
			// If the fork is the first element of the branch, create a fork
			const branches: Fork = elems.shift() as Fork;
			[r, t] = fromFork(branches);
		} else if (length > 0) {
			// Otherwise create a sequence with the first N elements of the branch
			[r, t] = fromList(elems.splice(0, length) as [string, ...string[]]);
		}

		if (root == null) {
			root = r;
			tail = t;
		} else if (tail != null) {
			tail.next = r;
			tail = t;
		}
	}

	return [root, tail];
}

/**
 * Start building a plan
 */
export function plan(): PlanBuilder {
	let root: Node | null = null;
	let tail: Node | null = null;

	function setEnds(r: Node | null, t: Node | null) {
		if (root == null) {
			root = r;
			tail = t;
		} else if (tail != null) {
			tail.next = r;
			tail = t;
		}
	}

	const builder = {
		action(description: string) {
			return builder.actions(description);
		},

		actions(...descriptions: [string, ...string[]]) {
			const [r, t] = fromList(descriptions);
			setEnds(r, t);

			return builder;
		},

		fork(...branches: Branch[]) {
			const [r, t] = fromFork(branches);
			setEnds(r, t);

			return builder;
		},

		root() {
			return root;
		},

		end() {
			return toString(root, (l: Label) => l.id);
		},
	};

	return builder;
}

/**
 * Utility method to create a branch from an array
 * of values
 *
 * Each value may be a string or the result of `fork()`
 */
export function branch(...values: Branch): Branch {
	return values.filter((v) => !Array.isArray(v) || v.length > 0);
}

/**
 * Create a new fork from a list of branches
 *
 * Branches are returned by the `branch` method
 */
export function fork(...branches: Branch[]): Fork {
	return branches.filter((b) => b.length > 0);
}

export function sequence(...actions: [string, ...string[]]): string {
	return plan()
		.actions(...actions)
		.end();
}
