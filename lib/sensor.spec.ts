import { expect } from '~/tests';
import { Sensor, Subscriber } from './sensor';

import { stub } from 'sinon';

describe('Sensor', () => {
	it('only starts execution once subscribers have been added', () => {
		const next = stub();
		const triggered = stub();

		const sensor = Sensor.of(async (subscriber: Subscriber<number>) => {
			triggered();
			subscriber.next((_) => 123);
		});

		expect(triggered).to.not.have.been.called;

		sensor.subscribe(next);

		expect(next).to.have.been.called;
		expect(triggered).to.have.been.called;
	});

	it('calls the subscriber function with the new value', async () => {
		const sensor = Sensor.of(async (subscriber: Subscriber<number>) => {
			subscriber.next((_) => 123);
		});

		const result = stub();
		sensor.subscribe((next: (s: number) => number) => {
			result(next(0));
		});

		// Wait a second for the sensor to finish
		// await sensor.wait(1000);

		expect(result).to.have.been.calledWith(123);
	});
});
