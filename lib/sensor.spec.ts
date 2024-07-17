import { expect } from '~/test-utils';
import { Sensor } from './sensor';
import { stub } from 'sinon';
import { setTimeout } from 'timers/promises';
import { Observable } from './observable';

describe('Sensor', () => {
	it('only starts execution once subscribers have been added', async () => {
		const read = stub();
		const sensor = Sensor.from<number>(function* () {
			read();
			yield 123;
		});

		// The sensor function should not be called before a subscriber is added
		expect(read).to.not.have.been.called;

		// Add a subscriber
		const next = stub();
		sensor().subscribe(next);

		// We need to wait a bit so the async generator
		// can yield a value
		await setTimeout(10);

		// Only now the sensor function should be called
		expect(read).to.have.been.called;
		expect(next).to.have.been.calledWith({
			op: 'update',
			path: '/',
			target: 123,
		});
	});

	it('allows reporting on a value using lenses', async () => {
		type Heater = { temperature: number; on: boolean };
		const sensor = Sensor.of<Heater>().from({
			lens: '/temperature',
			sensor: function* () {
				yield 20;
				yield 23;
			},
		});

		const next = stub();
		sensor().subscribe(next);

		await setTimeout(10);

		expect(next).to.have.been.calledWith({
			op: 'update',
			path: '/temperature',
			target: 20,
		});
		expect(next).to.have.been.calledWith({
			op: 'update',
			path: '/temperature',
			target: 23,
		});
	});

	it('allows reporting on a value using observable', async () => {
		type Heater = { temperature: number; on: boolean };
		const sensor = Sensor.of<Heater>().from({
			lens: '/temperature',
			sensor: () => Observable.from([20, 23]),
		});

		const next = stub();
		sensor().subscribe(next);

		await setTimeout(10);

		expect(next).to.have.been.calledWith({
			op: 'update',
			path: '/temperature',
			target: 20,
		});
		expect(next).to.have.been.calledWith({
			op: 'update',
			path: '/temperature',
			target: 23,
		});
	});

	it('allows reporting on a value using observables and lenses', async () => {
		type Heater = { temperature: { [room: string]: number }; on: boolean };
		const sensor = Sensor.of<Heater>().from({
			lens: '/temperature/:room',
			sensor: ({ room }) =>
				Observable.from([
					{ room: 'office', temp: 20 },
					{ room: 'patio', temp: 30 },
					{ room: 'office', temp: 23 },
				])
					.filter(({ room: r }) => room === r)
					.map(({ temp }) => temp),
		});

		const next = stub();
		const nextOther = stub();
		sensor('/temperature/office').subscribe(next);
		sensor('/temperature/patio').subscribe(nextOther);

		// A sensor for an uninitialized path should not throw
		expect(() => sensor('/temperature/bedroom')).to.not.throw;

		await setTimeout(10);

		expect(next).to.have.been.calledTwice;
		expect(next).to.have.been.calledWith({
			op: 'update',
			path: '/temperature/office',
			target: 20,
		});
		expect(next).to.have.been.calledWith({
			op: 'update',
			path: '/temperature/office',
			target: 23,
		});
		expect(nextOther).to.have.been.calledOnceWith({
			op: 'update',
			path: '/temperature/patio',
			target: 30,
		});
	});

	it('allows reporting on a value using lenses with args', async () => {
		type Heater = { temperature: { [room: string]: number }; on: boolean };
		const sensor = Sensor.of<Heater>().from({
			lens: '/temperature/:room',
			sensor: async function* ({ room }) {
				if (room === 'office') {
					// First result
					yield 20;
					await setTimeout(15);
					// Third result
					yield 23;
				} else {
					await setTimeout(10);
					// Second result
					yield 30;
				}
			},
		});

		const next = stub();
		const nextOther = stub();
		sensor('/temperature/office').subscribe(next);
		sensor('/temperature/patio').subscribe(nextOther);

		// A sensor for an uninitialized path should throw
		expect(() => sensor('/temperature/bedroom')).to.throw;

		await setTimeout(20);

		expect(next).to.have.been.calledTwice;
		expect(next).to.have.been.calledWith({
			op: 'update',
			path: '/temperature/office',
			target: 20,
		});
		expect(next).to.have.been.calledWith({
			op: 'update',
			path: '/temperature/office',
			target: 23,
		});
		expect(nextOther).to.have.been.calledOnceWith({
			op: 'update',
			path: '/temperature/patio',
			target: 30,
		});
	});
});
