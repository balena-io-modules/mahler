import { expect, logger } from '~/test-utils';
import { Agent } from './agent';
import { NoAction, Task } from './task';
import { Sensor } from './sensor';

import { stub } from 'sinon';

import { setTimeout } from 'timers/promises';

describe('Agent', () => {
	describe('basic operations', () => {
		it('it should succeed if state has already been reached', async () => {
			const agent = Agent.from({ initial: 0, opts: { logger } });
			agent.seek(0);
			await expect(agent.wait()).to.eventually.deep.equal({
				success: true,
				state: 0,
			});
			agent.stop();
		});

		it('it continues looking for plan unless max retries is set', async () => {
			const agent = Agent.from({
				initial: {},
				opts: { minWaitMs: 10, logger },
			});
			agent.seek({ never: true });
			await expect(agent.wait(1000)).to.be.rejected;
			agent.stop();
		});

		it('it continues looking for plan unless max retries is set', async () => {
			const agent = Agent.from({
				initial: {},
				opts: { minWaitMs: 10, maxRetries: 2, logger },
			});
			agent.seek({ never: true });
			await expect(agent.wait(1000)).to.be.fulfilled;
			agent.stop();
		});

		it('it allows to subscribe to the agent state', async () => {
			const inc = Task.from<number>({
				condition: (state, { target }) => state < target,
				effect: (state) => ++state._,
				description: 'increment',
			});
			const agent = Agent.from({
				initial: 0,
				opts: { logger, minWaitMs: 10 },
				tasks: [inc],
			});

			// Subscribe to the count
			const count: number[] = [];
			agent.subscribe((s) => count.push(s));

			agent.seek(10);

			await expect(agent.wait()).to.eventually.deep.equal({
				success: true,
				state: 10,
			});

			// Intermediate states returned by the observable should be emitted by the agent
			expect(count).to.deep.equal([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
			agent.stop();
		});

		it('allows to use observables as actions', async () => {
			const counter = Task.from<number>({
				condition: (state, { target }) => state < target,
				effect: (state, { target }) => {
					state._ = target;
				},
				action: async (state, { target }) => {
					while (state._ < target) {
						// Each time the state is modified, the agent should emit the new state
						state._++;
						await setTimeout(10);
					}
				},
			});
			const agent = Agent.from({
				initial: 0,
				opts: { logger },
				tasks: [counter],
			});

			// Subscribe to the count
			const count: number[] = [];
			agent.subscribe((s) => count.push(s));

			agent.seek(10);

			await expect(agent.wait()).to.eventually.deep.equal({
				success: true,
				state: 10,
			});

			// Intermediate states returned by the observable should be emitted by the agent
			expect(count).to.deep.equal([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
			agent.stop();
		});

		it('runs parallel plans', async () => {
			type Counters = { [k: string]: number };

			const byOne = Task.of<Counters>().from({
				lens: '/:counterId',
				condition: (counter, { target }) => counter < target,
				effect: (counter) => ++counter._,
				action: async (counter) => {
					await setTimeout(100 * Math.random());
					counter._++;
				},
				description: ({ counterId }) => `${counterId} + 1`,
			});

			const byTwo = Task.of<Counters>().from({
				lens: '/:counterId',
				condition: (counter, { target }) => target - counter > 1,
				method: (_, ctx) => [byOne(ctx), byOne(ctx)],
				description: ({ counterId }) => `increase '${counterId}'`,
			});

			const multiIncrement = Task.from<Counters>({
				condition: (counters, { target }) =>
					Object.keys(counters).some((k) => target[k] - counters[k] > 1),
				method: (counters, { target }) =>
					Object.keys(counters)
						.filter((k) => target[k] - counters[k] > 1)
						.map((k) => byTwo({ counterId: k, target: target[k] })),
				description: `increment counters`,
			});

			const agent = Agent.from({
				initial: { a: 0, b: 0 },
				opts: { logger, minWaitMs: 1 * 1000 },
				tasks: [multiIncrement, byTwo, byOne],
			});

			agent.seek({ a: 3, b: 2 });

			// We wait at most for one cycle to complete, meaning the
			// state is reached immediately and the agent terminates after the
			// first pause
			await expect(agent.wait(1500)).to.eventually.deep.equal({
				success: true,
				state: { a: 3, b: 2 },
			});
			agent.stop();
		});

		it('should reset the state if an action fails', async () => {
			const plusOne = Task.from<number>({
				condition: (state, { target }) => state < target,
				effect: (state) => ++state._,
				action: async (state) => {
					++state._;

					// The action fails after a partial update
					throw new Error('action failed');
				},
				description: '+1',
			});
			const agent = Agent.from({
				initial: 0,
				opts: { logger, maxRetries: 0 },
				tasks: [plusOne],
			});

			agent.seek(1);

			const res = await agent.wait();
			expect(res.success).to.be.false;
			expect(agent.state()).to.equal(0);
			agent.stop();
		});
	});

	it('should reset only the state of the failing branch', async () => {
		type Counters = { a: number; b: number };

		const aPlusOne = Task.of<Counters>().from({
			lens: '/a',
			condition: (state, { target }) => state < target,
			effect: (state) => ++state._,
			description: 'a + 1',
		});
		const bPlusOne = Task.of<Counters>().from({
			lens: '/b',
			condition: (state, { target }) => state < target,
			effect: (state) => ++state._,
			action: async (state) => {
				++state._;

				// The action fails after a partial update
				throw new Error('action failed');
			},
			description: 'b + 1',
		});
		const plusOne = Task.from<Counters>({
			condition: (state, { target }) =>
				state.a < target.a || state.b < target.b,
			method: (state, { target }) => {
				const tasks = [];
				if (state.a < target.a) {
					tasks.push(aPlusOne({ target: target.a }));
				}
				if (state.b < target.b) {
					tasks.push(bPlusOne({ target: target.b }));
				}
				return tasks;
			},
			description: '+1',
		});
		const agent = Agent.from({
			initial: { a: 0, b: 0 },
			opts: { logger, maxRetries: 0 },
			tasks: [plusOne],
		});

		agent.seek({ a: 1, b: 1 });

		const res = await agent.wait();
		expect(res.success).to.be.false;
		expect(agent.state().a).to.equal(1);
		expect(agent.state().b).to.equal(0);
		agent.stop();
	});

	describe('heater', () => {
		type Heater = { roomTemp: number; resistorOn: boolean };

		// This emulates the target state of the heater hardware
		let resistorOn = false;
		const toggleResistorOn = stub().callsFake(() => {
			resistorOn = true;
		});
		const toggleResistorOff = stub().callsFake(() => {
			resistorOn = false;
		});

		const turnOn = Task.of<Heater>().from({
			condition: (state, { target }) =>
				state.roomTemp < target.roomTemp && !state.resistorOn,
			effect: (state, { target }) => {
				// Turning the resistor on does not change the temperature
				// immediately, but the effect is that the temperature eventually
				// will reach that point
				state._.roomTemp = target.roomTemp;
				state._.resistorOn = true;
			},
			action: async (state) => {
				state._.resistorOn = true;
				toggleResistorOn();
			},
			description: 'turn resistor ON',
		});

		const turnOff = Task.of<Heater>().from({
			condition: (state, { target }) =>
				state.roomTemp > target.roomTemp && !!state.resistorOn,
			effect: (state, { target }) => {
				state._.roomTemp = target.roomTemp;
				state._.resistorOn = false;
			},
			action: async (state) => {
				state._.resistorOn = false;
				toggleResistorOff();
			},
			description: 'turn resistor OFF',
		});

		const wait = Task.of<Heater>().from({
			condition: (state, { target }) =>
				// We have not reached the target but the resistor is already off
				(state.roomTemp > target.roomTemp && !state.resistorOn) ||
				// We have not reached the target but the resistor is already on
				(state.roomTemp < target.roomTemp && !!state.resistorOn),
			effect: (state, { target }) => {
				state._.roomTemp = target.roomTemp;
			},
			action: NoAction,
			description: 'wait for temperature to reach target',
		});

		// We wrap the sensor in a function so it doesn't leak to other
		// tests
		const termometer = (roomTemp: number) =>
			Sensor.of<Heater>().from({
				lens: '/roomTemp',
				sensor: async function* () {
					while (true) {
						// The heater is on, so the temperature increases
						if (resistorOn) {
							++roomTemp;
						} else {
							--roomTemp;
						}
						yield roomTemp;
						// Temperature increases/decreases 1 degree every 10ms
						await setTimeout(10);
					}
				},
			});

		it('it should turn on the heater if temperature is below the target', async () => {
			const roomTemp = 10;
			resistorOn = false;
			const agent = Agent.from({
				initial: { roomTemp, resistorOn },
				tasks: [turnOn, turnOff, wait],
				sensors: [termometer(roomTemp)],
				opts: { minWaitMs: 10, logger },
			});
			agent.seek({ roomTemp: 20 });
			await expect(agent.wait(1000)).to.eventually.deep.equal({
				success: true,
				state: { roomTemp: 20, resistorOn: true },
			});
			agent.stop();
		});

		it('it should turn off the heater if temperature is above the target', async () => {
			const roomTemp = 30;
			resistorOn = true;
			const agent = Agent.from({
				initial: { roomTemp, resistorOn },
				tasks: [turnOn, turnOff, wait],
				sensors: [termometer(roomTemp)],
				opts: { minWaitMs: 10, logger },
			});
			agent.seek({ roomTemp: 20 });
			await expect(agent.wait(1000)).to.eventually.deep.equal({
				success: true,
				state: { roomTemp: 20, resistorOn: false },
			}).fulfilled;
			agent.stop();
		});

		it('it should allow observers to subcribe to the agent state', async () => {
			const roomTemp = 18;
			resistorOn = false;
			const agent = Agent.from({
				initial: { roomTemp, resistorOn },
				tasks: [turnOn, turnOff, wait],
				sensors: [termometer(roomTemp)],
				opts: { minWaitMs: 10, logger },
			});

			const states: Heater[] = [];
			// Subscribe to the agent
			agent.subscribe((s) => states.push(s));

			agent.seek({ roomTemp: 20 });
			await expect(agent.wait(1000)).to.be.fulfilled;

			// The observable should return all the state changes
			expect(states).to.deep.equal([
				{ roomTemp: 18, resistorOn: false },
				{ roomTemp: 18, resistorOn: true },
				// Because the termometer is started with the agent, the temperature
				// drops a degree before it can be increased by turning the resistor on
				{ roomTemp: 17, resistorOn: true },
				{ roomTemp: 18, resistorOn: true },
				{ roomTemp: 19, resistorOn: true },
				{ roomTemp: 20, resistorOn: true },
			]);

			agent.stop();
		});
	});
});
