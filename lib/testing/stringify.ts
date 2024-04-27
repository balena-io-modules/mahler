import type { Plan, PlanAction } from '../planner';
import { toString } from '../dag';

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

	return toString(p.start, (a: PlanAction<T>) => a.action.description);
}
