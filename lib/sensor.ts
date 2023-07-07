import { Observable, Observer } from './observable';

export { Subscription } from './observable';

export type Sensor<T> = Observable<(s: T) => T>;
export type Subscriber<T> = Observer<(s: T) => T>;

export const Sensor = {
	of: <T>(
		sensor: (subscriber: Subscriber<T>) => void | Promise<void>,
	): Sensor<T> => Observable.of(sensor),
};
