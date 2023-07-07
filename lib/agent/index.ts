import assert from '../assert';
import { Task } from '../task';
import { Target } from '../target';
import { Planner } from '../planner';
import { Sensor } from '../sensor';
import { NullLogger } from '../logger';
import { Runtime } from './runtime';
import { Result, AgentOpts, NotStarted } from './types';

export * from './types';

export interface Agent<TState = any> {
	/**
	 * Tells the agent to seek a new target.
	 *
	 * The method doesn't wait for a result. If there is no execution
	 * in progress, the method will return immediately.
	 *
	 * If the agent is already seeking a plan, this will cancel
	 * the current execution and wait for it to be stopped
	 * before starting a new run.
	 */
	seek(t: Target<TState>): Promise<void>;

	/**
	 * Wait for the agent to reach the given target or
	 * terminate due to an error.
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
	 * Stop any running execution
	 */
	stop(): Promise<void>;
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
 */
function of<TState>(
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
function of<TState>({
	initial: state,
	tasks = [],
	sensors = [],
	opts: userOpts = {},
	planner = Planner.of({
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

	let runtime: Runtime<TState> | null = null;

	return {
		async seek(target) {
			if (runtime != null) {
				await runtime.stop();
				state = runtime.state;
			}

			runtime = new Runtime(state, target, planner, sensors, opts);
			runtime.start();
		},
		async stop() {
			if (runtime != null) {
				return runtime.stop();
			}
		},
		async wait(timeout: number = 0) {
			assert(timeout >= 0);
			if (runtime == null) {
				return { success: false, error: new NotStarted() };
			}

			return runtime.wait(timeout);
		},
		state() {
			if (runtime == null) {
				return state;
			}
			return runtime.state;
		},
	};
}

export const Agent = {
	of,
};
