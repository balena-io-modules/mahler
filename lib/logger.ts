export interface Logger {
	debug(...args: any[]): void;
	info(...args: any[]): void;
	warn(...args: any[]): void;
	error(...args: any[]): void;
	trace(...args: any[]): void;
}

export const NullLogger: Logger = {
	debug: () => {
		/*noop*/
	},
	info: () => {
		/*noop*/
	},
	warn: () => {
		/*noop*/
	},
	error: () => {
		/*noop*/
	},
	trace: () => {
		/*noop*/
	},
};
