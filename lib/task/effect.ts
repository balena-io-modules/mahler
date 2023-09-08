import { Path } from '../path';
import { Pointer } from '../pointer';

interface AddOperation<T, P extends Path> {
	op: 'add';
	path: P;
	value: Pointer<T, P>;
}
interface RemoveOperation<P extends Path> {
	op: 'remove';
	path: P;
}
interface ReplaceOperation<T, P extends Path> {
	op: 'replace';
	path: P;
	value: Pointer<T, P>;
}
export type Operation<T = any, P extends Path = '/'> =
	| AddOperation<T, P>
	| RemoveOperation<P>
	| ReplaceOperation<T, P>;

type Tuple<T extends any[]> = T extends [infer THead, ...infer TTail]
	? [THead, ...Tuple<TTail>]
	: T;

export type EffectFn<T, A extends any[]> = (
	s: T,
	...args: Tuple<A>
) => void | Promise<void>;

interface AsyncEffect<T, A extends any[]> {
	readonly changes: Array<Operation<T, any>>;
	(s: T, ...args: Tuple<A>): Promise<void>;
}
interface PureEffect<T, A extends any[]> {
	readonly changes: Array<Operation<T, any>>;
	(s: T, ...args: Tuple<A>): void;
}
export type Effect<T, A extends any[]> = AsyncEffect<T, A> | PureEffect<T, A>;

export type WithIO = <T>(fn: () => Promise<T>, fallback: T) => T | Promise<T>;

function set<T extends object>(
	target: T,
	prop: string | symbol,
	value: any,
	changes: Array<Operation<T, any>>,
) {
	if (prop in target) {
		changes.push({
			op: 'replace',
			path: `/${prop as any}`,
			value: value as any,
		});
	} else {
		changes.push({ op: 'add', path: `/${prop as any}`, value: value as any });
	}
	// If value is a promise then all this will be called in the then() callback
	return Reflect.set(target, prop, value);
}

function of<T extends object, A extends any[]>(
	fn: (s: T, ...args: Tuple<A>) => Promise<void>,
): AsyncEffect<T, A>;
function of<T extends object, A extends any[]>(
	fn: (s: T, ...args: Tuple<A>) => void,
): PureEffect<T, A>;
function of<T extends object, A extends any[]>(
	fn: EffectFn<T, A>,
): Effect<T, A> {
	const changes: Array<Operation<T, any>> = [];
	const self = Object.assign(
		function (s: T, ...args: Tuple<A>) {
			self.changes = [];
			s = new Proxy(structuredClone(s), {
				set(target, prop, value) {
					return set(target, prop, value, self.changes);
				},
			});
			return fn(s, ...args);
		},
		{ changes },
	);
	return self;
}

export const Effect = {
	of,
};

export function WithoutIO<T>(_: () => Promise<T>, d: T): T {
	return d;
}

// eslint-disable-next-line
export async function WithIO<T>(f: () => Promise<T>, _: T): Promise<T> {
	return await f();
}
