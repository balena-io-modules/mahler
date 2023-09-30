export type Next<T> = (t: T) => void;

export interface Observer<T> {
	next: Next<T>;
	error<E extends Error>(e: E): void;
	complete(): void;
}

interface Subscriber<T> extends Observer<T> {
	closed: boolean;
}

export interface Subscription {
	unsubscribe(): void;
}

export interface Subscribable<T> {
	subscribe(subscriber: Observer<T> | Next<T>): Subscription;
}

export interface Observable<T> extends Subscribable<T> {
	map<U>(f: (t: T) => U): Observable<U>;
	flatMap<U>(f: (t: T) => Observable<U>): Observable<U>;
}

/**
 * A Subject is a special type of observable tha allows values to be
 * multicasted to many observers.
 *
 * We use the name Subject as is the terminology used by rxjs
 * https://rxjs.dev/guide/subject
 */
export class Subject<T> implements Observer<T>, Subscribable<T> {
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

	subscribe(next: Observer<T> | Next<T>): Subscription {
		let s: Observer<T>;
		if (typeof next === 'function') {
			s = {
				next,
				error: () => void 0,
				complete: () => void 0,
			};
		} else {
			s = next;
		}
		this.subscribers.push(s);

		const self = this;

		return {
			unsubscribe() {
				const index = self.subscribers.indexOf(s);
				if (index !== -1) {
					self.subscribers.splice(index, 1);
				}
			},
		};
	}
}

type ObservableInput<T> =
	| PromiseLike<T>
	| Iterable<T>
	| AsyncIterable<T>
	| Subscribable<T>;

function isPromiseLike(x: unknown): x is PromiseLike<any> {
	if (x instanceof Promise) {
		return true;
	}
	return (
		x != null &&
		(typeof x === 'function' || typeof x === 'object') &&
		typeof (x as any).then === 'function'
	);
}

function isSubscribable<T>(x: unknown): x is Subscribable<T> {
	return x != null && typeof (x as any).subscribe === 'function';
}

function isIterable<T>(x: unknown): x is Iterable<T> {
	return x != null && typeof x === 'object' && Symbol.iterator in x;
}

async function processPromise<T>(p: PromiseLike<T>, subscriber: Subscriber<T>) {
	const t = await p;
	if (subscriber.closed) {
		return;
	}
	subscriber.next(t);
	subscriber.complete();
}

async function processIterable<T>(
	input: Iterable<T> | AsyncIterable<T>,
	subscriber: Subscriber<T>,
) {
	const items = isIterable(input)
		? input[Symbol.iterator]()
		: input[Symbol.asyncIterator]();

	let n = await items.next();
	while (!n.done) {
		if (subscriber.closed) {
			return;
		}
		subscriber.next(n.value);
		n = await items.next();
	}

	if (subscriber.closed) {
		return;
	}

	// If the iterable or generator function
	// returns an extra value at the end, we
	// need to pass it to the subscriber as well
	if (n.value != null) {
		subscriber.next(n.value);
	}
	subscriber.complete();
}

function from<T>(input: ObservableInput<T>): Observable<T> {
	const self: Observable<T> = {
		subscribe(next: Observer<T> | Next<T>): Subscription {
			let s: Subscriber<T>;
			if (typeof next === 'function') {
				s = {
					next,
					// This will result in an unhandledRejection as the
					// promise is not awaited below. While this is not ideal,
					// those errors can be detected through the node `unhandledRejection`
					// event https://nodejs.org/api/process.html#event-unhandledrejection
					// when in doubt, users should pass an error handler
					error: (e) => {
						throw e;
					},
					complete: () => void 0,
					closed: false,
				};
			} else {
				s = { ...next, closed: false };
			}

			if (isSubscribable(input)) {
				return input.subscribe(s);
			}

			if (isPromiseLike(input)) {
				processPromise(input, s).catch(s.error);
			} else {
				processIterable(input, s).catch(s.error);
			}

			return {
				unsubscribe: () => {
					s.closed = true;
					s.next = () => void 0;
				},
			};
		},
		map<U>(f: (t: T) => U): Observable<U> {
			return from(map(self, f));
		},
		flatMap<U>(f: (t: T) => Subscribable<U>): Observable<U> {
			return from(flatMap(self, f));
		},
	};

	return self;
}

function flatMap<T, U>(
	o: Subscribable<T>,
	f: (t: T) => Subscribable<U>,
): Subscribable<U> {
	return {
		subscribe(subscriber: Observer<U>): Subscription {
			const subscriptions: Subscription[] = [];
			const subscription = o.subscribe({
				next: (t) => {
					const innerSubscription = f(t).subscribe({
						next: subscriber.next,
						error: (e) => {
							subscriber.error(e);
							subscriptions.forEach((s) => s.unsubscribe());
						},
						complete: () => {
							subscriptions.splice(subscriptions.indexOf(innerSubscription), 1);
							if (subscriptions.length === 0) {
								subscriber.complete();
							}
						},
					});
					subscriptions.push(innerSubscription);
				},
				error: subscriber.error,
				complete: () => {
					if (subscriptions.length === 0) {
						subscriber.complete();
					}
				},
			});
			return {
				unsubscribe: () => {
					subscription.unsubscribe();
					subscriptions.forEach((s) => s.unsubscribe());
				},
			};
		},
	};
}

function map<T, U>(o: Subscribable<T>, f: (t: T) => U): Subscribable<U> {
	return {
		subscribe(subscriber: Observer<U>): Subscription {
			return o.subscribe({
				...subscriber,
				next: (t) => subscriber.next(f(t)),
			});
		},
	};
}

function of<T>(...values: T[]): Observable<T> {
	return from(values);
}

function is<T>(x: unknown): x is Observable<T> {
	return isSubscribable<T>(x) && typeof (x as any).map === 'function';
}

export const Observable = {
	of,
	from,
	is,
	map,
	flatMap,
};
