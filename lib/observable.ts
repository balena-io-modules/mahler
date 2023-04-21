import assert from './assert';

export type Next<T> = (t: T) => void;

export interface Observer<T> {
	next: Next<T>;
	error<E extends Error>(e: E): void;
	complete(): void;
}

export interface Subscribed {
	unsubscribe(): void;
}

export interface Observable<T> {
	(subscriber: Observer<T>): void | Promise<void>;

	/**
	 * Add a subscriber to the sensor
	 */
	subscribe(subscriber: Next<T> | Observer<T>): Subscribed;

	/**
	 * Wait for the sensor to finish at most
	 * timeout milliseconds.
	 */
	wait(timeout: number): Promise<void>;
}

export class ObservableHasNoSubscribers extends Error {
	constructor() {
		super('No subscribers for the observable');
	}
}

export class ObservableTimeout extends Error {
	constructor() {
		super('The wait for the observable timed out');
	}
}

class ProxyObserver<T> implements Observer<T> {
	private subscribers: Array<Observer<T>> = [];

	next(t: T) {
		// We throw to force the sensor to stop
		// the sensor may still catch this error, but that's
		// on the user
		if (this.subscribers.length === 0) {
			throw new ObservableHasNoSubscribers();
		}
		this.subscribers.forEach((s) => s.next(t));
	}

	error(e: Error) {
		if (this.subscribers.length === 0) {
			throw new ObservableHasNoSubscribers();
		}
		this.subscribers.forEach((s) => s.error(e));
	}

	complete() {
		this.subscribers.forEach((s) => s.complete());
		while (this.subscribers.length > 0) {
			this.subscribers.pop();
		}
	}

	add(s: Observer<T>) {
		this.subscribers.push(s);
	}

	remove(s: Observer<T>) {
		const index = this.subscribers.indexOf(s);
		if (index !== -1) {
			this.subscribers.splice(index, 1);
		}
	}
}

function of<T>(
	observer: (subscriber: Observer<T>) => void | Promise<void>,
): Observable<T> {
	const proxy = new ProxyObserver<T>();

	let running = false;
	let result = Promise.resolve();
	return Object.assign(observer.bind({}), {
		subscribe(next: Next<T> | Observer<T>) {
			let subscriber: Observer<T>;
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
				result = Promise.resolve(observer(proxy))
					.catch((e) => {
						if (e instanceof ObservableHasNoSubscribers) {
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
					reject(new ObservableTimeout());
				}, timeout);

				await result;
				clearTimeout(timer);
				resolve();
			});
		},
	});
}

export const Observable = {
	of,
};
