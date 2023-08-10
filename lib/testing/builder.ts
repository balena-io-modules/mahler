import { SimplePlan } from './types';

interface PlanBuilder {
	/**
	 * Adds a next node to the plan
	 */
	action(description: string): PlanBuilder;

	/**
	 * Adds a sub-plan to the simple plan
	 * to represent a fork in the current plan
	 */
	fork(): ForkBuilder;

	/**
	 * Builds the test plan
	 */
	end(): SimplePlan;
}

interface ForkBuilder<P extends PlanBuilder | ForkBuilder<any> = PlanBuilder> {
	/**
	 * Adds a branch to the fork
	 */
	branch(...actions: string[]): ForkBuilder<P>;

	/**
	 * Adds an action to the current branch
	 */
	action(description: string): ForkBuilder<P>;

	/**
	 * Creates a fork within a fork
	 */
	fork(): ForkBuilder<ForkBuilder<P>>;

	/**
	 * Joins the forked branches and returns
	 * the original builder
	 */
	join(): P;
}

function createFork<P extends PlanBuilder | ForkBuilder<any> = PlanBuilder>(
	parent: P,
	p: SimplePlan = [],
): ForkBuilder<P> {
	const repr: SimplePlan = [];
	let br: SimplePlan = [];
	const f: ForkBuilder<P> = {
		branch(...actions: string[]) {
			if (br.length > 0) {
				repr.push(br);
				br = [];
			}
			br.push(...actions);
			return f;
		},
		action(description: string) {
			br.push(description);
			return f;
		},
		fork() {
			return createFork(f, br);
		},
		join() {
			if (br.length > 0) {
				repr.push(br);
			}
			if (repr.length > 0) {
				p.push(repr);
			}
			return parent;
		},
	};

	return f;
}

/**
 * Start building a plan
 */
export function plan(): PlanBuilder {
	const repr: SimplePlan = [];

	const builder = {
		action(description: string) {
			repr.push(description);

			return builder;
		},

		fork() {
			return createFork(builder, repr);
		},

		end() {
			return repr;
		},
	};

	return builder;
}

export function branch(...values: string[]) {
	let b = plan();
	for (const a of values) {
		b = b.action(a);
	}
	return b.end();
}
