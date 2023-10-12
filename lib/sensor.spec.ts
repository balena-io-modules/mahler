import { expect } from '~/test-utils';
import { Sensor } from './sensor';
import { Ref } from './ref';
import { stub } from 'sinon';
import { setTimeout } from 'timers/promises';

describe('Sensor', () => {
	it('only starts execution once subscribers have been added', async () => {
		const read = stub();
		const sensor = Sensor.from<number>(function* () {
			read();
			yield 123;
		});

		const state = Ref.of(0);

		// The sensor function should not be called before a subscriber is added
		expect(read).to.not.have.been.called;

		// Add a subscriber
		const next = stub();
		sensor(state).subscribe(next);

		// We need to wait a bit so the async generator
		// can yield a value
		await setTimeout(10);

		// Only now the sensor function should be called
		expect(read).to.have.been.called;
		expect(next).to.have.been.calledWith(123);
		expect(state._).to.equal(123);
	});

	it('allows defining a value using lenses', async () => {
		type Heater = { temperature: number; on: boolean };
		const sensor = Sensor.of<Heater>().from({
			lens: '/temperature',
			sensor: async function* () {
				yield 20;
				yield 23;
			},
		});

		const state = Ref.of({ temperature: 0, on: false });

		const next = stub();
		sensor(state).subscribe(next);

		await setTimeout(10);

		expect(next).to.have.been.calledWith({ temperature: 20, on: false });
		expect(next).to.have.been.calledWith({ temperature: 23, on: false });
		expect(state._.temperature).to.equal(23);
	});
});
