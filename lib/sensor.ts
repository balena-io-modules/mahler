import { Lens } from './lens';
import type { PathType } from './path';
import { Path } from './path';
import type { LensArgs } from './lens';
import type { UpdateOperation } from './operation';

import type { Subscribable } from './observable';
import { Observable } from './observable';

/**
 * A Sensor function for type T is a function that returns a generator
 * that yields values of type T
 */
type SensorFn<T, P extends PathType = '/'> = (
	args: LensArgs<T, P>,
) =>
	| AsyncGenerator<Lens<T, P>, never | void | Lens<T, P>, void>
	| Generator<Lens<T, P>, never | void, void | undefined>
	| Subscribable<Lens<T, P>>;

type SensorOutput<T, P extends PathType = '/'> = Subscribable<
	UpdateOperation<T, P>
>;

/**
 * A sensor receives a reference to a global state and
 * returns a subscribable that allows to observe changes
 * to the state returned by the sensor operation.
 */
export type Sensor<T, P extends PathType = '/'> =
	unknown extends Lens<T, P>
		? // Default to the version with path if the lens cannot be resolved
			{ (path: PathType): SensorOutput<T, P>; lens: Path<P> }
		: // Otherwise add a path if lens arguments are not empty
			LensArgs<T, P> extends Record<string, never>
			? { (): SensorOutput<T, P>; lens: Path<P> }
			: { (path: PathType): SensorOutput<T, P>; lens: Path<P> };

/**
 * The sensor constructor properties
 */
export interface SensorProps<TState, TPath extends PathType = '/'> {
	/**
	 * A lens to indicate what part of the state the sensor
	 * will update as it runs. Unlike task lense, sensor lenses
	 * cannot have properties for now
	 */
	lens: TPath;

	/**
	 * A sensor function. The function returns a generator that yields
	 * values of the type of the lens
	 */
	sensor: SensorFn<TState, TPath>;
}

/**
 * Construct a new sensor
 *
 * This takes an argument either a `SensorProps` object, or just a function.
 *
 * If a function is passed, it is assumed to be the `sensor` function, and
 * the `lens` is assumed to be the root of the state.
 */
function from<TState, TPath extends PathType = '/'>(
	input: SensorFn<TState, TPath> | Partial<SensorProps<TState, TPath>>,
): Sensor<TState, TPath> {
	const {
		lens = '/' as TPath,
		sensor = function* () {
			/* noop */
		},
	} = typeof input === 'function' ? { sensor: input } : input;
	const lensPath = Path.from(lens);
	return Object.assign(
		function (path: PathType = lens) {
			const refPath = Path.from(path);
			const args = Lens.args(lensPath, refPath) as LensArgs<TState, TPath>;

			return Observable.from(sensor(args)).map((target) => ({
				op: 'update',
				path,
				target,
			}));
		},
		{ lens: lensPath },
	);
}

/**
 * A sensor builder interface allows to build multiple sensors of
 * the same type.
 */
interface SensorBuilder<T> {
	from<P extends PathType = '/'>(t: SensorProps<T, P>): Sensor<T, P>;
}

function of<T>(): SensorBuilder<T> {
	return {
		from,
	};
}

export const Sensor = {
	of,
	from,
};
