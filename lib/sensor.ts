import { Lens } from './lens';
import { Path, PathString } from './path';
import { Ref } from './ref';
import { View } from './view';

import { Observable, Subscribable } from './observable';

/**
 * A Sensor function for type T is a function that returns a generator
 * that yields values of type T
 */
export type SensorFn<T> = () =>
	| AsyncGenerator<T, never | void | T, void>
	| Generator<T, never | void, void | undefined>;

/**
 * A sensor receives a reference to a global state and
 * returns a subscribable that allows to observe changes
 * to the state returned by the sensor operation.
 */
export type Sensor<T> = (s: Ref<T>) => Subscribable<T>;

/**
 * The sensor constructor properties
 */
export interface SensorProps<T, P extends PathString = '/'> {
	/**
	 * A lens to indicate what part of the state the sensor
	 * will update as it runs. Unlike task lense, sensor lenses
	 * cannot have properties for now
	 */
	lens: P;

	/**
	 * A sensor function. The function returns a generator that yields
	 * values of the type of the lens
	 */
	sensor: SensorFn<Lens<T, P>>;
}

/**
 * Construct a new sensor
 *
 * This takes an argument either a `SensorProps` object, or just a function.
 *
 * If a function is passed, it is assumed to be the `sensor` function, and
 * the `lens` is assumed to be the root of the state.
 */
function from<T, P extends PathString = '/'>(
	input: SensorFn<Lens<T, P>> | Partial<SensorProps<T, P>>,
): Sensor<T> {
	const {
		lens = '/' as P,
		sensor = function* () {
			/* noop */
		},
	} = typeof input === 'function' ? { sensor: input } : input;
	return function (s) {
		const view = View.from(s, Path.from(lens));

		return Observable.from(sensor()).map((value) => {
			// For each value emmited by the sensor
			// we update the view and return the updated state
			// to the subscriber
			view._ = value;

			// We need to return a copy of the state here, otherwise
			// subscribers would be able to change the behavior of the
			// agent or other subscribers
			return structuredClone(s._);
		});
	};
}

/**
 * A sensor builder interface allows to build multiple sensors of
 * the same type.
 */
interface SensorBuilder<T> {
	from<P extends PathString = '/'>(t: SensorProps<T, P>): Sensor<T>;
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
