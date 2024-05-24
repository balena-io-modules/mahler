import { setTimeout as delay } from 'timers/promises';

import type { DiffOperation } from '../operation';
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
import { Path } from '../path';
import { Lens } from '../lens';
import { Pointer } from '../pointer';

class ActionError extends Error {
	constructor(
		message: string,
		readonly id: string,
		readonly action: Action,
		readonly cause?: any,
	) {
		super(message);
	}
}

/**
 * Internal error
 */
class ActionRunFailed extends ActionError {
	constructor(
		readonly id: string,
		readonly action: Action,
		readonly cause: any,
	) {
		super(
			`Action '${action.description}' failed with error: ${cause}`,
			id,
			action,
			cause,
		);
	}
}

class PlanRunFailed extends Error {
	constructor(readonly errors: ActionError[]) {
		super(`Plan execution failed`);
	}
}

class ActionConditionFailed extends ActionError {
	constructor(
		readonly id: string,
		readonly action: Action,
	) {
		super(`Condition for action '${action.description}' not met`, id, action);
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
	private subscriptions: Record<Path, Subscription> = {};
	private stateRef: Ref<TState>;

	constructor(
		private readonly observer: Observer<TState>,
		state: TState,
		private readonly target: Target<TState> | StrictTarget<TState>,
		private readonly planner: Planner<TState>,
		private readonly sensors: Array<Sensor<TState, Path>>,
		private readonly opts: AgentOpts,
		private readonly strict: boolean,
	) {
		this.stateRef = Ref.of(state);
		// Perform actions based on the new state
		this.onStateChange(Path.from('/'));
	}

	public get state() {
		return this.stateRef._;
	}

	private findPlan() {
		const { logger } = this.opts;

		const toLog = (o: DiffOperation<TState, any>) => {
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
		// console.log('FIND PLAN', { current: this.stateRef._, target: this.target });
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

	private onStateChange(changedPath: Path) {
		// for every existing subscription, check if the path still
		// exists, if it doesn't unsusbcribe
		(Object.keys(this.subscriptions) as Path[])
			.filter((p) => Lens.startsWith(p, changedPath))
			.forEach((p) => {
				const parent = Pointer.from(this.stateRef._, Path.source(p));
				// If the parent does not exist or the key does not exist
				// then delete the sensor
				if (parent == null || !Object.hasOwn(parent, Path.basename(p))) {
					this.subscriptions[p].unsubscribe();
					delete this.subscriptions[p];
				}
			});

		// For every sensor, find the applicable paths
		// under the changed path
		const sApplicablePaths = this.sensors.map((sensor) => ({
			sensor,
			paths: Lens.findAll(this.stateRef._, sensor.lens, changedPath),
		}));

		// for every sensor, see if there are new elements
		// matching the sensor path, if there are, subscribe
		for (const { sensor, paths } of sApplicablePaths) {
			for (const p of paths) {
				if (p in this.subscriptions) {
					continue;
				}
				this.subscriptions[p] = sensor(this.stateRef, p).subscribe((s) => {
					// There is no need to update the state reference as the sensor already
					// modifies the state. We don't handle concurrency as we assume sensors
					// do not conflict with each other (should we check?)
					if (this.opts.follow) {
						// Trigger a re-plan to see if the state is still on target
						this.start();
					} else {
						// Notify the observer of the new state
						this.observer.next(s);
					}
				});
			}
		}
	}

	private async runPlan(root: PlanNode<TState> | null) {
		const { logger } = this.opts;

		return await DAG.mapReduce(
			root,
			Promise.resolve(),
			async (node: PlanAction<TState>, prev) => {
				// Wait for the previous action to complete,
				// this also propagates errors
				await prev;

				const { id, action } = node;

				if (this.stopped) {
					throw new Cancelled();
				}

				if (!action.condition(this.stateRef._)) {
					logger.warn(`${action.description}: condition failed`);
					throw new ActionConditionFailed(id, action);
				}

				try {
					// Running the action should perform the changes in the
					// local state without the need of comparisons later.
					// The observe() wrapper allows to notify the observer from every
					// change to some part of the state, it also reverts any changes
					// if an error occurs
					logger.info(`${action.description}: running ...`);
					await observe(action, this.observer)(this.stateRef);
					this.onStateChange(action.path); // update the state of the runtime
					logger.info(`${action.description}: success`);
				} catch (e) {
					logger.error(`${action.description}: failed`, e);
					throw new ActionRunFailed(id, action, e);
				}
			},
			async (actions) => {
				// Wait for all promises to be settled to prevent moving
				// on with a new planning cycle before the state is settled
				const results = await Promise.allSettled(actions);

				// Aggregate the results from previous calls
				// we use a map to deduplicate errors since map reduce
				// will propagate the same errors on every branch
				const actionErrorMap: Record<string, ActionError> = {};
				for (const r of results) {
					if (r.status === 'rejected') {
						const { reason: err } = r;
						actionErrorMap[err.id] = err;
						if (err instanceof ActionError) {
							actionErrorMap[err.id] = err;
						} else {
							// Propagate any other errors
							throw err;
						}
					}
				}

				const errors = Object.values(actionErrorMap);
				if (errors.length > 0) {
					throw new PlanRunFailed(errors);
				}
			},
		);
	}

	start() {
		if (this.running) {
			return;
		}

		const { logger } = this.opts;

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
					DAG.toString(start, (a: PlanAction<TState>) => a.action.description)
						.split('\n')
						.map((action) => logger.debug(action));

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
					} else if (e instanceof ActionError || e instanceof PlanRunFailed) {
						logger.warn('plan execution interrupted due to errors');
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
				logger.debug(`waiting ${wait / 1000}s before re - planning`);
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
		Object.values(this.subscriptions).forEach((s) => s.unsubscribe());
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
