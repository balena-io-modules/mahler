import { Failure, Stopped, type AgentRuntimeEvent } from '../agent';
import type { DiffOperation } from '../operation';
import type { PlanAction } from '../planner';
import { SearchFailed } from '../planner';
import { diff } from '../distance';
import * as DAG from '../dag';

export interface Logger {
	debug(...args: any[]): void;
	info(...args: any[]): void;
	warn(...args: any[]): void;
	error(...args: any[]): void;
}

export const NullLogger: Logger = {
	debug: () => {
		/* noop*/
	},
	info: () => {
		/* noop*/
	},
	warn: () => {
		/* noop*/
	},
	error: () => {
		/* noop*/
	},
};

export type Trace<S> = (e: AgentRuntimeEvent<S>) => void;

/**
 * Create a human readable tracer of events during agent runtime
 */
export function readableTrace<S = any>(logger: Partial<Logger>): Trace<S> {
	const log = {
		...NullLogger,
		...logger,
	};

	const toLog = (o: DiffOperation<S, any>) => {
		if (o.op === 'create') {
			return ['create', o.path, 'with value', o.target];
		}

		if (o.op === 'update') {
			return ['update', o.path, 'from', o.source, 'to', o.target];
		}

		return ['delete', o.path];
	};

	return function (e: AgentRuntimeEvent<S>) {
		switch (e.event) {
			case 'start': {
				log.info('applying new target state');
				return;
			}

			case 'find-plan':
				log.info('looking for a plan');
				{
					// avoid no-case-declarations
					const changes = diff(e.state, e.target);
					log.debug(`pending changes:${changes.length > 0 ? '' : ' none'}`);
					changes.map(toLog).forEach((change) => {
						log.debug('-', ...change);
					});
				}
				break;

			case 'plan-found':
				log.info(
					`plan found after ${
						e.stats.iterations
					} iterations in ${e.stats.time.toFixed(1)}ms`,
				);
				log.debug('will execute the following actions:');
				DAG.toString(e.start, (a: PlanAction<S>) => a.action.description)
					.split('\n')
					.map((action) => {
						log.debug(action);
					});
				break;

			case 'plan-not-found':
				if (e.cause !== SearchFailed) {
					log.error(
						'no plan found, reason:',
						(e.cause as Error).message ?? e.cause,
					);
				} else {
					log.warn('no plan found');
				}
				break;

			case 'plan-executed': {
				log.info('plan executed successfully');
				return;
			}

			case 'action-condition-failed': {
				log.warn(`${e.action.description}: condition failed`);
				return;
			}

			case 'action-start': {
				log.info(`${e.action.description}: running ...`);
				return;
			}

			case 'action-success': {
				log.info(`${e.action.description}: success`);
				return;
			}

			case 'action-failure': {
				log.error(`${e.action.description}: failed`, e.cause);
				return;
			}

			case 'backoff': {
				log.debug(`waiting ${e.delayMs / 1000}s before re - planning`);
				return;
			}

			case 'success': {
				log.info('nothing else to do: target state reached');
				return;
			}

			case 'failure':
				if (e.cause instanceof Failure) {
					log.error(
						`aborting target apply after ${e.cause.tries} failed attempts`,
					);
				} else if (e.cause instanceof Stopped) {
					log.warn('plan execution cancelled');
				} else {
					log.error(
						`unknown error occured while applying target state:`,
						(e as any)?.message ?? e,
					);
				}
				break;

			default:
				break;
		}
	};
}
