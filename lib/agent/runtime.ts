import { setTimeout as delay } from 'timers/promises';
import { diff, patch, Operation as PatchOperation } from 'mahler-wasm';

import { Observer, Observable } from '../observable';
import { Planner, Node, EmptyNode } from '../planner';
import { Sensor, Subscription } from '../sensor';
import { Target } from '../target';
import { Action } from '../task';
import { assert } from '../assert';

import {
	AgentOpts,
	Failure,
	NotStarted,
	Result,
	Stopped,
	Timeout,
	UnknownError,
} from './types';
import { simplified } from '../testing';

/**
 * Internal error
 */
class ActionRunFailed extends Error {
	constructor(readonly action: Action, readonly cause: any) {
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

	constructor(
		private readonly observer: Observer<TState>,
		public state: TState,
		private readonly target: Target<TState>,
		private readonly planner: Planner<TState>,
		sensors: Array<Sensor<TState>>,
		private readonly opts: AgentOpts,
	) {
		// add subscribers to sensors
		this.subscribed = sensors.map((s) =>
			s.subscribe((next: (s: TState) => TState) => {
				// QUESTION: do we need to handle concurrency
				this.state = next(this.state);

				if (opts.follow) {
					// Trigger a re-plan to see if the state is still on target
					this.start();
				} else {
					// Notify the observer of the new state
					this.observer.next(this.state);
				}
			}),
		);
	}

	private findPlan() {
		const result = this.planner.findPlan(this.state, this.target);

		if (!result.success) {
			// Jump to the catch below
			throw new PlanNotFound();
		}

		return result;
	}

	private async runAction(action: Action): Promise<PatchOperation[]> {
		try {
			// We keep a reference to the previous state, which is
			// what we need to compare the updated state to
			const before = this.state;
			const res = action(before);
			if (Observable.is<TState>(res)) {
				const runtime = this;
				// If the action result is an observable, then
				// we need to subscribe to it and update the internal
				// state as the observable emits new values
				return new Promise((resolve, reject) => {
					res.subscribe({
						next(s) {
							const changes = diff(before, s);
							if (changes.length > 0) {
								runtime.state = patch(runtime.state, changes);
								runtime.observer.next(runtime.state);
							}
						},
						complete() {
							// There should be no more changes to perform
							// here
							resolve([]);
						},
						error(e) {
							reject(e);
						},
					});
				});
			} else {
				const after = await res;
				return diff(before, after);
			}
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

			if (!action.condition(this.state)) {
				throw new ActionConditionFailed(action);
			}

			logger.info(`${action.description}: running ...`);
			const changes = await this.runAction(action);
			if (changes.length > 0) {
				// NOTE: there is a small chance that the state changes while the
				// patch is being applied. This means there is potential to lose changes
				// by a race (even though patch should be very fast).
				// There are two potential solutions here, either we wrap this call in a
				// mutex, so only one patch can be applied at a time, or we find a way to update
				// the state object in place, so only the relevant parts of the state are updated
				this.state = patch(this.state, changes);

				// Notify observer of the new state only if there
				// are changes
				this.observer.next(this.state);
			}
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

		const flatten = <T>(node: Node<T> | null): string[] => {
			if (node == null) {
				return [];
			}

			if (Node.isAction(node)) {
				return [node.action.description, ...flatten(node.next)];
			}

			if (Node.isFork(node)) {
				node.next.flatMap((n) => flatten(n));
			}

			return [];
		};

		this.promise = new Promise<Result<TState>>(async (resolve) => {
			this.running = true;

			let tries = 0;
			let found = false;

			// Send the initial state to the observer
			this.observer.next(this.state);
			while (!this.stopped) {
				try {
					logger.debug('finding a plan to the target');
					const result = this.findPlan();
					logger.debug('planning stats', JSON.stringify(result.stats));

					const { start } = result;

					// The plan is empty, we have reached the goal
					if (start == null) {
						logger.debug('plan empty, nothing else to do');
						return resolve({ success: true, state: this.state });
					}

					logger.debug(
						'plan found, will execute the following actions',
						simplified(result),
					);

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
						return resolve({
							success: false,
							error: new UnknownError(e),
						});
					}
				}

				if (!found) {
					if (this.opts.maxRetries > 0 && tries >= this.opts.maxRetries) {
						return resolve({
							success: false,
							error: new Failure(tries),
						});
					}
				}
				const wait = Math.min(this.opts.backoffMs(tries), this.opts.maxWaitMs);
				logger.debug(`waiting ${wait / 1000}(s) before re-planning`);
				await delay(wait);

				// Only backof if we haven't found a plan yet
				tries += +!found;
			}

			// The only way to get here is if the runtime was stopped
			return resolve({ success: false, error: new Stopped() });
		})
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

		return new Promise(async (resolve, reject) => {
			const timer = setTimeout(() => {
				reject(new Timeout(timeout));
			}, timeout);

			const res = await this.promise;
			clearTimeout(timer);
			resolve(res);
		});
	}
}
