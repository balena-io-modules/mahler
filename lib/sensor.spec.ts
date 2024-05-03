import { expect } from '~/test-utils';
import { Sensor } from './sensor';
import { Ref } from './ref';
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

	it('allows reporting on a value using lenses', async () => {
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

	it('allows reporting on a value using observable', async () => {
		type Heater = { temperature: number; on: boolean };
		const sensor = Sensor.of<Heater>().from({
			lens: '/temperature',
			sensor: () => Observable.from([20, 23]),
		});

		const state = Ref.of({ temperature: 0, on: false });

		const next = stub();
		sensor(state).subscribe(next);

		await setTimeout(10);

		expect(next).to.have.been.calledWith({ temperature: 20, on: false });
		expect(next).to.have.been.calledWith({ temperature: 23, on: false });
		expect(state._.temperature).to.equal(23);
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

		const state: Ref<Heater> = Ref.of({
			temperature: { office: 0, patio: 0 },
			on: false,
		});

		const next = stub();
		const nextOther = stub();
		sensor(state, '/temperature/office').subscribe(next);
		sensor(state, '/temperature/patio').subscribe(nextOther);

		// A sensor for an uninitialized path should not throw
		expect(() => sensor(state, '/temperature/bedroom')).to.not.throw;

		await setTimeout(10);

		expect(next.getCalls().length).to.equal(2);
		expect(next).to.have.been.calledWith({
			temperature: { office: 20, patio: 0 },
			on: false,
		});
		expect(next).to.have.been.calledWith({
			temperature: { office: 23, patio: 30 },
			on: false,
		});
		expect(nextOther).to.have.been.calledOnceWith({
			temperature: { office: 20, patio: 30 },
			on: false,
		});
		expect(state._.temperature.office).to.equal(23);
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

		const state: Ref<Heater> = Ref.of({
			temperature: { office: 0, patio: 0 },
			on: false,
		});

		const next = stub();
		const nextOther = stub();
		sensor(state, '/temperature/office').subscribe(next);
		sensor(state, '/temperature/patio').subscribe(nextOther);

		// A sensor for an uninitialized path should throw
		expect(() => sensor(state, '/temperature/bedroom')).to.throw;

		await setTimeout(20);

		expect(next.getCalls().length).to.equal(2);
		expect(next).to.have.been.calledWith({
			temperature: { office: 20, patio: 0 },
			on: false,
		});
		expect(next).to.have.been.calledWith({
			temperature: { office: 23, patio: 30 },
			on: false,
		});
		expect(nextOther).to.have.been.calledOnceWith({
			temperature: { office: 20, patio: 30 },
			on: false,
		});
		expect(state._.temperature.office).to.equal(23);
	});
});
