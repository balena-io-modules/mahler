import { expect } from '~/tests';
import { Sensor, Subscriber } from './sensor';
import { promisify } from 'util';

import { stub } from 'sinon';

const delay = promisify(setTimeout);

describe('Sensor', () => {
	it('only starts execution once subscribers have been added', () => {
		const read = stub();
		const sensor = Sensor.of((subscriber: Subscriber<void>) => {
			read();
			subscriber.next(() => void 0);
		});

		// The sensor function should not be called before a subscriber is added
		expect(read).to.not.have.been.called;

		// Add a subscriber
		const next = stub();
		sensor.subscribe(next);

		// Only now the sensor function should be called
		expect(read).to.have.been.called;
		expect(next).to.have.been.called;
	});

	it('calls the subscriber function with the new value', async () => {
		const sensor = Sensor.of((subscriber: Subscriber<number>) => {
			subscriber.next((x) => x + 123);
		});

		const result = stub();
		sensor.subscribe((next: (s: number) => number) => {
			result(next(0));
		});

		expect(result).to.have.been.calledWith(123);
	});

	it('allows waiting for the sensor to provide a value', async () => {
		const sensor = Sensor.of(async (subscriber: Subscriber<number>) => {
			await delay(1000);
			subscriber.next((x) => x + 123);
		});

		const result = stub();
		sensor.subscribe((next: (s: number) => number) => {
			result(next(0));
		});

		await expect(sensor.wait(100)).to.be.rejected;
		await expect(sensor.wait(1000)).to.be.fulfilled;
		expect(result).to.have.been.calledWith(123);
	});
});
