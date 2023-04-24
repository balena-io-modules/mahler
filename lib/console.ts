import debug from 'debug';
import { Logger } from './logger';

// Create the default logger
// Send logger.info() and logger.debug() output to stdout
const logger = debug('mahler');
logger.log = console.log.bind(console);

const log: Logger = {
	info: logger.extend('info'),
	warn: debug('mahler:warn'),
	error: debug('mahler:error'),
	debug: logger.extend('debug'),
};

export default log;
