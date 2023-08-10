import { Node, Plan } from '../planner';

import { SimplePlan } from './types';

function toArray<T>(n: Node<T> | null): SimplePlan {
	if (n == null) {
		return [];
	}

	return [n.action.description, ...toArray(n.next)];
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

	return toArray(p.start);
}
