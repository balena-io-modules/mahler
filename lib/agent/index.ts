import assert from '../assert';
import { Task } from '../task';
import { Target } from '../target';
import { Planner } from '../planner';
import { Sensor } from '../sensor';
import { NullLogger } from '../logger';
import { Runtime } from './runtime';
import { AgentResult, AgentOpts, NotStarted } from './types';

export * from './types';

export interface Agent<TState = any> {
	start(t: Target<TState>): void;
	target(t: Target<TState>): Promise<void>;
	result(timeout?: number): Promise<AgentResult>;
	state(): TState;
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
		start(target) {
			assert(runtime == null, 'Agent already started');
			runtime = new Runtime(state, target, planner, sensors, opts);
			runtime.start();
		},
		async target(target) {
			if (runtime != null) {
				await runtime.stop();
				state = runtime.state();
			}

			runtime = new Runtime(state, target, planner, sensors, opts);
			runtime.start();
		},
		async stop() {
			if (runtime != null) {
				return runtime.stop();
			}
		},
		async result(timeout: number = 0) {
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
			return runtime.state();
		},
	};
}

export const Agent = {
	of,
};
