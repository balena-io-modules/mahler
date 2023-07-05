export type Next<T> = (t: T) => void;

export interface Observer<T> {
	next: Next<T>;
	error<E extends Error>(e: E): void;
	complete(): void;
}

export interface Subscription {
	unsubscribe(): void;
}

export interface Observable<T> {
	/**
	 * Add a subscriber to the sensor
	 */
	subscribe(subscriber: Next<T> | Observer<T>): Subscription;
}

/**
 * A Subject is a special type of observable tha allows values to be
 * multicasted to many observers.
 *
 * We use the name Subject as is the terminology used by rxjs
 * https://rxjs.dev/guide/subject
 */
export class Subject<T> implements Observer<T>, Observable<T> {
	private subscribers: Array<Observer<T>> = [];

	// Removes all subscribers
	private cleanup() {
		while (this.subscribers.length > 0) {
			this.subscribers.pop();
		}
	}

	next(t: T) {
		this.subscribers.forEach((s) => s.next(t));
	}

	error(e: Error) {
		this.subscribers.forEach((s) => s.error(e));

		// We assume the observable operation terminates
		// after an error
		this.cleanup();
	}

	complete() {
		this.subscribers.forEach((s) => s.complete());

		// We assume the observable operation terminates
		// after complete is called
		this.cleanup();
	}

	subscribe(s: Observer<T>): Subscription {
		this.subscribers.push(s);

		const subject = this;

		return {
			unsubscribe() {
				const index = subject.subscribers.indexOf(s);
				if (index !== -1) {
					subject.subscribers.splice(index, 1);
				}
			},
		};
	}
}

function of<T>(
	observable: (observer: Observer<T>) => void | Promise<void>,
): Observable<T> {
	const subject = new Subject<T>();

	let running = false;
	return {
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
			const subscription = subject.subscribe(subscriber);

			// Now that we have subscribers we start the observable
			if (!running) {
				Promise.resolve(observable(subject))
					.then(() => {
						// Notify the proxy of the observable completion
						subject.complete();
					})
					.catch((e) => {
						// Notify subscriber of uncaught errors on the observable
						subject.error(e);
					})
					.finally(() => {
						// The observable will restart when a new subscriber is added
						running = false;
					});
				running = true;
			}

			return subscription;
		},
	};
}

export const Observable = {
	of,
};
