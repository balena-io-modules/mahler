import { Observable, Observer } from './observable';
export { Subscribed } from './observable';

export type Sensor<T> = Observable<(s: T) => T>;
export type Subscriber<T> = Observer<(s: T) => T>;

export const Sensor = {
	of: <T>(sensor: (l: Subscriber<T>) => void | Promise<void>) =>
		Observable.of(sensor),
};
