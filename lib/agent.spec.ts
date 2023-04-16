import { expect } from '~/tests';
import { Agent } from './agent';
import { Task } from './task';
import { Sensor, Subscriber } from './sensor';

import { setTimeout } from 'timers/promises';

describe('Agent', () => {
	describe('basic operations', () => {
		it('it should succeed if state has already been reached', async () => {
			const agent = Agent.of({ initial: {} });
			agent.start({});
			await expect(agent.result()).to.eventually.deep.equal({ success: true });
		});

		it('it continues looking for plan unless max retries is set', async () => {
			const agent = Agent.of({ initial: {}, opts: { pollIntervalMs: 10 } });
			agent.start({ never: true });
			await expect(agent.result(1000)).to.be.rejected;
			await agent.stop();
		});

		it('it continues looking for plan unless max retries is set', async () => {
			const agent = Agent.of({
				initial: {},
				opts: { pollIntervalMs: 10, maxRetries: 2 },
			});
			agent.start({ never: true });
			await expect(agent.result(1000)).to.be.fulfilled;
		});
	});

	describe('heater', () => {
		type Heater = { roomTemp: number; resistorOn: boolean };
		const turnOn = Task.of({
			condition: (state: Heater, { target }) =>
				state.roomTemp < target.roomTemp && !state.resistorOn,
			effect: (state: Heater, { target }) => ({
				...state,
				// Turning the resistor om does not change the temperature
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
			action: async (state: Heater) => {
				// do nothing
				return state;
			},
			description: 'wait for temperature to reach target',
		});

		const termometer = Sensor.of(async (subscriber: Subscriber<Heater>) => {
			let roomTemp = 10;

			while (true) {
				subscriber.next((state) => {
					if (!!state.resistorOn) {
						roomTemp = roomTemp + 1;
						// The heater is on, so the temperature increases
						return { ...state, roomTemp };
					} else {
						roomTemp = roomTemp - 1;
						return { ...state, roomTemp };
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
				opts: { pollIntervalMs: 10 },
			});
			agent.start({ roomTemp: 20 });
			await expect(agent.result(1000)).to.be.fulfilled;
			expect(agent.state().roomTemp).equal(20);
			agent.stop();
		});

		it('it should turn off the heater if temperature is above the target', async () => {
			const agent = Agent.of({
				initial: { roomTemp: 30, resistorOn: true },
				tasks: [turnOn, turnOff, wait],
				sensors: [termometer],
				opts: { pollIntervalMs: 10 },
			});
			agent.start({ roomTemp: 20 });
			await expect(agent.result(1000)).to.be.fulfilled;
			expect(agent.state().roomTemp).to.equal(20);
			agent.stop();
		});
	});
});