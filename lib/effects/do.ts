import { Effect } from './effect';
import { pipe, Fn } from './pipe';

type EfectFn<A, B> = Fn<Effect<A>, Effect<B>>;

/**
 * Chain functions from left to right, returning an Effect
 *
 * Returns a new function that receives the same arguments as first
 * function and returns the result of the last function.
 */
export function doPipe<A>(a: A): Effect<A>;
export function doPipe<A, B>(a: A, fa: EfectFn<A, B>): Effect<B>;
// This repetition is necessary unfortunately to ensure that typescript can
// infer the correct types for the arguments
export function doPipe<A, B, C>(
	a: A,
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
): Effect<C>;
export function doPipe<A, B, C, D>(
	a: A,
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
): Effect<D>;
export function doPipe<A, B, C, D, E>(
	a: A,
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
): Effect<E>;
export function doPipe<A, B, C, D, E, F>(
	a: A,
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
): Effect<F>;
export function doPipe<A, B, C, D, E, F, G>(
	a: A,
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
): Effect<G>;
export function doPipe<A, B, C, D, E, F, G, H>(
	a: A,
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
): Effect<H>;
export function doPipe<A, B, C, D, E, F, G, H, I>(
	a: A,
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
): Effect<I>;
export function doPipe<A, B, C, D, E, F, G, H, I, J>(
	a: A,
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
): Effect<J>;
export function doPipe<A, B, C, D, E, F, G, H, I, J, K>(
	a: A,
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
	fk: EfectFn<C, K>,
): Effect<K>;
export function doPipe<A, B, C, D, E, F, G, H, I, J, K, L>(
	a: A,
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
	fk: EfectFn<C, K>,
	fl: EfectFn<C, L>,
): Effect<L>;
export function doPipe<A, B, C, D, E, F, G, H, I, J, K, L, M>(
	a: A,
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
	fk: EfectFn<C, K>,
	fl: EfectFn<C, L>,
	fm: EfectFn<C, M>,
): Effect<M>;
export function doPipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N>(
	a: A,
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
	fk: EfectFn<C, K>,
	fl: EfectFn<C, L>,
	fm: EfectFn<C, M>,
	fn: EfectFn<C, N>,
): Effect<N>;
export function doPipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O>(
	a: A,
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
	fk: EfectFn<C, K>,
	fl: EfectFn<C, L>,
	fm: EfectFn<C, M>,
	fn: EfectFn<C, N>,
	fo: EfectFn<C, O>,
): Effect<O>;
export function doPipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P>(
	a: A,
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
	fk: EfectFn<C, K>,
	fl: EfectFn<C, L>,
	fm: EfectFn<C, M>,
	fn: EfectFn<C, N>,
	fo: EfectFn<C, O>,
	fp: EfectFn<C, P>,
): Effect<P>;
export function doPipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q>(
	a: A,
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
	fk: EfectFn<C, K>,
	fl: EfectFn<C, L>,
	fm: EfectFn<C, M>,
	fn: EfectFn<C, N>,
	fo: EfectFn<C, O>,
	fp: EfectFn<C, P>,
	fq: EfectFn<C, Q>,
): Effect<Q>;
export function doPipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R>(
	a: A,
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
	fk: EfectFn<C, K>,
	fl: EfectFn<C, L>,
	fm: EfectFn<C, M>,
	fn: EfectFn<C, N>,
	fo: EfectFn<C, O>,
	fp: EfectFn<C, P>,
	fq: EfectFn<C, Q>,
	fr: EfectFn<C, R>,
): Effect<R>;
export function doPipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S>(
	a: A,
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
	fk: EfectFn<C, K>,
	fl: EfectFn<C, L>,
	fm: EfectFn<C, M>,
	fn: EfectFn<C, N>,
	fo: EfectFn<C, O>,
	fp: EfectFn<C, P>,
	fq: EfectFn<C, Q>,
	fr: EfectFn<C, R>,
	fs: EfectFn<C, S>,
): Effect<S>;
export function doPipe<
	A,
	B,
	C,
	D,
	E,
	F,
	G,
	H,
	I,
	J,
	K,
	L,
	M,
	N,
	O,
	P,
	Q,
	R,
	S,
	T,
>(
	a: A,
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
	fk: EfectFn<C, K>,
	fl: EfectFn<C, L>,
	fm: EfectFn<C, M>,
	fn: EfectFn<C, N>,
	fo: EfectFn<C, O>,
	fp: EfectFn<C, P>,
	fq: EfectFn<C, Q>,
	fr: EfectFn<C, R>,
	fs: EfectFn<C, S>,
	ft: EfectFn<C, T>,
): Effect<T>;
export function doPipe<
	A,
	B,
	C,
	D,
	E,
	F,
	G,
	H,
	I,
	J,
	K,
	L,
	M,
	N,
	O,
	P,
	Q,
	R,
	S,
	T,
	U,
>(
	a: A,
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
	fk: EfectFn<C, K>,
	fl: EfectFn<C, L>,
	fm: EfectFn<C, M>,
	fn: EfectFn<C, N>,
	fo: EfectFn<C, O>,
	fp: EfectFn<C, P>,
	fq: EfectFn<C, Q>,
	fr: EfectFn<C, R>,
	fs: EfectFn<C, S>,
	ft: EfectFn<C, T>,
	fu: EfectFn<C, U>,
): Effect<U>;
export function doPipe<
	A,
	B,
	C,
	D,
	E,
	F,
	G,
	H,
	I,
	J,
	K,
	L,
	M,
	N,
	O,
	P,
	Q,
	R,
	S,
	T,
	U,
	V,
>(
	a: A,
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
	fk: EfectFn<C, K>,
	fl: EfectFn<C, L>,
	fm: EfectFn<C, M>,
	fn: EfectFn<C, N>,
	fo: EfectFn<C, O>,
	fp: EfectFn<C, P>,
	fq: EfectFn<C, Q>,
	fr: EfectFn<C, R>,
	fs: EfectFn<C, S>,
	ft: EfectFn<C, T>,
	fu: EfectFn<C, U>,
	fv: EfectFn<C, V>,
): Effect<V>;
export function doPipe(a: any, ...fns: Array<EfectFn<any, any>>) {
	return (pipe as any)(a, Effect.of, ...fns);
}

/**
 * Chain functions from left to right
 *
 * Returns a new function that receives the same arguments as first
 * function and returns the result of the last function.
 */
export function doFlow<A, B>(fa: EfectFn<A, B>): Fn<A, Effect<B>>;
// This repetition is necessary unfortunately to ensure that typescript can
// infer the correct types for the arguments
export function doFlow<A, B, C>(
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
): Fn<A, Effect<C>>;
export function doFlow<A, B, C, D>(
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
): Fn<A, Effect<D>>;
export function doFlow<A, B, C, D, E>(
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
): Fn<A, Effect<E>>;
export function doFlow<A, B, C, D, E, F>(
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
): Fn<A, Effect<F>>;
export function doFlow<A, B, C, D, E, F, G>(
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
): Fn<A, Effect<G>>;
export function doFlow<A, B, C, D, E, F, G, H>(
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
): Fn<A, Effect<H>>;
export function doFlow<A, B, C, D, E, F, G, H, I>(
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
): Fn<A, Effect<I>>;
export function doFlow<A, B, C, D, E, F, G, H, I, J>(
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
): Fn<A, Effect<J>>;
export function doFlow<A, B, C, D, E, F, G, H, I, J, K>(
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
	fk: EfectFn<C, K>,
): Fn<A, Effect<K>>;
export function doFlow<A, B, C, D, E, F, G, H, I, J, K, L>(
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
	fk: EfectFn<C, K>,
	fl: EfectFn<C, L>,
): Fn<A, Effect<L>>;
export function doFlow<A, B, C, D, E, F, G, H, I, J, K, L, M>(
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
	fk: EfectFn<C, K>,
	fl: EfectFn<C, L>,
	fm: EfectFn<C, M>,
): Fn<A, Effect<M>>;
export function doFlow<A, B, C, D, E, F, G, H, I, J, K, L, M, N>(
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
	fk: EfectFn<C, K>,
	fl: EfectFn<C, L>,
	fm: EfectFn<C, M>,
	fn: EfectFn<C, N>,
): Fn<A, Effect<N>>;
export function doFlow<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O>(
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
	fk: EfectFn<C, K>,
	fl: EfectFn<C, L>,
	fm: EfectFn<C, M>,
	fn: EfectFn<C, N>,
	fo: EfectFn<C, O>,
): Fn<A, Effect<O>>;
export function doFlow<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P>(
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
	fk: EfectFn<C, K>,
	fl: EfectFn<C, L>,
	fm: EfectFn<C, M>,
	fn: EfectFn<C, N>,
	fo: EfectFn<C, O>,
	fp: EfectFn<C, P>,
): Fn<A, Effect<P>>;
export function doFlow<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q>(
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
	fk: EfectFn<C, K>,
	fl: EfectFn<C, L>,
	fm: EfectFn<C, M>,
	fn: EfectFn<C, N>,
	fo: EfectFn<C, O>,
	fp: EfectFn<C, P>,
	fq: EfectFn<C, Q>,
): Fn<A, Effect<Q>>;
export function doFlow<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R>(
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
	fk: EfectFn<C, K>,
	fl: EfectFn<C, L>,
	fm: EfectFn<C, M>,
	fn: EfectFn<C, N>,
	fo: EfectFn<C, O>,
	fp: EfectFn<C, P>,
	fq: EfectFn<C, Q>,
	fr: EfectFn<C, R>,
): Fn<A, Effect<R>>;
export function doFlow<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S>(
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
	fk: EfectFn<C, K>,
	fl: EfectFn<C, L>,
	fm: EfectFn<C, M>,
	fn: EfectFn<C, N>,
	fo: EfectFn<C, O>,
	fp: EfectFn<C, P>,
	fq: EfectFn<C, Q>,
	fr: EfectFn<C, R>,
	fs: EfectFn<C, S>,
): Fn<A, Effect<S>>;
export function doFlow<
	A,
	B,
	C,
	D,
	E,
	F,
	G,
	H,
	I,
	J,
	K,
	L,
	M,
	N,
	O,
	P,
	Q,
	R,
	S,
	T,
>(
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
	fk: EfectFn<C, K>,
	fl: EfectFn<C, L>,
	fm: EfectFn<C, M>,
	fn: EfectFn<C, N>,
	fo: EfectFn<C, O>,
	fp: EfectFn<C, P>,
	fq: EfectFn<C, Q>,
	fr: EfectFn<C, R>,
	fs: EfectFn<C, S>,
	ft: EfectFn<C, T>,
): Fn<A, Effect<T>>;
export function doFlow<
	A,
	B,
	C,
	D,
	E,
	F,
	G,
	H,
	I,
	J,
	K,
	L,
	M,
	N,
	O,
	P,
	Q,
	R,
	S,
	T,
	U,
>(
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
	fk: EfectFn<C, K>,
	fl: EfectFn<C, L>,
	fm: EfectFn<C, M>,
	fn: EfectFn<C, N>,
	fo: EfectFn<C, O>,
	fp: EfectFn<C, P>,
	fq: EfectFn<C, Q>,
	fr: EfectFn<C, R>,
	fs: EfectFn<C, S>,
	ft: EfectFn<C, T>,
	fu: EfectFn<C, U>,
): Fn<A, Effect<U>>;
export function doFlow<
	A,
	B,
	C,
	D,
	E,
	F,
	G,
	H,
	I,
	J,
	K,
	L,
	M,
	N,
	O,
	P,
	Q,
	R,
	S,
	T,
	U,
	V,
>(
	fa: EfectFn<A, B>,
	fb: EfectFn<B, C>,
	fc: EfectFn<C, D>,
	fd: EfectFn<C, E>,
	fe: EfectFn<C, F>,
	fg: EfectFn<C, G>,
	fh: EfectFn<C, H>,
	fi: EfectFn<C, I>,
	fj: EfectFn<C, J>,
	fk: EfectFn<C, K>,
	fl: EfectFn<C, L>,
	fm: EfectFn<C, M>,
	fn: EfectFn<C, N>,
	fo: EfectFn<C, O>,
	fp: EfectFn<C, P>,
	fq: EfectFn<C, Q>,
	fr: EfectFn<C, R>,
	fs: EfectFn<C, S>,
	ft: EfectFn<C, T>,
	fu: EfectFn<C, U>,
	fv: EfectFn<C, V>,
): Fn<A, Effect<V>>;
export function doFlow(...fns: Array<EfectFn<any, any>>) {
	return (a: any) => (pipe as any)(a, Effect.of, ...fns);
}

export const then = doFlow;