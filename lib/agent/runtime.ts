import { setTimeout as delay } from 'timers/promises';

import { Planner } from '../planner';
import { Sensor, Subscription } from '../sensor';
import { Target } from '../target';
import { Action } from '../task';

import {
	NotStarted,
	Stopped,
	Failure,
	Cancelled,
	UnknownError,
	Timeout,
	AgentResult,
	AgentOpts,
} from './types';

/**
 * Internal error
 */
class ActionRunFailed extends Error {
	constructor(readonly action: Action, readonly cause: Error) {
		super(`Action '${action.description}' failed with error: ${cause}`);
	}
}

class PlanNotFound extends Error {
	constructor() {
		super('Plan not found');
	}
}

export class Runtime<TState> {
	private promise: Promise<AgentResult> = Promise.resolve({
		success: false,
		error: new NotStarted(),
	});

	private running = false;
	private stopped = false;
	private subscribed: Subscription[] = [];

	constructor(
		private internal: TState,
		private readonly target: Target<TState>,
		private readonly planner: Planner<TState>,
		sensors: Array<Sensor<TState>>,
		private readonly opts: AgentOpts,
	) {
		// add subscribers to sensors
		this.subscribed = sensors.map((s) =>
			s.subscribe((next: (s: TState) => TState) => {
				// QUESTION: do we need to handle concurrency
				this.internal = next(this.internal);

				if (opts.follow) {
					// Trigger a re-plan to see if the state is still on target
					this.start();
				}
			}),
		);
	}

	state() {
		return this.internal;
	}

	start() {
		if (this.running) {
			return;
		}

		const { logger } = this.opts;

		this.promise = new Promise<AgentResult>(async (resolve) => {
			this.running = true;

			let tries = 0;
			let found = false;
			while (!this.stopped) {
				try {
					logger.debug('finding a plan to the target');
					logger.trace({
						current: this.internal,
						target: this.target,
						tries,
						status: 'finding plan to target',
					});
					const result = this.planner.findPlan(this.internal, this.target);
					logger.debug('planning stats', JSON.stringify(result.stats));

					if (!result.success) {
						// Jump to the catch below
						throw new PlanNotFound();
					}

					const actions = result.plan;
					if (actions.length === 0) {
						logger.debug('plan empty, nothing else to do');
						// Only when the plan is empty we can consider the goal reached
						return resolve({ success: true });
					}

					logger.debug(
						'plan found, will execute the following actions',
						actions.map((a) => a.description),
					);

					for (const action of actions) {
						if (this.stopped) {
							logger.warn('agent stop requested during plan execution');
							throw new Cancelled();
						}

						if (!action.condition(this.internal)) {
							logger.warn(`${action.description}: condition not met`);
							break;
						}

						// QUESTION: do we need to handle concurrency to deal with state changes
						// coming from sensors?
						// TODO: maybe we can have some sort of subscription mechanism
						// to notify state changes?
						logger.info(`${action.description}: running ...`);
						this.internal = await action(this.internal).catch((e) => {
							throw new ActionRunFailed(action, e);
						});
						logger.info(`${action.description}: ready`);
					}
					// We've executed the plan succesfully
					// NOTE: we don't exit immediately since the goal may
					// not have been reached yet. We will exit when there are no
					// more steps in a next re-plan
					logger.info('plan executed successfully');
					found = true;
				} catch (e) {
					if (e instanceof PlanNotFound) {
						/* ignore and go to delay */
					} else if (e instanceof ActionRunFailed) {
						logger.error(`${e.action.description}: failed`, e.cause);
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
				logger.debug(`waiting ${wait / 1000}(s) before next plan`);
				await delay(wait);
				tries += +!found;
			}

			if (found) {
				resolve({ success: true });
			} else {
				return resolve({ success: false, error: new Stopped() });
			}
		})
			.catch((e) => ({ success: false, error: e }))
			.finally(() => {
				this.running = false;
				this.stopped = false;
			});
	}

	async stop(): Promise<void> {
		this.stopped = true;

		await this.promise;
		// Unsubscribe from sensors
		this.subscribed.forEach((s) => s.unsubscribe());
	}

	async wait(timeout = 0): Promise<AgentResult> {
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
