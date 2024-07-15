import Debug from 'debug';
import type { Logger } from 'mahler/utils';
import { readableTrace } from 'mahler/utils';

// Create the default logger
// Send logger.info() and logger.debug() output to stdout
const debug = Debug('mahler');
debug.log = console.log.bind(console);

const traceDebug = debug.extend('trace');

// Export a pretty printing log function for tests
export const log = (...v: any[]) => {
	traceDebug('%s', ...v.map((i) => JSON.stringify(i, null, 2)));
};

export const logger: Logger = {
	info: debug.extend('info'),
	warn: Debug('mahler:warn'),
	error: Debug('mahler:error'),
	debug: debug.extend('debug'),
};

if (process.env.DEBUG == null) {
	Debug.enable('mahler:error,mahler:warn,mahler:info');
}

export const trace = readableTrace(logger);
export default trace;
