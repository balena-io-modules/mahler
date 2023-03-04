import assert from './assert';

export type Next<T> = (fn: (s: T) => T) => void;

export interface Subscriber<T> {
	next: Next<T>;
	error<E extends Error>(e: E): void;
	complete(): void;
}

export interface Subscribed {
	unsubscribe(): void;
}

export interface Sensor<T> {
	(subscriber: Subscriber<T>): Promise<void>;

	/**
	 * Add a subscriber to the sensor
	 */
	subscribe(subscriber: Next<T> | Subscriber<T>): Subscribed;

	/**
	 * Wait for the sensor to finish at most
	 * timeout milliseconds.
	 */
	wait(timeout: number): Promise<void>;
}

export class SensorHasNoSubscribers extends Error {
	constructor() {
		super('No subscribers for the sensor');
	}
}

export class SensorTimeout extends Error {
	constructor() {
		super('The wait for the sensor timed out');
	}
}

class ProxySubscriber<T> implements Subscriber<T> {
	private subscribers: Array<Subscriber<T>> = [];

	next(fn: (s: T) => T) {
		// We throw to force the sensor to stop
		// the sensor may still catch this error, but that's
		// on the user
		if (this.subscribers.length === 0) {
			throw new SensorHasNoSubscribers();
		}
		this.subscribers.forEach((s) => s.next(fn));
	}

	error(e: Error) {
		if (this.subscribers.length === 0) {
			throw new SensorHasNoSubscribers();
		}
		this.subscribers.forEach((s) => s.error(e));
	}

	complete() {
		this.subscribers.forEach((s) => s.complete());
		while (this.subscribers.length > 0) {
			this.subscribers.pop();
		}
	}

	add(s: Subscriber<T>) {
		this.subscribers.push(s);
	}

	remove(s: Subscriber<T>) {
		const index = this.subscribers.indexOf(s);
		if (index !== -1) {
			this.subscribers.splice(index, 1);
		}
	}
}

function of<T>(
	sensor: (subscriber: Subscriber<T>) => Promise<void>,
): Sensor<T> {
	const proxy = new ProxySubscriber<T>();

	let running = false;
	let result = Promise.resolve();
	return Object.assign(sensor.bind({}), {
		subscribe(next: Next<T> | Subscriber<T>) {
			let subscriber: Subscriber<T>;
			if (typeof next === 'function') {
				subscriber = {
					next,
					error: () => void 0,
					complete: () => void 0,
				};
			} else {
				subscriber = next;
			}
			proxy.add(subscriber);

			// Now that we have subscribers we start the sensor
			if (!running) {
				result = sensor(proxy)
					.catch((e) => {
						if (e instanceof SensorHasNoSubscribers) {
							return;
						}

						// Notify subscriber of uncaught errors on the sensor
						proxy.error(e);
					})
					.finally(() => {
						// Notify the proxy of the sensor completion
						proxy.complete();
						running = false;
					});
				running = true;
			}

			return {
				unsubscribe: () => proxy.remove(subscriber),
			};
		},

		wait(timeout: number) {
			assert(timeout > 0);
			return new Promise<void>(async (resolve, reject) => {
				const timer = setTimeout(() => {
					reject(new SensorTimeout());
				}, timeout);

				await result;
				clearTimeout(timer);
				resolve();
			});
		},
	});
}

export const Sensor = {
	of,
};
