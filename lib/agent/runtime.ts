import { setTimeout as delay } from 'timers/promises';

import { Observer } from '../observable';
import { Planner } from '../planner';
import { Sensor, Subscription } from '../sensor';
import { Target } from '../target';
import { Action } from '../task';
import { equals } from '../json';

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

	private async runAction(action: Action) {
		try {
			return await action(this.state);
		} catch (e) {
			throw new ActionRunFailed(action, e);
		}
	}

	private async runPlan(actions: Action[]) {
		const { logger } = this.opts;
		for (const action of actions) {
			if (this.stopped) {
				throw new Cancelled();
			}

			if (!action.condition(this.state)) {
				throw new ActionConditionFailed(action);
			}

			// QUESTION: do we need to handle concurrency to deal with state changes
			// coming from sensors?
			logger.info(`${action.description}: running ...`);
			const state = await this.runAction(action);
			if (!equals(this.state, state)) {
				this.state = state;

				// Notify observer of the new state only if there
				// are changes
				this.observer.next(this.state);
			}
			logger.info(`${action.description}: success`);
		}
	}

	start() {
		if (this.running) {
			return;
		}

		const { logger } = this.opts;

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

					const actions = result.plan;

					// The plan is empty, we have reached the goal
					if (actions.length === 0) {
						logger.debug('plan empty, nothing else to do');
						return resolve({ success: true, state: this.state });
					}

					logger.debug(
						'plan found, will execute the following actions',
						actions.map((a) => a.description),
					);

					// If we got here, we have found a suitable plan
					found = true;

					// Execute the plan
					await this.runPlan(result.plan);

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
