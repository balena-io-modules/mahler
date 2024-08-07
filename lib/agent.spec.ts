import { expect, trace } from '~/test-utils';
import { Agent } from './agent';
import { NoAction, Task } from './task';
import { Sensor } from './sensor';

import { stub } from 'sinon';

import { setTimeout, setImmediate } from 'timers/promises';
import { Observable } from './observable';
import * as memoizee from 'memoizee';
import { UNDEFINED } from './target';

describe('Agent', () => {
	describe('basic operations', () => {
		it('it should succeed if state has already been reached', async () => {
			const agent = Agent.from({ initial: 0, opts: { trace } });
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
				opts: { minWaitMs: 10, trace },
			});
			agent.seek({ never: true });
			await expect(agent.wait(1000)).to.be.rejected;
			agent.stop();
		});

		it('it continues looking for plan unless max retries is set', async () => {
			const agent = Agent.from({
				initial: {},
				opts: { minWaitMs: 10, maxRetries: 2, trace },
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
				opts: { trace, minWaitMs: 10 },
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
			expect(count).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
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
				opts: { trace },
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
			expect(count).to.deep.equal([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
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
				opts: { trace, minWaitMs: 1 * 1000 },
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
				action: (state) => {
					++state._;

					// The action fails after a partial update
					throw new Error('action failed');
				},
				description: '+1',
			});
			const agent = Agent.from({
				initial: 0,
				opts: { trace, maxRetries: 0 },
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
			action: (state) => {
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

				if (state.b < target.b) {
					tasks.push(bPlusOne({ target: target.b }));
				}
				if (state.a < target.a) {
					tasks.push(aPlusOne({ target: target.a }));
				}
				return tasks;
			},
			description: '+1',
		});
		const agent = Agent.from({
			initial: { a: 0, b: 0 },
			opts: { trace, maxRetries: 0 },
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
				await toggleResistorOn();
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
				await toggleResistorOff();
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
				opts: { minWaitMs: 10, trace },
			});
			agent.seek({ roomTemp: 20 });

			await expect(agent.wait(1000)).to.be.fulfilled;
			expect(agent.state().roomTemp).to.equal(20);

			agent.stop();
		});

		it('it should turn off the heater if temperature is above the target', async () => {
			const roomTemp = 30;
			resistorOn = true;
			const agent = Agent.from({
				initial: { roomTemp, resistorOn },
				tasks: [turnOn, turnOff, wait],
				sensors: [termometer(roomTemp)],
				opts: { minWaitMs: 10, trace },
			});
			agent.seek({ roomTemp: 20 });

			await expect(agent.wait(1000)).to.be.fulfilled;
			expect(agent.state().roomTemp).to.equal(20);
			agent.stop();
		});

		it('it should terminate once the strict target has been reached', async () => {
			const roomTemp = 30;
			resistorOn = true;
			const agent = Agent.from({
				initial: { roomTemp, resistorOn },
				tasks: [turnOn, turnOff, wait],
				sensors: [termometer(roomTemp)],
				opts: { minWaitMs: 10, trace },
			});
			agent.seekStrict({ roomTemp: 20, resistorOn: false });
			await expect(agent.wait(1000)).to.eventually.deep.equal({
				success: true,
				state: { roomTemp: 20, resistorOn: false },
			});
			agent.stop();
		});

		it('it should allow observers to subcribe to the agent state', async () => {
			const roomTemp = 18;
			resistorOn = false;
			const agent = Agent.from({
				initial: { roomTemp, resistorOn },
				tasks: [turnOn, turnOff, wait],
				sensors: [termometer(roomTemp)],
				opts: { minWaitMs: 10, trace },
			});

			const states: Heater[] = [];
			// Subscribe to the agent
			agent.subscribe((s) => states.push(s));

			agent.seek({ roomTemp: 20 });
			await expect(agent.wait(1000)).to.be.fulfilled;

			// The observable should return all the state changes
			expect(states).to.deep.equal([
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

	// A more complex example that the heater, for a multi-room
	// temperature control system
	describe('Climate controller', () => {
		type ClimateControl = {
			[room: string]: { temperature: number; heaterOn: boolean };
		};
		const INITIAL_STATE: ClimateControl = {
			office: { temperature: 15, heaterOn: false },
			bedroom: { temperature: 15, heaterOn: false },
		};
		const buildingState = structuredClone(INITIAL_STATE);

		// Reset the state before each test
		beforeEach(() => {
			Object.assign(buildingState, INITIAL_STATE);
		});

		// Memoize the update function so it's called at most per counter
		// eslint-disable-next-line
		const updateTemp = memoizee((_) =>
			Object.fromEntries(
				Object.entries(buildingState).map(([roomName, roomState]) =>
					roomState.heaterOn
						? [roomName, ++roomState.temperature]
						: [roomName, --roomState.temperature],
				),
			),
		);

		// Global monitor of temperature
		// this simulates temperature change on rooms of a building
		// the temperature of each room will drop 1 degree every
		// 10ms if the heater is off and increase 1 degree if heater is on
		const climateMonitor = Observable.interval(10).map(updateTemp);

		const roomSensor = Sensor.of<ClimateControl>().from({
			lens: '/:room/temperature',
			sensor: ({ room }) => climateMonitor.map((climate) => climate[room]),
		});

		const turnOn = Task.of<ClimateControl>().from({
			lens: '/:room',
			condition: (room, { target }) =>
				room.temperature < target.temperature && !room.heaterOn,
			effect(room, { target }) {
				// Turning the resistor on does not change the temperature
				// immediately, but the effect is that the temperature eventually
				// will reach that point
				room._.temperature = target.temperature;
				room._.heaterOn = true;
			},
			async action(room) {
				room._.heaterOn = true;
				await setImmediate();
			},
			description: ({ room }) => `turn heater on in ${room}`,
		});

		const turnOff = Task.of<ClimateControl>().from({
			lens: '/:room',
			condition: (room, { target }) =>
				room.temperature > target.temperature && room.heaterOn,
			effect(room, { target }) {
				// Turning the resistor on does not change the temperature
				// immediately, but the effect is that the temperature eventually
				// will reach that point
				room._.temperature = target.temperature;
				room._.heaterOn = false;
			},
			async action(room) {
				room._.heaterOn = false;
				await setImmediate();
			},
			description: ({ room }) => `turn heater off in ${room}`,
		});

		const wait = Task.of<ClimateControl>().from({
			lens: '/:room',
			condition: (room, { target }) =>
				// We have not reached the target but the resistor is already off
				(room.temperature > target.temperature && !room.heaterOn) ||
				// We have not reached the target but the resistor is already on
				(room.temperature < target.temperature && room.heaterOn),
			effect: (room, { target }) => {
				room._.temperature = target.temperature;
			},
			action: NoAction,
			description: ({ room, target }) =>
				`wait for temperature in ${room} to reach ${target.temperature}`,
		});

		const addRoom = Task.of<ClimateControl>().from({
			op: 'create',
			lens: '/:room',
			effect(room, { target }) {
				room._ = target;
			},
		});

		const removeRoom = Task.of<ClimateControl>().from({
			op: 'delete',
			lens: '/:room',
			effect() {
				/* noop */
			},
		});

		it('should allow controlling the tempereture of a single room', async () => {
			const climateControl = Agent.from({
				initial: INITIAL_STATE,
				tasks: [turnOn, turnOff, wait, addRoom],
				sensors: [roomSensor],
				opts: { minWaitMs: 10, trace },
			});

			climateControl.subscribe((s) => {
				// Update the building state when
				// the agent state changes
				Object.assign(buildingState, s);
			});

			climateControl.seek({ bedroom: { temperature: 20 } });
			await expect(climateControl.wait(300)).to.be.fulfilled;
			expect(climateControl.state().bedroom.temperature).to.equal(20);

			climateControl.stop();
			await setTimeout(50);
		});

		it('should allow controlling the temperature of multiple rooms', async () => {
			const climateControl = Agent.from({
				initial: INITIAL_STATE,
				tasks: [turnOn, turnOff, wait, addRoom],
				sensors: [roomSensor],
				opts: { minWaitMs: 10, trace },
			});

			climateControl.subscribe((s) => {
				// Update the building state when
				// the agent state changes
				Object.assign(buildingState, s);
			});

			// This is not a great example, because if the target for both
			// rooms is not the same, then the controller will keep iterating
			// as temperature will never settle
			climateControl.seek({
				bedroom: { temperature: 20 },
				office: { temperature: 20 },
			});
			await expect(climateControl.wait(300)).to.be.fulfilled;
			expect(climateControl.state().bedroom.temperature).to.equal(20);
			expect(climateControl.state().office.temperature).to.equal(20);

			climateControl.stop();
			await setTimeout(50);
		});

		it('should allow controlling the temperature of a new room', async () => {
			const climateControl = Agent.from({
				initial: INITIAL_STATE,
				tasks: [turnOn, turnOff, wait, addRoom],
				sensors: [roomSensor],
				opts: { minWaitMs: 10, trace },
			});

			climateControl.subscribe((s) => {
				// Update the building state when
				// the agent state changes
				Object.assign(buildingState, s);
			});

			// This is not a great example, because if the target for both
			// rooms is not the same, then the controller will keep iterating
			// as temperature will never settle
			climateControl.seek({
				studio: { temperature: 20 },
			});
			await expect(climateControl.wait(300)).to.be.fulfilled;
			expect(climateControl.state().studio.temperature).equal(20);

			climateControl.stop();
			await setTimeout(50);
		});

		it('should allow removing a room and still control temperature', async () => {
			const climateControl = Agent.from({
				initial: INITIAL_STATE,
				tasks: [turnOn, turnOff, wait, addRoom, removeRoom],
				sensors: [roomSensor],
				opts: { minWaitMs: 10, trace },
			});

			climateControl.subscribe((s) => {
				// Update the building state when
				// the agent state changes
				Object.assign(buildingState, s);
			});

			// This is not a great example, because if the target for both
			// rooms is not the same, then the controller will keep iterating
			// as temperature will never settle
			climateControl.seek({
				bedroom: { temperature: 20 },
				office: UNDEFINED,
			});
			await expect(climateControl.wait(300)).to.be.fulfilled;
			const state = climateControl.state();
			expect(state.bedroom).to.not.be.undefined;
			expect(state.bedroom.temperature).to.equal(20);

			climateControl.stop();
			await setTimeout(50);
		});
	});
});
