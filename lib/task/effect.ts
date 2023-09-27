import { Observable, Subscribable, Next, Observer } from '../observable';

type AsyncReturn<T> = Promise<T> | AsyncGenerator<T, T | void, void>;
type Async<T> = () => AsyncReturn<T>;
type Sync<T> = () => T;

type LazyObservable<T> = () => Observable<T>;

/**
 * The Effect type combines a sync and async computations into a single
 * type.
 *
 * The sync computation is a pure function returning a value of type T.
 * The async computation is a side effect, a function that performs a side effect
 * and returns a value of type T.
 *
 * For IO operations, a pure, synchronous computation needs to be provided as
 * a fallback. The pure side is used to test how the side effect
 * function will change the state of the world, without the need
 * to actually perform IO.
 *
 * An effect doesn't need to perform IO. Effects can be used to encode pure computations
 * where both the sync and async computations are pure.
 *
 * Effects can be chained using map and flatMap. Combinators functions can also be used
 * to combine effects. The pipe function can be used to chain effects in a more declarative
 * way.
 *
 * An Effect can be called as a function or be awaited as a promise. The function is used to perform
 * the sync computation, while awaiting will perform the async computation.
 *
 * Example: a function that reads a number from hardware
 * ```ts
 * import {Effect, IO} from './effects';
 *
 * const readNumber = (expected: number): Effect<string> =>
 *  // This reads a number from hardware, but returns an expected
 *  // value as a mock
 * 	IO(async () => await readFromHW(), expected)
 *
 * const eff = readNumber(0);
 * console.log(eff()); // 0
 * console.log(await eff); // 42
 *
 * // Combine effects
 * const eff2 = Effect.of(0).flatMap(readNumber).map(x => x + 1);
 *
 * console.log(eff()); // 1
 * console.log(await eff); // 43
 * ```
 */
export interface Effect<T> extends Subscribable<T> {
	/**
	 * Execute the effect synchronously
	 */
	(): T;
	/**
	 * Allow to use the effect as a promise and apply the full
	 * asynchronous part of the operation
	 */
	then<U = T, N = never>(
		resolved?: (t: T) => U | PromiseLike<U>,
		rejected?: (reason: any) => N | PromiseLike<N>,
	): PromiseLike<U | N>;
	/**
	 * The map function transforms the effect by applying a function
	 * to the internal value.
	 */
	map<U>(f: (t: T) => U): Effect<U>;
	/**
	 * The flatMap function allows to chain effects. The function
	 * passed to flatMap is applied to the internal value, and
	 * the result is returned as a new effect.
	 */
	flatMap<U>(f: (t: T) => Effect<U>): Effect<U>;
}

/**
 * Builds an effect from a sync and async computation. The async computation is
 * encoded as an observable, which allows an effect to be subscribed
 */
function build(obs: LazyObservable<void>, sync?: Sync<void>): Effect<void>;
function build<T>(obs: LazyObservable<T>, sync: Sync<T>): Effect<T>;
function build<T>(
	obs: LazyObservable<T>,
	sync = (() => {
		/* noop */
	}) as () => T,
): Effect<T> {
	return Object.assign(sync, {
		subscribe(next: Next<T> | Observer<T>) {
			return obs().subscribe(next);
		},
		then<U = T, N = never>(
			onresolve?: (t: T) => U | PromiseLike<U>,
			onreject?: (reason: any) => N | PromiseLike<N>,
		): PromiseLike<U | N> {
			return new Promise<T>((resolve, reject) => {
				let res: T;
				obs().subscribe({
					next(t) {
						res = t;
					},
					error: reject,
					complete: () => resolve(res),
				});
			}).then(onresolve, onreject);
		},
		map<U>(fu: (t: T) => U): Effect<U> {
			return build<U>(
				() => obs().map(fu),
				() => fu(sync()),
			);
		},
		flatMap<U>(fu: (t: T) => Effect<U>): Effect<U> {
			return build<U>(() => obs().flatMap((t) => fu(t)), fu(sync()));
		},
	});
}

/**
 * Build an effect with an async and a sync computation
 *
 * The async part of the effect is either an async function or a function
 * returning an async generator. If a generator is used, then the yielded
 * values from the effect will be provided to subscribers of the effect.
 *
 * The synchronous function is mandatory except for effects returning
 * `void`
 */
function from(async: Async<void>, sync: Sync<void>): Effect<void>;
function from<T>(async: Async<T>, sync: Sync<T>): Effect<T>;
function from<T>(async: Async<T>, sync?: Sync<T>): Effect<T> {
	return build(() => Observable.from(async()), sync!);
}

/**
 * Creates a pure effect, from a given synchronous operation.
 */
function pure<T>(f: Sync<T>): Effect<T> {
	return from(async () => f(), f);
}

/**
 * Creates a new effect from a value. It basically "lifts" the value
 * to the Effects domain.
 */
function of<T>(t: T): Effect<T> {
	return pure(() => t);
}

/**
 * Create a side effect from an async and sync sides
 * value.
 */
export const IO = from;

/**
 * Type guard to check if a given value is an effect
 */
function is<T>(x: unknown): x is Effect<T> {
	return (
		x != null &&
		typeof x === 'function' &&
		typeof (x as any).then === 'function' &&
		typeof (x as any).map === 'function'
	);
}

export const Effect = {
	of,
	from,
	is,
	map<T, U>(et: Effect<T>, ef: (t: T) => U): Effect<U> {
		return et.map(ef);
	},
	flatMap<T, U>(et: Effect<T>, ef: (t: T) => Effect<U>): Effect<U> {
		return et.flatMap(ef);
	},
};
