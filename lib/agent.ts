import { promisify } from 'util';

import assert from './assert';
import { Task, Action } from './task';
import { Target } from './target';
import { Planner } from './planner';
import { Sensor, Subscribed } from './sensor';
import { Logger, NullLogger } from './logger';

export interface AgentOpts {
	/**
	 * If true, the agent will stop when the goal is reached. Default is true.
	 */
	stopOnSuccess: boolean;

	/**
	 * The maximum number of attempts for finding a plan before giving up.
	 */
	maxRetries: number;

	/**
	 * The maximum time (in millis) to wait between re-plans. Default is 5 minutes
	 */
	maxWaitMs: number;

	/**
	 *  The interval (in millis) to re-check the state after the goal has been reached. This only makes
	 *  sense with stopOnSuccess: false. Defaults to 1 second
	 */
	pollIntervalMs: number;

	/**
	 * A function calculating the amount if time to wait before retrying after a failure. Defaults to exponential backoff
	 */
	backoffMs: (failures: number) => number;

	/**
	 * A logger instance to use for reporting
	 */
	logger: Logger;
}

export class AgentNotStarted extends Error {
	constructor() {
		super('Agent has not been started yet');
	}
}

export class AgentStoppedWithNoPlan extends Error {
	constructor() {
		super('Agent stopped before a plan could be found');
	}
}

export class AgentPlanCancelled extends Error {
	constructor() {
		super('Agent was stopped before plan execution could be completed');
	}
}

export class AgentPlanNotFound extends Error {
	constructor(tries: number) {
		super('Agent failed to find a plan after ' + tries + ' attempts');
	}
}

export class AgentTimeout extends Error {
	constructor(timeout: number) {
		super(` Agent timed out after ${timeout} ms`);
	}
}

export type AgentResult = { success: true } | { success: false; error: Error };

export interface Agent<TState = any> {
	start(t: Target<TState>): void;
	target(t: Target<TState>): Promise<void>;
	result(timeout?: number): Promise<AgentResult>;
	state(): TState;
	stop(): Promise<void>;
}

class ActionRunFailed extends Error {
	constructor(readonly action: Action, readonly cause: Error) {
		super(`Action failed`);
	}
}

class PlanNotFound extends Error {
	constructor() {
		super('Plan not found');
	}
}

type DeepPartial<T> = T extends any[] | ((...args: any[]) => any)
	? T
	: T extends object
	? {
			[P in keyof T]?: DeepPartial<T[P]>;
	  }
	: T;

function of<TState>({
	initial: state,
	// TODO: accepts a planner instead
	tasks = [],
	sensors = [],
	opts: userOpts = {},
}: {
	initial: TState;
	tasks?: Array<Task<TState, any, any>>;
	sensors?: Array<Sensor<TState>>;
	opts?: DeepPartial<AgentOpts>;
}): Agent<TState> {
	const opts: AgentOpts = {
		maxRetries: 0,
		stopOnSuccess: true,
		maxWaitMs: 5 * 60 * 1000,
		pollIntervalMs: 10 * 1000,
		backoffMs: (failures) => 2 ** failures * opts.pollIntervalMs,
		...userOpts,
		logger: { ...NullLogger, ...userOpts.logger },
	};

	const { logger } = opts;

	assert(
		opts.maxRetries >= 0,
		'opts.maxReplans must be greater than or equal to 0',
	);
	assert(opts.maxWaitMs > 0, 'opts.maxWaitMs must be greater than 0');
	assert(opts.pollIntervalMs > 0, 'opts.pollIntervalMs must be greater than 0');

	// Create the planner early on, this will
	// also run validation from the planner side
	const planner = Planner.of({ tasks, opts: { trace: logger.trace } });

	const delay = promisify(setTimeout);
	let promise: Promise<AgentResult> = Promise.resolve({
		success: false,
		error: new Error('Agent not started'),
	});
	let running = false;
	let stopped = false;
	const stopRunner = async () => {
		stopped = true;
		await promise;
	};

	const startRunner = (target: Target<TState>) => {
		stopped = false;

		// We store the promise so we can wait for it before stopping
		let planFoundOnce = false;
		promise = new Promise<AgentResult>(async (resolve, reject) => {
			let retries = 0;
			while (!stopped) {
				// find a plan to the target
				let planFound = false;
				try {
					logger.debug('finding a plan to the target');
					logger.trace({
						current: state,
						target,
						retries,
						status: 'finding plan to target',
					});
					const result = planner.find(state, target);

					if (!result.success) {
						// Jump to the catch below
						throw new PlanNotFound();
					}

					const actions = result.plan;

					// Reset the counter if we've found a plan
					planFoundOnce = true;
					planFound = true;
					retries = 0;

					if (actions.length === 0) {
						logger.debug('plan empty, nothing to do');
						// TODO: this will probably be replaced by a re-check of the state
						// in case the state has changed (probably protected by a throttle)
						if (opts.stopOnSuccess) {
							return resolve({ success: true });
						}
					} else {
						// execute the plan
						logger.info(
							'plan found, will execute the following actions',
							JSON.stringify(
								actions.map((a) => a.description),
								null,
								2,
							),
						);
						logger.debug('planner stats', JSON.stringify(result.stats));
						for (const action of actions) {
							if (stopped) {
								// TODO: log the cancellation of the plan
								logger.warn(
									'stop request received while executing the plan, cancelling',
								);
								return resolve({
									success: false,
									error: new AgentPlanCancelled(),
								});
							}

							logger.info(`${action.description}: testing pre-condition`);
							if (!action.condition(state)) {
								logger.warn(`${action.description}: pre-condition failed`);
								break;
							}

							// QUESTION: do we need to handle concurrency to deal with state changes
							// coming from sensors?
							// TODO: maybe we can have some sort of subscription mechanism
							// to notify state changes?
							logger.info(`${action.description}: executing`);
							state = await action.run(state).catch((e) => {
								throw new ActionRunFailed(action, e);
							});
							logger.info(`${action.description}: ready`);
						}

						// We've executed the plan succesfully
						// NOTE: we don't check we have reached the goal, because
						// the plan being executed may just mean that the goal will
						// be reached eventually
						logger.info('plan executed successfully');
					}
				} catch (e) {
					if (e instanceof PlanNotFound) {
						// noop
					} else if (e instanceof ActionRunFailed) {
						logger.error(`${e.action.description}: failed`, e.cause);
					} else {
						// Unknown error: better throw
						throw e;
					}
				}

				if (!planFound) {
					if (opts.maxRetries > 0 && retries >= opts.maxRetries) {
						logger.error('failed to find a plan after', retries, 'attempts');
						return reject(new AgentPlanNotFound(retries));
					}
					const wait = Math.min(opts.backoffMs(++retries), opts.maxWaitMs);
					logger.warn(
						'failed to find a plan, will retry in',
						wait / 1000,
						'seconds',
					);
					await delay(wait);
				} else {
					logger.debug(
						'waiting for',
						opts.pollIntervalMs / 1000,
						'seconds before next system poll',
					);
					await delay(opts.pollIntervalMs);
				}
			}

			if (planFoundOnce) {
				resolve({ success: true });
			} else {
				return resolve({ success: false, error: new AgentStoppedWithNoPlan() });
			}
		})
			.catch((e) => ({ success: false, error: e }))
			.finally(() => {
				running = false;
			});

		running = true;
	};

	let subscribedSensors: Subscribed[] = [];
	return {
		start(target) {
			assert(!running, 'Agent is already running');

			// add subscribers to sensors
			subscribedSensors = sensors.map((s) =>
				s.subscribe((next: (s: TState) => TState) => {
					// QUESTION: do we need to handle concurrency
					state = next(state);
				}),
			);

			// Start the plan runner
			startRunner(target);
		},
		async target(target) {
			await stopRunner();
			startRunner(target);
		},
		async stop() {
			await stopRunner();

			// Unsubscribe from sensors
			subscribedSensors.forEach((s) => s.unsubscribe());
		},
		async result(timeout: number = 0) {
			assert(timeout >= 0);

			if (timeout === 0) {
				return promise;
			}

			return new Promise(async (resolve, reject) => {
				const timer = setTimeout(() => {
					reject(new AgentTimeout(timeout));
				}, timeout);

				const res = await promise;
				clearTimeout(timer);
				resolve(res);
			});
		},
		state() {
			return state;
		},
	};
}

export const Agent = {
	of,
};
