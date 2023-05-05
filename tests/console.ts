import Debug from 'debug';
import { Logger } from '~/lib';

// Create the default logger
// Send logger.info() and logger.debug() output to stdout
const debug = Debug('mahler');
debug.log = console.log.bind(console);

const logger: Logger = {
	info: debug.extend('info'),
	warn: Debug('mahler:warn'),
	error: Debug('mahler:error'),
	debug: debug.extend('debug'),
	trace: debug.extend('trace'),
};

export default logger;
