import { setTimeout as delay } from 'timers/promises';

import type { Operation } from '../operation';
import { diff } from '../distance';
import type { Observer, Subscription } from '../observable';
import type { PlanAction, Planner, PlanNode } from '../planner';
import { SearchFailed } from '../planner';
import { Ref } from '../ref';
import type { Sensor } from '../sensor';
import type { StrictTarget } from '../target';
import { Target } from '../target';
import type { Action } from '../task';
import { observe } from './observe';

import type { AgentOpts, Result } from './types';
import { Failure, NotStarted, Stopped, Timeout, UnknownError } from './types';

import * as DAG from '../dag';

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
		super(`Condition for action '${action.description}' not met`);
	}
}

class Cancelled extends Error {
	constructor() {
		super('Agent runtime was stopped before plan could be fully executed');
	}
}

class PlanNotFound extends Error {
	constructor(cause: unknown) {
		super('Plan not found', { cause });
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
		private readonly target: Target<TState> | StrictTarget<TState>,
		private readonly planner: Planner<TState>,
		sensors: Array<Sensor<TState>>,
		private readonly opts: AgentOpts,
		private readonly strict: boolean,
	) {
		this.stateRef = Ref.of(state);
		// add subscribers to sensors
		this.subscribed = sensors.map((sensor) =>
			sensor(this.stateRef).subscribe((s) => {
				// There is no need to update the state reference as the sensor already
				// modifies the state. We don't handle concurrency as we expect that whatever
				// value modified by sensologrs does not conflict with the value modified by
				// actions
				if (opts.follow) {
					// Trigger a re-plan to see if the state is still on target
					this.start();
				} else {
					// Notify the observer of the new state
					this.observer.next(s);
				}
			}),
		);
	}

	public get state() {
		return this.stateRef._;
	}

	private findPlan() {
		const { logger } = this.opts;

		const toLog = (o: Operation<TState, any>) => {
			if (o.op === 'create') {
				return ['create', o.path, 'with value', o.target];
			}

			if (o.op === 'update') {
				return ['update', o.path, 'from', o.source, 'to', o.target];
			}

			return ['delete', o.path];
		};

		let target: Target<TState>;
		if (this.strict) {
			target = Target.fromStrict(
				this.stateRef._,
				this.target as StrictTarget<TState>,
				this.opts.strictIgnore,
			);
		} else {
			target = this.target;
		}

		const changes = diff(this.stateRef._, target);
		logger.debug(
			`looking for a plan, pending changes:${
				changes.length > 0 ? '' : ' none'
			}`,
		);
		changes.map(toLog).forEach((log) => logger.debug('-', ...log));

		// Trigger a plan search
		const result = this.planner.findPlan(this.stateRef._, this.target);
		logger.debug(
			`search finished after ${
				result.stats.iterations
			} iterations in ${result.stats.time.toFixed(1)}ms`,
		);

		if (!result.success) {
			// Jump to the catch below
			throw new PlanNotFound(result.error);
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

	private async runPlan(node: PlanNode<TState> | null) {
		const { logger } = this.opts;

		return await DAG.mapReduce(
			node,
			Promise.resolve(),
			async (v: PlanAction<TState>, prev) => {
				// Wait for the previous action to complete
				await prev;

				const { action } = v;

				if (this.stopped) {
					throw new Cancelled();
				}

				if (!action.condition(this.stateRef._)) {
					throw new ActionConditionFailed(action);
				}

				logger.info(`${action.description}: running ...`);
				await this.runAction(action);
				logger.info(`${action.description}: success`);
			},
			async (actions) => {
				await Promise.all(actions);
			},
		);
	}

	start() {
		if (this.running) {
			return;
		}

		const { logger } = this.opts;

		const flatten = <T>(node: PlanNode<T> | null) => {
			return DAG.reduce(
				node,
				(acc: string[], a: PlanAction<T>) => acc.concat([a.action.description]),
				[],
			);
		};

		this.promise = (async () => {
			this.running = true;

			let tries = 0;
			let found = false;

			// Send the initial state to the observer
			this.observer.next(structuredClone(this.stateRef._));
			logger.info('applying new target state');
			while (!this.stopped) {
				try {
					const result = this.findPlan();
					const { start } = result;

					// The plan is empty, we have reached the goal
					if (start == null) {
						logger.info('nothing else to do: target state reached');
						return {
							success: true as const,
							state: structuredClone(this.stateRef._),
						};
					}

					logger.debug('plan found, will execute the following actions:');
					flatten(start).map((action) => logger.debug('-', action));

					// Execute the plan
					await this.runPlan(start);

					// If we got here, we have successfully found and executed a plan
					found = true;
					tries = 0;

					// We've executed the plan succesfully
					// we don't exit immediately since the goal may
					// not have been reached yet. We will exit when there are no
					// more steps in a next re-plan
					logger.info('plan executed successfully');
				} catch (e) {
					found = false;
					if (e instanceof PlanNotFound) {
						if (e.cause !== SearchFailed) {
							logger.error(
								'no plan found, reason:',
								(e.cause as Error).message ?? e.cause,
							);
						} else {
							logger.warn('no plan found');
						}
					} else if (e instanceof ActionConditionFailed) {
						logger.warn(`${e.action.description}: condition failed`);
					} else if (e instanceof ActionRunFailed) {
						logger.error(`${e.action.description}: failed`, e.cause);
					} else if (e instanceof Cancelled) {
						logger.warn('plan execution cancelled');
						// exit the loop
						break;
					} else {
						/* Something else happened, better exit immediately */
						logger.error('unknown error while looking for plan:', e);
						return {
							success: false as const,
							error: new UnknownError(e),
						};
					}
				}

				if (!found) {
					if (tries >= this.opts.maxRetries) {
						return {
							success: false as const,
							error: new Failure(tries),
						};
					}
				}
				const wait = Math.min(this.opts.backoffMs(tries), this.opts.maxWaitMs);
				logger.debug(`waiting ${wait / 1000}s before re-planning`);
				await delay(wait);

				// Only backof if we haven't been able to reach the target
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
