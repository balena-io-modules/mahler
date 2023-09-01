import { Node, Plan } from '../planner';

import { DAG } from './dag';

function toDAG<T>(n: Node<T> | null, s: DAG): Node<T> | null {
	if (n == null) {
		return null;
	}

	if (Node.isAction(n)) {
		s.push(n.action.description);
		return toDAG(n.next, s);
	}

	if (Node.isFork(n)) {
		const branches: DAG[] = [];
		let next: Node<T> | null = null;
		for (const branch of n.next) {
			const br: DAG = [];
			branches.push(br);

			next = toDAG(branch, br);
		}
		s.push(branches);

		return toDAG(next, s);
	}

	return n.next;
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
 * Labels for the nodes are obtained from the action descriptions
 *
 * The function will throw if the plan is not successful
 */
export function stringify<T>(p: Plan<T>): string {
	if (!p.success) {
		throw new Error('Plan not found');
	}

	const plan: DAG = [];
	toDAG(p.start, plan);

	return DAG.toString(plan);
}
