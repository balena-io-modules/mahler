import { setTimeout as delay } from 'timers/promises';

import type { Operation } from '../operation';
import type { ReadOnly } from '../readonly';
import type { Observer, Subscription } from '../observable';
import type { PlanAction, Planner, PlanNode } from '../planner';
import { Ref } from '../ref';
import type { Sensor } from '../sensor';
import type { StrictTarget } from '../target';
import { Target } from '../target';
import type { Action } from '../task';
import { observe } from './observe';
import { applyPatch } from './patch';

import type { AgentOpts, Result } from './types';
import { Failure, NotStarted, Stopped, Timeout, UnknownError } from './types';

import * as DAG from '../dag';
import { Path } from '../path';
import { Lens } from '../lens';
import { Pointer } from '../pointer';
import { View } from '../view';

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
		private readonly observer: Observer<Operation<TState, Path>>,
		state: TState,
		private readonly target: Target<TState> | StrictTarget<TState>,
		private readonly planner: Planner<TState>,
		private readonly sensors: Array<Sensor<TState, Path>>,
		private readonly opts: AgentOpts<TState>,
		private readonly strict: boolean,
	) {
		this.stateRef = Ref.of(state);
		// Perform actions based on the new state
		this.updateSensors(Path.from('/'));
	}

	public get state() {
		return this.stateRef._;
	}

	private findPlan() {
		const { trace } = this.opts;

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

		trace({
			event: 'find-plan',
			state: this.stateRef._ as ReadOnly<TState>,
			target,
		});

		// Trigger a plan search
		const result = this.planner.findPlan(this.stateRef._, this.target);

		if (!result.success) {
			trace({
				event: 'plan-not-found',
				stats: result.stats,
				cause: result.error,
			});
			throw new PlanNotFound(result.error);
		}

		// trace event: plan found
		// data, iterations, time, plan
		return result;
	}

	private updateSensors(changedPath: Path) {
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
				this.subscriptions[p] = sensor(p).subscribe((change) => {
					// Patch the state
					// We don't handle concurrency as we assume sensors
					// do not conflict with each other (should we check?)
					applyPatch(this.stateRef, change);

					// Notify the observer of changes in the state
					this.observer.next(change);

					if (this.opts.follow) {
						// Trigger a re-plan to see if the state is still on target
						this.start();
					}
				});
			}
		}
	}

	private async runAction(id: string, action: Action<TState>) {
		const { trace } = this.opts;

		// Make a copy of the path modified by the action before the change
		const before = structuredClone(Pointer.from(this.stateRef._, action.path));
		// TODO: if a sensor makes a change to the path pointed by this action between
		// here and the rollback those changes will be lost. We might need to queue those
		// changes to re-apply them.
		const parent = Pointer.from(this.stateRef._, Path.source(action.path));
		const existsBefore =
			before !== undefined ||
			// If the pointer returns undefined, we check if the child exists under the parent
			// path, as it is possible the value exists and is set to `undefined`
			(parent != null &&
				typeof parent === 'object' &&
				Object.hasOwn(parent, Path.basename(action.path)));
		try {
			trace({ event: 'action-start', action });

			// The observe() wrapper allows to notify the observer of every
			// change to some part of the state
			await observe(action, this.observer)(this.stateRef);
			trace({ event: 'action-success', action });
		} catch (e) {
			// If an error occured, we revert the change
			const after = View.from(this.stateRef, action.path);
			if (!existsBefore) {
				after.delete();
				this.observer.next({ op: 'delete', path: action.path });
			} else {
				after._ = before as any;
				this.observer.next({ op: 'update', path: action.path, target: before });
			}

			trace({ event: 'action-failure', action, cause: e });
			throw new ActionRunFailed(id, action, e);
		}
	}

	private async runPlan(root: PlanNode<TState> | null) {
		const { trace } = this.opts;

		await DAG.mapReduce(
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

				trace({ event: 'action-next', action });

				if (!action.condition(this.stateRef._)) {
					trace({ event: 'action-condition-failed', action });
					throw new ActionConditionFailed(id, action);
				}

				await this.runAction(id, action);
				this.updateSensors(action.path);
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

		const { trace } = this.opts;

		this.promise = (async () => {
			this.running = true;

			let tries = 0;
			let found = false;

			trace({ event: 'start', target: this.target });
			while (!this.stopped) {
				try {
					const result = this.findPlan();
					const { start } = result;

					// The plan is empty, we have reached the goal
					if (start == null) {
						trace({ event: 'success' });
						return {
							success: true as const,
							state: structuredClone(this.stateRef._),
						};
					}

					trace({ event: 'plan-found', start, stats: result.stats });

					// Execute the plan
					await this.runPlan(start);

					// If we got here, we have successfully found and executed a plan
					found = true;
					tries = 0;

					// We've executed the plan succesfully
					// we don't exit immediately since the goal may
					// not have been reached yet. We will exit when there are no
					// more steps in a next re-plan
					trace({ event: 'plan-executed' });
				} catch (e) {
					found = false;
					if (e instanceof PlanNotFound) {
						// nothing to do
					} else if (e instanceof ActionError || e instanceof PlanRunFailed) {
						// nothing to do
					} else if (e instanceof Cancelled) {
						// exit the loop
						break;
					} else {
						/* Something else happened, better exit immediately */
						trace({ event: 'failure', cause: e });
						return {
							success: false as const,
							error: new UnknownError(e),
						};
					}
				}

				if (!found) {
					if (tries >= this.opts.maxRetries) {
						trace({ event: 'failure', cause: new Failure(tries) });
						return {
							success: false as const,
							error: new Failure(tries),
						};
					}
				}
				const wait = Math.min(this.opts.backoffMs(tries), this.opts.maxWaitMs);
				trace({ event: 'backoff', tries, delayMs: wait });
				await delay(wait);

				// Only backof if we haven't been able to reach the target
				tries += +!found;
			}

			// The only way to get here is if the runtime was stopped
			trace({ event: 'failure', cause: new Stopped() });
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
		Object.values(this.subscriptions).forEach((s) => {
			s.unsubscribe();
		});
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
