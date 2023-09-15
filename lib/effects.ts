export { pipe, flow } from 'fp-ts/function';

type Async<T> = () => Promise<T>;
type Sync<T> = () => T;

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
 * An Effect can be called as a function or via its `run()` method. The function is used to perform
 * the sync computation, while calling `run` is used to perform the async computation.
 *
 * Example: a function that reads a number from hardware
 * ```ts
 * import {IO, pipe, map} from '@mahler/effects';
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
 * const eff2 = pipe(
 * 	0,
 * 	readNumber,
 * 	map(x => x + 1)
 * );
 *
 * console.log(eff()); // 1
 * console.log(await eff); // 43
 * ```
 */
export interface Effect<T> {
	/**
	 * Execute the effect synchronously
	 */
	(): T;
	/**
	 * Execute the full version of the effect, including the async
	 * computation.
	 */
	run(): Promise<T>;
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
 * Builds an effect from a sync and async computation.
 */
function build(async: Async<void>, sync: Sync<void>): Effect<void>;
function build<T>(async: Async<T>, sync: Sync<T>): Effect<T>;
function build<T>(
	async: Async<T>,
	sync = (() => {
		/* noop */
	}) as () => T,
): Effect<T> {
	return Object.assign(sync, {
		async run(): Promise<T> {
			return await async();
		},
		map<U>(fu: (t: T) => U): Effect<U> {
			return build<U>(
				async () => {
					const t = await async();
					return fu(t);
				},
				() => fu(sync()),
			);
		},
		flatMap<U>(fu: (t: T) => Effect<U>): Effect<U> {
			return build<U>(async () => {
				const t = await async();
				return fu(t).run();
			}, fu(sync()));
		},
	});
}

/**
 * Creates a pure effect, from a given function.
 */
function pure<T>(f: Sync<T>): Effect<T> {
	return build(async () => f(), f);
}

/**
 * Wraps a value in an effect
 */
export function of<T>(t: T): Effect<T> {
	return pure(() => t);
}

/**
 * Maps a function over an effect.
 *
 * This returns a function on effects that can be used as
 * part of a pipe
 */
export function map<T, U>(ef: (t: T) => U): (et: Effect<T>) => Effect<U> {
	return (et: Effect<T>) => et.map(ef);
}

/**
 * Chains two effects together.
 *
 * This returns a function on effects that can be used as
 * part of a pipe
 */
export function flatMap<T, U>(
	ef: (t: T) => Effect<U>,
): (et: Effect<T>) => Effect<U> {
	return (et: Effect<T>) => et.flatMap(ef);
}

/**
 * Chains two effects together.
 *
 * This returns a function on effects that can be used as
 * part of a pipe
 *
 * This is an alias of flatMap
 */
export const bind = flatMap;

async function run<T>(e: Effect<T>): Promise<T> {
	return await e.run();
}

/**
 * Create a side effect from an async function and a fallback
 * value.
 */
export function IO(async: Async<void>): Effect<void>;
export function IO<T>(async: Async<T>, t: T): Effect<T>;
export function IO<T>(async: Async<T>, t?: T): Effect<T> {
	return build(async, of(t!));
}

/**
 * Creates a new effect conditionally depending
 * on the evaluation of a predicate.
 *
 * Returns a pipeable function on effects
 */
export function when<T>(
	pred: (t: T) => boolean,
	f: (t: T) => Effect<T>,
): (et: Effect<T>) => Effect<T> {
	return (et: Effect<T>) => et.flatMap((t) => (pred(t) ? f(t) : of(t)));
}

/**
 * Flattens a nested effect.
 */
export function flatten<T>(eet: Effect<Effect<T>>): Effect<T> {
	return eet.flatMap((et) => et);
}

/**
 * Return a pipeable function that can be applied to the contents
 * of an effect without modifying the internal value.
 *
 * The given function must not modify the passed value and its result, if
 * any, will be discarded
 *
 * Example: logging
 * ```ts
 * import {of, pipe, tap} from '@mahler/effects';
 *
 * const effect = pipe(
 * 	0,
 * 	of,
 * 	tap(x => console.log('before', x)),
 * 	map(x => x + 1),
 * 	tap(x => console.log('after', x)),
 * );
 *
 * effect(); // before 0, after 1
 * ```
 */
export function tap<T, U = void>(f: (t: T) => U): (et: Effect<T>) => Effect<T> {
	return (et: Effect<T>) =>
		et.map((t) => {
			f(t);
			return t;
		});
}

/**
 * Returs a pipeable function that performs an IO operation
 *
 * This is similar to `tap`, except it only modifies the async side of the effect.
 *
 * The return value of the function is discarded
 */
export function tapIO<T, U = void>(
	f: (t: T) => Promise<U>,
): (et: Effect<T>) => Effect<T> {
	return (et: Effect<T>) =>
		et.flatMap((t) =>
			IO(async () => {
				await f(t);
				return t;
			}, t),
		);
}

/**
 * Set a property of an object in an effect.
 */
export function set<T, K extends keyof T>(
	key: K,
	eu: Effect<T[K]>,
): (et: Effect<T>) => Effect<T> {
	return (et) => et.flatMap((t) => eu.map((u) => ({ ...t, [key]: u })));
}

function isEffect<T>(x: unknown): x is Effect<T> {
	return (
		x != null &&
		typeof x === 'function' &&
		typeof (x as any).then === 'function' &&
		typeof (x as any).map === 'function'
	);
}

export const Effect = {
	of,
	build,
	is: isEffect,
	map<T, U>(et: Effect<T>, ef: (t: T) => U): Effect<U> {
		return et.map(ef);
	},
	flatMap<T, U>(et: Effect<T>, ef: (t: T) => Effect<U>): Effect<U> {
		return et.flatMap(ef);
	},
	run,
};
