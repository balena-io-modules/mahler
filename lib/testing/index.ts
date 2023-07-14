import { Node, Plan } from '../planner';

/**
 * A "serialized" plan.
 *
 * It's not really serialized as plan cannot be reconstructed
 * from the serialization. But is really an object representation
 * of a plan that's easier to print and compare.
 */
export type Serialized = string[];

export interface Builder {
	/**
	 * Adds a next node to the plan
	 */
	action(description: string): Builder;

	/**
	 * Builds the test plan
	 */
	end(): Serialized;
}

function toArray<T>(n: Node<T> | null): Serialized {
	if (n == null) {
		return [];
	}

	return [n.action.description, ...toArray(n.next)];
}

export function serialize<T>(p: Plan<T>): Serialized {
	if (!p.success) {
		throw new Error('Plan not found');
	}

	return toArray(p.start);
}

export function plan(): Builder {
	const repr: Serialized = [];

	const builder = {
		action(description: string) {
			repr.push(description);

			return builder;
		},

		end() {
			return repr;
		},
	};

	return builder;
}
