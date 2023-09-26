import { Effect, IO } from './effect';
import { AsyncReturn } from './types';

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
 * Creates a new IO effect from a async and sync
 * functions.
 *
 * If no sync function is used, then the identity function
 * will be used as the sync part.
 */
export function mapIO<T, U extends T = T>(
	fa: (t: T) => AsyncReturn<U>,
	// TODO: the `as U` cast is a potential source for bugs
	// as the async side could return a value not in the sync side
	// I'm not sure there is a way to type check that both return
	// values match
	fs: (t: T) => U = (t: T) => t as U,
): (et: Effect<T>) => Effect<U> {
	return flatMap((t) =>
		IO(
			() => fa(t),
			() => fs(t),
		),
	);
}

/**
 * Creates a new effect conditionally depending
 * on the evaluation of a predicate.
 *
 * Returns a pipeable function on effects
 */
export function when<T, U extends T = T>(
	condition: (t: T) => boolean,
	doIf: (t: T) => Effect<U>,
	doElse: (t: T) => Effect<U> = (t) => Effect.of(t as U),
): (et: Effect<T>) => Effect<T> {
	return flatMap((t) => (condition(t) ? doIf(t) : doElse(t)));
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
			IO(
				async () => {
					await f(t);
					return t;
				},
				() => t,
			),
		);
}

export function bind<N extends string | number | symbol, T, U>(
	key: Exclude<N, keyof T>,
	fn: (t: T) => Effect<U>,
): (
	et: Effect<T>,
) => Effect<{ readonly [K in N | keyof T]: K extends keyof T ? T[K] : U }> {
	return flatMap((t) => fn(t).map((u) => ({ ...t, [key]: u }) as any));
}

export function set<T, N extends string, U>(
	key: Exclude<N, keyof T>,
	fn: (t: T) => U,
): (
	et: Effect<T>,
) => Effect<{ readonly [K in N | keyof T]: K extends keyof T ? T[K] : U }> {
	return map((t) => ({ ...t, [key]: fn(t) }) as any);
}
