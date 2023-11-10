import { Logger } from '../logger';

export type Result<T> =
	| { success: true; state: T }
	| { success: false; error: Error };

/**
 * The agent runtime status
 *
 * - idle: The agent is not currently seeking a target state but may be listening for changes
 * - running: The agent is actively seeking a target state
 * - stopped: The agent has been stopped and is no longer listening for changes
 */
export type AgentStatus = 'idle' | 'running' | 'stopping' | 'stopped';

export interface AgentOpts {
	/**
	 * Follow the system state and keep re-planning if the state goes off-target
	 */
	follow: boolean;

	/**
	 * The maximum number of attempts for reaching the target before giving up. Defaults to
	 * infinite tries.
	 */
	maxRetries: number;

	/**
	 * The maximum time (in millis) to wait between re-plans. Default is 5 minutes
	 */
	maxWaitMs: number;

	/**
	 *  The minimal interval (in millis), to wait between re-plans. Defaults to 1 second;
	 */
	minWaitMs: number;

	/**
	 * A function calculating the amount if time to wait before retrying after a failure.
	 * Defaults to exponential backoff between minWaitMs and maxWaitMs
	 */
	backoffMs: (failures: number) => number;

	/**
	 * A Logger instance to use for reporting
	 */
	logger: Logger;
}

/**
 * This error is returned by the wait method
 * if the agent has not been given a target to seek yete
 */
export class NotStarted extends Error {
	constructor() {
		super('Agent has not been started yet');
	}
}

/**
 * Returned by the agent runtime if a new target has been
 * received, causing the runtime to be stopped
 */
export class Stopped extends Error {
	constructor() {
		super('Agent was stopped before a plan could be found');
	}
}

/**
 * Returned by the agent runtime if the target was not reached within
 * the maximum configured number of tries
 */
export class Failure extends Error {
	constructor(tries: number) {
		super('Agent failed to reach target after ' + tries + ' attempts');
	}
}

/**
 * Returned by the Agent.wait method if the agent ddoes not yield a
 * result within the given timeout
 */
export class Timeout extends Error {
	constructor(timeout: number) {
		super(`Agent timed out after ${timeout}(ms) while waiting for a result`);
	}
}

/**
 * Returned by the runtime if the plan search of execution fails due to an
 * unknown cause. This probably means there is a bug.
 */
export class UnknownError extends Error {
	constructor(cause: unknown) {
		super('Agent stopped due to unknown error: ' + cause, { cause });
	}
}
