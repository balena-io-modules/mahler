import { Lens } from './lens';
import type { PathType } from './path';
import { Path } from './path';
import type { Ref } from './ref';
import { View } from './view';
import type { LensArgs } from './lens';

import type { Subscribable } from './observable';
import { Observable } from './observable';

/**
 * A Sensor function for type T is a function that returns a generator
 * that yields values of type T
 */
export type SensorFn<T, P extends PathType = '/'> = (
	args: LensArgs<T, P>,
) =>
	| AsyncGenerator<Lens<T, P>, never | void | Lens<T, P>, void>
	| Generator<Lens<T, P>, never | void, void | undefined>;

/**
 * A sensor receives a reference to a global state and
 * returns a subscribable that allows to observe changes
 * to the state returned by the sensor operation.
 */
export type Sensor<T, P extends PathType = '/'> =
	unknown extends Lens<T, P>
		? // Default to the version with path if the lens cannot be resolved
			{ (s: Ref<T>, path: PathType): Subscribable<T>; lens: Path<P> }
		: // Otherwise add a path if lens arguments are not empty
			LensArgs<T, P> extends Record<string, never>
			? { (s: Ref<T>): Subscribable<T>; lens: Path<P> }
			: { (s: Ref<T>, path: PathType): Subscribable<T>; lens: Path<P> };

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
		function (s: Ref<TState>, path: PathType = lens) {
			const refPath = Path.from(path);
			const args = Lens.args(lensPath, refPath) as LensArgs<TState, TPath>;
			const view = View.from(s, refPath);

			return Observable.from(sensor(args)).map((value) => {
				// For each value emmited by the sensor
				// we update the view and return the updated state
				// to the subscriber
				view._ = value;

				// We need to return a copy of the state here, otherwise
				// subscribers would be able to change the behavior of the
				// agent or other subscribers
				return structuredClone(s._);
			});
		},
		{ lens: lensPath },
	) as Sensor<TState, TPath>;
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
