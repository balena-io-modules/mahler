import { expect, console } from '~/tests';
import { Agent } from './agent';
import { Task, NoAction } from './task';
import { Sensor, Subscriber } from './sensor';
import { Observable } from './observable';

import { setTimeout } from 'timers/promises';

describe('Agent', () => {
	describe('basic operations', () => {
		it('it should succeed if state has already been reached', async () => {
			const agent = Agent.of({ initial: 0, opts: { logger: console } });
			agent.seek(0);
			await expect(agent.wait()).to.eventually.deep.equal({
				success: true,
				state: 0,
			});
		});

		it('it continues looking for plan unless max retries is set', async () => {
			const agent = Agent.of({
				initial: {},
				opts: { minWaitMs: 10, logger: console },
			});
			agent.seek({ never: true });
			await expect(agent.wait(1000)).to.be.rejected;
			await agent.stop();
		});

		it('it continues looking for plan unless max retries is set', async () => {
			const agent = Agent.of({
				initial: {},
				opts: { minWaitMs: 10, maxRetries: 2, logger: console },
			});
			agent.seek({ never: true });
			await expect(agent.wait(1000)).to.be.fulfilled;
		});

		it('it allows to subscribe to the agent state', async () => {
			const inc = Task.of({
				condition: (state: number, { target }) => state < target,
				effect: (state: number) => state + 1,
				action: async (state: number) => state + 1,
				description: 'increment',
			});
			const agent = Agent.of({
				initial: 0,
				opts: { logger: console, minWaitMs: 10 },
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
		});

		it('it allows to use observables as actions', async () => {
			const counter = Task.of({
				condition: (state: number, { target }) => state < target,
				effect: (_: number, { target }) => target,
				action: (state: number, { target }) =>
					Observable.of(async (s) => {
						while (state < target) {
							state = state + 1;
							s.next(state);
							await setTimeout(10);
						}
					}),
			});
			const agent = Agent.of({
				initial: 0,
				opts: { logger: console },
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
		});
	});

	describe('heater', () => {
		type Heater = { roomTemp: number; resistorOn: boolean };
		const turnOn = Task.of({
			condition: (state: Heater, { target }) =>
				state.roomTemp < target.roomTemp && !state.resistorOn,
			effect: (state: Heater, { target }) => ({
				...state,
				// Turning the resistor on does not change the temperature
				// immediately, but the effect is that the temperature eventually
				// will reach that point
				roomTemp: target.roomTemp,
				resistorOn: true,
			}),
			action: async (state: Heater) => ({
				...state,
				resistorOn: true,
			}),
			description: 'turn resistor ON',
		});

		const turnOff = Task.of({
			condition: (state: Heater, { target }) =>
				state.roomTemp > target.roomTemp && !!state.resistorOn,
			effect: (state: Heater, { target }) => ({
				...state,
				roomTemp: target.roomTemp,
				resistorOn: false,
			}),
			action: async (state: Heater) => ({
				...state,
				resistorOn: false,
			}),
			description: 'turn resistor OFF',
		});

		const wait = Task.of({
			condition: (state: Heater, { target }) =>
				// We have not reached the target but the resistor is already off
				(state.roomTemp > target.roomTemp && !state.resistorOn) ||
				// We have not reached the target but the resistor is already on
				(state.roomTemp < target.roomTemp && !!state.resistorOn),
			effect: (state: Heater, { target }) => ({
				...state,
				roomTemp: target.roomTemp,
			}),
			action: NoAction,
			description: 'wait for temperature to reach target',
		});

		const termometer = Sensor.of(async (subscriber: Subscriber<Heater>) => {
			while (true) {
				subscriber.next((state) => {
					// For this test we assume the temperature source of truth comes
					// from the agent, but that won't be true in a real system,
					// where the termometer would be the source of truth
					const roomTemp = state.roomTemp;
					if (state.resistorOn) {
						// The heater is on, so the temperature increases
						return { ...state, roomTemp: roomTemp + 1 };
					} else {
						return { ...state, roomTemp: roomTemp - 1 };
					}
				});

				// Temperature increases/decreases 1 degree every 10ms
				await setTimeout(10);
			}
		});

		it('it should turn on the heater if temperature is below the target', async () => {
			const agent = Agent.of({
				initial: { roomTemp: 10, resistorOn: false },
				tasks: [turnOn, turnOff, wait],
				sensors: [termometer],
				opts: { minWaitMs: 10, logger: console },
			});
			agent.seek({ roomTemp: 20 });
			await expect(agent.wait(1000)).to.eventually.deep.equal({
				success: true,
				state: { roomTemp: 20, resistorOn: true },
			});
			agent.stop();
		});

		it('it should turn off the heater if temperature is above the target', async () => {
			const agent = Agent.of({
				initial: { roomTemp: 30, resistorOn: true },
				tasks: [turnOn, turnOff, wait],
				sensors: [termometer],
				opts: { minWaitMs: 10, logger: console },
			});
			agent.seek({ roomTemp: 20 });
			await expect(agent.wait(1000)).to.eventually.deep.equal({
				success: true,
				state: { roomTemp: 20, resistorOn: false },
			}).fulfilled;
			agent.stop();
		});

		it('it should allow observers to subcribe to the agent state', async () => {
			const agent = Agent.of({
				initial: { roomTemp: 18, resistorOn: false },
				tasks: [turnOn, turnOff, wait],
				sensors: [termometer],
				opts: { minWaitMs: 10, logger: console },
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
				{ roomTemp: 19, resistorOn: true },
				{ roomTemp: 20, resistorOn: true },
			]);

			agent.stop();
		});
	});
});
