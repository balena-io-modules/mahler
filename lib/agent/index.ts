import assert from '../assert';
import { NullLogger } from '../logger';
import { Subscribable, Subject } from '../observable';
import { Planner } from '../planner';
import { Sensor } from '../sensor';
import { Target } from '../target';
import { Task } from '../task';
import { Runtime } from './runtime';
import { AgentOpts, NotStarted, Result } from './types';

export * from './types';

/**
 * An agent is an autonomous entity that can plan and execute
 * a sequence of actions to reach a given target. It can also
 * monitor the state of the system and react to changes. It
 * can be used to implement a wide range of behaviors, from
 * simple automation to complex decision making.
 *
 * An agent internally has a knowledge database, expressed as a list
 * of hierarchical tasks, and a set of sensors that monitor the state
 * of the system. The agent uses a planner to find a sequence of
 * actions that will lead to the desired target. If found, the agent
 * will execute the plan until completion or until it's stopped. If during
 * the plan execution the state of the system changes, and task conditions
 * no longer hold true, the Agent will stop the plan execution and re-plan.
 * The same thing will happen if an error occurs while running one of the tasks
 * of the plan.
 *
 * The agent will keep re-planning until it reaches the target or until it
 * reaches the maximum number of retries. If the agent reaches the maximum
 * number of retries, it will stop and return an error.
 *
 * Plans returned by the planner are structured as a Directed Acyclic Graph
 * and as such, they tell the agent which operations can be executed in parallel,
 * and which need to be run in sequence.
 *
 * An agent is also Observable, meaning it provides a `subscribe` function that
 * receives an `Observer`. The agent will notify the observer of changes in the
 * system state, even as they happen inside long running action exections.
 *
 * Example:
 * ```ts
 * import { Agent, Task } from 'mahler';
 *
 * // Define a task to increase a counter
 * const plusOne = Task.from<number>({
 *  condition: (counter, {target}) => counter < target,
 *  effect: (counter) => ++counter._,
 *  description: '+1'
 * });
 *
 * const counter = Agent.from({
 *   // The initial system state
 *   initial: 0,
 *   // The agent knowledge database
 *   tasks: [plusOne],
 *   opts: {
 *     // Wait at minimum 10ms between re-plans
 *     // after failing to find a plan, the agent will use
 *     // exponential backoff to increase the wait time up to
 *     // a maximum given by maxWaitMs
 *     minWaitMs: 10,
 *   }
 * });
 *
 * // Tell the agent to start looking for a path to
 * // the goal. This will immediately start the agent without the
 * // need to wait. By default, the agent will continue looking for
 * // a plan forever if planning fails
 * counter.seek(10);
 *
 * // Subscribe to changes in the system state
 * counter.subscribe(console.log);
 *
 * // Wait for a result. If not given a timeout argument this may run forever
 * const res = agent.wait(1000);
 *
 * if (res.success) {
 * 	console.log(res.state); // 10
 * }
 *
 * // Stop the agent. This does not need to be awaited
 * counter.stop();
 * ```
 */
export interface Agent<TState = any> extends Subscribable<TState> {
	/**
	 * Tells the agent to seek a new target.
	 *
	 * The method doesn't wait for a result.
	 *
	 * If the agent is already seeking a plan, this will cancel
	 * the current execution and wait for it to be stopped
	 * before starting a new run.
	 *
	 * @param target - The target to seek
	 */
	seek(target: Target<TState>): void;

	/**
	 * Wait for the agent to reach the given target or
	 * terminate due to an error.
	 *
	 * If the timeout is reached before the agent terminates, the
	 * method will return a timeout error.
	 *
	 * Make sure to use a timeout if using an agent configured with `follow: true` otherwise
	 * this method will wait forever.
	 *
	 * @timeout - The maximum time to wait for the agent to reach the target, if not provided the method will until the agent reaches a result
	 */
	wait(timeout?: number): Promise<Result<TState>>;

	/**
	 * Get the last known state of the agent.
	 *
	 * Note that if the agent is in the middle of executing an action, this
	 * value may not be up to date with the actual state of the
	 * system.
	 */
	state(): TState;

	/**
	 * Stop any running execution. This method returns
	 * immediately.
	 */
	stop(): void;
}

type DeepPartial<T> = T extends any[] | ((...args: any[]) => any)
	? T
	: T extends object
	? {
			[P in keyof T]?: DeepPartial<T[P]>;
	  }
	: T;

/**
 * Create a new agent
 *
 * @param config 					- The agent configuration
 * @param config.initial  - The known initial state of the system
 * @param config.tasks 		- List tasks to use for planning. If not provided, the planner must be provided
 * @param config.planner 	- Planner to use for planning. If not provided, the tasks must be provided
 * @param config.sensors 	- List of sensors to use for monitoring the state
 * @param config.opts 		- The agent runtime options
 * @param config.opts.maxRetries - The maximum number of retries before giving up
 * @param config.opts.follow - If true, the agent will keep planning until it reaches the target or until it's stopped
 * @param config.opts.maxWaitMs - The maximum time to wait between retries
 * @param config.opts.minWaitMs - The minimum time to wait between retries
 * @param config.opts.backoffMs - A function that returns the time to wait between retries. It receives the number of failures as an argument, and defaults to exponential backoff.
 * @param config.opts.logger - A Logger instance to use for logging
 */
function from<TState>(
	config:
		| {
				initial: TState;
				planner?: Planner<TState>;
				sensors?: Array<Sensor<TState>>;
				opts?: DeepPartial<AgentOpts>;
		  }
		| {
				initial: TState;
				tasks?: Array<Task<TState, any, any>>;
				sensors?: Array<Sensor<TState>>;
				opts?: DeepPartial<AgentOpts>;
		  },
): Agent<TState>;
function from<TState>({
	initial: state,
	tasks = [],
	sensors = [],
	opts: userOpts = {},
	planner = Planner.from({
		tasks,
		config: { trace: userOpts.logger?.trace ?? NullLogger.trace },
	}),
}: {
	initial: TState;
	tasks?: Array<Task<TState, any, any>>;
	planner?: Planner<TState>;
	sensors?: Array<Sensor<TState>>;
	opts?: DeepPartial<AgentOpts>;
}): Agent<TState> {
	const opts: AgentOpts = {
		maxRetries: 0,
		follow: false,
		maxWaitMs: 5 * 60 * 1000,
		minWaitMs: 1 * 1000,
		backoffMs: (failures) => 2 ** failures * opts.minWaitMs,
		...userOpts,
		logger: { ...NullLogger, ...userOpts.logger },
	};

	assert(
		opts.maxRetries >= 0,
		'opts.maxRetries must be greater than or equal to 0',
	);
	assert(opts.maxWaitMs > 0, 'opts.maxWaitMs must be greater than 0');
	assert(opts.minWaitMs > 0, 'opts.minWaitMs must be greater than 0');

	const subject: Subject<TState> = new Subject();

	// Subscribe to runtime changes to keep
	// the local copy of state up-to-date
	subject.subscribe((s) => {
		state = s;
	});

	let setupRuntime: Promise<Runtime<TState> | null> = Promise.resolve(null);

	return {
		seek(target) {
			// We don't want seek to be an asynchronous call, so we
			// wrap the runtime in a promise. This way, we can ensure
			// that operations are always working on the right runtime,
			// when the target changes or the agent is stopped
			setupRuntime = setupRuntime.then((runtime) => {
				// Flatten the promise chain to avoid memory leaks
				setupRuntime = (async () => {
					if (runtime != null) {
						await runtime.stop();
						state = runtime.state;
					}

					runtime = new Runtime(subject, state, target, planner, sensors, opts);
					runtime.start();

					return runtime;
				})();
				return setupRuntime;
			});
		},
		stop() {
			void setupRuntime.then((runtime) => {
				if (runtime == null) {
					return;
				}

				// Reset the runtime
				setupRuntime = Promise.resolve(null);

				return runtime.stop().then(() => {
					// We notify subscribers of completion only
					// when stop is called
					subject.complete();
				});
			});
		},
		async wait(timeout: number = 0) {
			assert(timeout >= 0);
			const runtime = await setupRuntime;
			if (runtime == null) {
				return { success: false, error: new NotStarted() };
			}

			return runtime.wait(timeout);
		},
		state() {
			return state;
		},
		subscribe(next) {
			return subject.subscribe(next);
		},
	};
}

export const Agent = {
	from,
};
