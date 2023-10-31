import { DAG, Branch, Fork } from './dag';

interface PlanBuilder {
	/**
	 * Adds a next node to the plan
	 */
	action(description: string): PlanBuilder;

	actions(...descriptions: string[]): PlanBuilder;

	/**
	 * Adds a sub-plan to the simple plan
	 * to represent a fork in the current plan
	 */
	fork(...branches: Branch[]): PlanBuilder;

	/**
	 * Builds the test plan
	 */
	dag(): DAG;

	/**
	 * Return the string representation
	 */
	end(): string;
}

/**
 * Start building a plan
 */
export function plan(): PlanBuilder {
	const repr: DAG = [];

	const builder = {
		action(description: string) {
			repr.push(description);

			return builder;
		},

		actions(...descriptions: string[]) {
			repr.push(...descriptions);

			return builder;
		},

		fork(...branches: Branch[]) {
			branches = branches.filter((b) => b.length > 0);
			if (branches.length > 0) {
				repr.push(branches);
			}
			return builder;
		},

		dag() {
			return repr;
		},

		end() {
			return DAG.toString(repr);
		},
	};

	return builder;
}

export function branch(...values: Branch): Branch {
	let b = plan();
	for (const a of values) {
		if (!Array.isArray(a)) {
			b = b.action(a);
		} else if (a.length > 0) {
			b = b.fork(...a);
		}
	}
	return b.dag();
}

export function sequence(...actions: string[]): string {
	return plan()
		.actions(...actions)
		.end();
}

export function fork(...branches: Branch[]): Fork {
	return branches.filter((b) => b.length > 0);
}
