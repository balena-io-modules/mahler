import { setTimeout as delay } from 'timers/promises';

import { assert } from '../assert';
import { Observer } from '../observable';
import { EmptyNode, Node, Planner } from '../planner';
import { Ref } from '../ref';
import { Sensor, Subscription } from '../sensor';
import { Target } from '../target';
import { Action } from '../task';
import { observe } from './observe';

import {
	AgentOpts,
	Failure,
	NotStarted,
	Result,
	Stopped,
	Timeout,
	UnknownError,
} from './types';

/**
 * Internal error
 */
class ActionRunFailed extends Error {
	constructor(
		readonly action: Action,
		readonly cause: any,
	) {
		super(`Action '${action.description}' failed with error: ${cause}`);
	}
}

class ActionConditionFailed extends Error {
	constructor(readonly action: Action) {
		super(`Conditions for action '${action.description}' not met`);
	}
}

class Cancelled extends Error {
	constructor() {
		super('Agent runtime was stopped before plan could be fully executed');
	}
}

class PlanNotFound extends Error {
	constructor() {
		super('Plan not found');
	}
}

export class Runtime<TState> {
	private promise: Promise<Result<TState>> = Promise.resolve({
		success: false,
		error: new NotStarted(),
	});

	private running = false;
	private stopped = false;
	private subscribed: Subscription[] = [];
	private stateRef: Ref<TState>;

	constructor(
		private readonly observer: Observer<TState>,
		state: TState,
		private readonly target: Target<TState>,
		private readonly planner: Planner<TState>,
		sensors: Array<Sensor<TState>>,
		private readonly opts: AgentOpts,
	) {
		this.stateRef = Ref.of(state);
		// add subscribers to sensors
		this.subscribed = sensors.map((s) =>
			s.subscribe((next: (s: TState) => TState) => {
				// QUESTION: do we need to handle concurrency
				this.stateRef._ = next(this.stateRef._);

				if (opts.follow) {
					// Trigger a re-plan to see if the state is still on target
					this.start();
				} else {
					// Notify the observer of the new state
					this.observer.next(this.stateRef._);
				}
			}),
		);
	}

	public get state() {
		return this.stateRef._;
	}

	private findPlan() {
		const result = this.planner.findPlan(this.stateRef._, this.target);

		if (!result.success) {
			// Jump to the catch below
			throw new PlanNotFound();
		}

		return result;
	}

	private async runAction(action: Action): Promise<void> {
		try {
			// Running the action should perform the changes in the
			// local state without the need of comparisons later.
			// The observe() wrapper allows to notify the observer from every
			// change to some part of the state
			await observe(action, this.observer)(this.stateRef);
		} catch (e) {
			throw new ActionRunFailed(action, e);
		}
	}

	private async runPlan(
		node: Node<TState> | null,
	): Promise<undefined | EmptyNode<TState>> {
		const { logger } = this.opts;

		if (node == null) {
			return;
		}

		if (Node.isAction(node)) {
			const { action } = node;

			if (this.stopped) {
				throw new Cancelled();
			}

			if (!action.condition(this.stateRef._)) {
				throw new ActionConditionFailed(action);
			}

			logger.info(`${action.description}: running ...`);
			await this.runAction(action);
			logger.info(`${action.description}: success`);

			return await this.runPlan(node.next);
		}

		if (Node.isFork(node)) {
			// Run children in parallel. Continue following the plan when reaching the
			// empty node only for one of the branches
			const [empty] = await Promise.all(node.next.map((n) => this.runPlan(n)));

			// There should always be at least one branch in the fork because
			// of the way the planner is implemented
			assert(empty !== undefined);

			return await this.runPlan(empty.next);
		}

		// We return the node
		return node;
	}

	start() {
		if (this.running) {
			return;
		}

		const { logger } = this.opts;

		const flatten = <T>(
			node: Node<T> | null,
			accum: string[],
		): Node<T> | null => {
			if (node == null) {
				return null;
			}

			if (Node.isAction(node)) {
				accum.push(node.action.description);
				return flatten(node.next, accum);
			}

			if (Node.isFork(node)) {
				const [next] = node.next.map((n) => flatten(n, accum));
				return flatten(next, accum);
			}

			return node.next;
		};

		this.promise = (async () => {
			this.running = true;

			let tries = 0;
			let found = false;

			// Send the initial state to the observer
			this.observer.next(this.stateRef._);
			while (!this.stopped) {
				try {
					logger.debug('finding a plan to the target');
					const result = this.findPlan();
					logger.debug('planning stats', JSON.stringify(result.stats));

					const { start } = result;

					// The plan is empty, we have reached the goal
					if (start == null) {
						logger.debug('plan empty, nothing else to do');
						return { success: true as const, state: this.stateRef._ };
					}

					const plan: string[] = [];
					flatten(start, plan);
					logger.debug('plan found, will execute the following actions', plan);

					// If we got here, we have found a suitable plan
					found = true;

					// Execute the plan
					await this.runPlan(start);

					// We've executed the plan succesfully
					// we don't exit immediately since the goal may
					// not have been reached yet. We will exit when there are no
					// more steps in a next re-plan
					logger.info('plan executed successfully');
				} catch (e) {
					if (e instanceof PlanNotFound) {
						/* ignore and go to delay */
					} else if (e instanceof ActionConditionFailed) {
						logger.warn(`${e.action.description}: condition not met`);
					} else if (e instanceof ActionRunFailed) {
						logger.error(`${e.action.description}: failed`, e.cause);
					} else if (e instanceof Cancelled) {
						logger.warn('plan execution cancelled');
						// exit the loop
						break;
					} else {
						/* Something else happened, better exit immediately */
						logger.error('Unknown error while looking for plan:', e);
						return {
							success: false as const,
							error: new UnknownError(e),
						};
					}
				}

				if (!found) {
					if (this.opts.maxRetries > 0 && tries >= this.opts.maxRetries) {
						return {
							success: false as const,
							error: new Failure(tries),
						};
					}
				}
				const wait = Math.min(this.opts.backoffMs(tries), this.opts.maxWaitMs);
				logger.debug(`waiting ${wait / 1000}(s) before re-planning`);
				await delay(wait);

				// Only backof if we haven't found a plan yet
				tries += +!found;
			}

			// The only way to get here is if the runtime was stopped
			return { success: false as const, error: new Stopped() };
		})()
			// QUESTION: if we get here this is pretty bad, should we notify
			// subscribers of an error?
			.catch((e) => ({ success: false as const, error: e }))
			.finally(() => {
				this.running = false;
				this.stopped = false;
			});
	}

	async stop(): Promise<void> {
		this.stopped = true;

		// Wait for the loop to finish
		await this.promise;

		// Unsubscribe from sensors
		this.subscribed.forEach((s) => s.unsubscribe());
	}

	async wait(timeout = 0): Promise<Result<TState>> {
		if (timeout === 0) {
			return this.promise;
		}

		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				reject(new Timeout(timeout));
			}, timeout);

			this.promise
				.then((res) => {
					clearTimeout(timer);
					resolve(res);
				})
				.catch(reject);
		});
	}
}
