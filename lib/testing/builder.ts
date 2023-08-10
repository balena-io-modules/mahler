import { SimplePlan } from './types';

export interface Builder {
	/**
	 * Adds a next node to the plan
	 */
	action(description: string): Builder;

	/**
	 * Builds the test plan
	 */
	end(): SimplePlan;
}

/**
 * Start building a plan
 */
export function plan(): Builder {
	const repr: SimplePlan = [];

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
