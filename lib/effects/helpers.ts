import { Effect, IO } from './effect';

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

/**
 * Creates a new IO effect from a async and sync
 * functions.
 *
 * If no sync function is used, then the identity function
 * will be used as the sync part.
 */
export function bindIO<T>(
	fa: (t: T) => Promise<T>,
	fs: (t: T) => T = (t: T) => t,
): (et: Effect<T>) => Effect<T> {
	return bind((t) => IO(async () => fa(t), fs(t)));
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
	return bind((t) => (pred(t) ? f(t) : Effect.of(t)));
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
	return bind((t) => eu.map((u) => ({ ...t, [key]: u })));
}
