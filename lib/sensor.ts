import { Observable, Observer, Subject } from './observable';

export { Subscription } from './observable';

type SensorOutput<T> = (s: T) => T;
export type Sensor<T> = Observable<SensorOutput<T>>;
export type Subscriber<T> = Observer<SensorOutput<T>>;

export const Sensor = {
	of: <T>(
		sensor: (subscriber: Subscriber<T>) => void | Promise<void>,
	): Sensor<T> => {
		const subject = new Subject<SensorOutput<T>>();

		let running = false;
		return Observable.from({
			subscribe(next) {
				const subscription = subject.subscribe(next);

				// Now that we have subscribers we start the observable
				if (!running) {
					Promise.resolve(sensor(subject))
						.then(() => {
							// Notify the proxy of the observable completion
							subject.complete();
						})
						.catch((e) => {
							// Notify subscriber of uncaught errors on the observable
							subject.error(e);
						})
						.finally(() => {
							// The observable will restart when a new subscriber is added
							running = false;
						});
					running = true;
				}

				return subscription;
			},
		});
	},
};
