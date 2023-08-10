import { Node, Plan } from '../planner';
import { assert } from '../assert';

import { SimplePlan } from './types';

function expand<T>(n: Node<T> | null): [...SimplePlan, Node<T> | null] {
	if (n == null) {
		return [null];
	}

	if (Node.isAction(n)) {
		return [n.action.description, ...expand(n.next)];
	}

	if (Node.isFork(n)) {
		// We expand each branch
		const branches = n.next.map(expand);
		const res: SimplePlan = [];
		let next: Node<T> | null = null;
		for (const branch of branches) {
			const last = branch.pop();

			// Since the fork will always end with an empty node,
			// the last element of the branch should always be a node
			assert(
				last !== undefined && typeof last !== 'string' && !Array.isArray(last),
			);
			next = last;
			res.push(branch as SimplePlan);
		}

		return [res, ...expand(next)];
	}

	// If empty we want the fork to handle
	// the next node
	return [n.next];
}

/**
 * Return a serialized version of the plan for comparison
 *
 * The function will throw if the plan is not successful
 */
export function simplified<T>(p: Plan<T>): SimplePlan {
	if (!p.success) {
		throw new Error('Plan not found');
	}

	const plan = expand(p.start);

	// The last element of the simplified plan will always be null
	const last = plan.pop();
	assert(last === null);

	return plan as SimplePlan;
}
