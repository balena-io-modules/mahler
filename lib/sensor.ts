import { Lens, View } from './lens';
import { Path } from './path';
import { Ref } from './ref';

import { Observable, Subscribable } from './observable';

export type SensorFn<T> = () =>
	| AsyncGenerator<T, never | void | T, void>
	| Generator<T, never | void, void | undefined>;

/**
 * A sensor builds a subscribable to state changes
 * given a reference to a shared state
 */
export type Sensor<T> = (s: Ref<T>) => Subscribable<T>;

export interface SensorProps<T, P extends Path = '/'> {
	lens: P;
	sensor: SensorFn<Lens<T, P>>;
}

function from<T, P extends Path = '/'>(
	input: SensorFn<Lens<T, P>> | Partial<SensorProps<T, P>>,
): Sensor<T> {
	const {
		lens = '/' as P,
		sensor = function* () {
			/* noop */
		},
	} = typeof input === 'function' ? { sensor: input } : input;
	return function (s) {
		const view = View.from(s, lens);

		// TODO: we might want to create a subject so we can propagate
		// the values of the sensor to multiple observers
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

interface SensorBuilder<T> {
	from<P extends Path = '/'>(t: SensorProps<T, P>): Sensor<T>;
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
