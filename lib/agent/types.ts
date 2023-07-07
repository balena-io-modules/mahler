import { Logger } from '../logger';

export type Result<T> =
	| { success: true; state: T }
	| { success: false; error: Error };

export interface AgentOpts {
	/**
	 * Follow the target state and keep re-planning if the state goes off-target
	 */
	follow: boolean;

	/**
	 * The maximum number of attempts for finding a plan before giving up.
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
	 * A logger instance to use for reporting
	 */
	logger: Logger;
}

export class NotStarted extends Error {
	constructor() {
		super('Agent has not been started yet');
	}
}

export class Stopped extends Error {
	constructor() {
		super('Agent was stopped before a plan could be found');
	}
}

export class Failure extends Error {
	constructor(tries: number) {
		super('Agent failed to find a plan after ' + tries + ' attempts');
	}
}

export class Timeout extends Error {
	constructor(timeout: number) {
		super(`Agent timed out after ${timeout}(ms) while waiting for a result`);
	}
}

export class UnknownError extends Error {
	constructor(cause: unknown) {
		super('Agent stopped due to unknown error: ' + cause, { cause });
	}
}
