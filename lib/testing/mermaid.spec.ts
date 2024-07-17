import dedent from 'dedent';
import { expect } from '~/test-utils';
import { mermaid } from './mermaid';
import { Planner } from '../planner';
import type { Instruction } from '../task';
import { Task } from '../task';

describe('Mermaid', () => {
	it('empty plan', function () {
		const trace = mermaid();
		const planner = Planner.from<number>({ tasks: [], config: { trace } });

		planner.findPlan(0, 0);

		expect(trace.render()).to.deep.equal(
			dedent`
			graph TD
				start(( ))
				start -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> stop
				classDef error stroke:#f00
				classDef selected stroke:#0f0
			`.trim(),
		);
	});

	it('failed plan', function () {
		const trace = mermaid();
		const planner = Planner.from<number>({ tasks: [], config: { trace } });

		planner.findPlan(0, 1);

		expect(trace.render()).to.deep.equal(
			dedent`
			graph TD
				start(( ))
				start -.- d0{ }
				start:::error
				classDef error stroke:#f00
			`.trim(),
		);
	});

	it('single action plan', function () {
		const inc = Task.of<number>().from({
			condition: (state, { target }) => state < target,
			effect: (state) => ++state._,
			description: '+1',
		});

		const trace = mermaid();
		const planner = Planner.from<number>({ tasks: [inc], config: { trace } });

		planner.findPlan(0, 1);

		expect(trace.render()).to.deep.equal(
			dedent`
			graph TD
				start(( ))
				start -.- d0{ }
				d0 -.- 96fe396("+1")
				96fe396 -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> 96fe396
				96fe396:::selected
				96fe396 --> stop
				classDef error stroke:#f00
				classDef selected stroke:#0f0
			`.trim(),
		);
	});

	it('single action failed plan', function () {
		const dec = Task.of<number>().from({
			condition: (state, { target }) => state > target,
			effect: (state) => --state._,
			description: '-1',
		});

		const trace = mermaid();
		const planner = Planner.from<number>({
			tasks: [dec],
			config: { trace },
		});

		planner.findPlan(0, 1);

		expect(trace.render()).to.deep.equal(
			dedent`
				graph TD
					start(( ))
					start -.- d0{ }
					d0 -.- d7d90ed("-1")
					d7d90ed -.- d7d90ed-err[ ]
					d7d90ed-err:::error
					start:::error
					classDef error stroke:#f00
			`.trim(),
		);
	});

	it('max search reached failed plan', function () {
		const dec = Task.of<number>().from({
			// There is as bug here
			condition: (state, { target }) => state < target,
			effect: (state) => --state._,
			description: '-1',
		});

		const inc = Task.of<number>().from({
			condition: (state, { target }) => state < target,
			// There is as bug here
			effect: (state) => --state._,
			description: '+1',
		});

		const inc2 = Task.of<number>().from({
			condition: (state, { target }) => state < target,
			// There is as bug here
			effect: (state) => --state._,
			description: '+2',
		});

		const trace = mermaid();
		const planner = Planner.from<number>({
			tasks: [dec, inc, inc2],
			config: { maxSearchDepth: 2, trace },
		});

		planner.findPlan(0, 1);
		expect(trace.render()).to.deep.equal(
			dedent`
				graph TD
					start(( ))
					start -.- d0{ }
					d0 -.- d7d90ed("-1")
					d7d90ed -.- d1{ }
					d1 -.- 4d35804("-1")
					4d35804 -.- d2{ }
					d2 -.- d2-err[ ]
					d2-err:::error
					start:::error
					classDef error stroke:#f00
			`.trim(),
		);
	});

	it('single action plan with branching', function () {
		const inc = Task.of<number>().from({
			condition: (state, { target }) => state < target,
			effect: (state) => ++state._,
			description: '+1',
		});

		const dec = Task.of<number>().from({
			condition: (state, { target }) => state > target,
			effect: (state) => --state._,
			description: '-1',
		});

		const trace = mermaid();
		const planner = Planner.from<number>({
			tasks: [dec, inc],
			config: { trace },
		});

		planner.findPlan(0, 1);

		expect(trace.render()).to.deep.equal(
			dedent`
				graph TD
					start(( ))
					start -.- d0{ }
					d0 -.- d7d90ed("-1")
					d7d90ed -.- d7d90ed-err[ ]
					d7d90ed-err:::error
					d0 -.- 96fe396("+1")
					96fe396 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> 96fe396
					96fe396:::selected
					96fe396 --> stop
					classDef error stroke:#f00
					classDef selected stroke:#0f0				`.trim(),
		);
	});

	it('two action plan', function () {
		const inc = Task.of<number>().from({
			condition: (state, { target }) => state < target,
			effect: (state) => ++state._,
			description: '+1',
		});

		const trace = mermaid();
		const planner = Planner.from<number>({ tasks: [inc], config: { trace } });

		planner.findPlan(0, 2);

		expect(trace.render()).to.deep.equal(
			dedent`
				graph TD
					start(( ))
					start -.- d0{ }
					d0 -.- 72cc560("+1")
					72cc560 -.- d1{ }
					d1 -.- d09013f("+1")
					d09013f -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> 72cc560
					72cc560:::selected
					72cc560 --> d09013f
					d09013f:::selected
					d09013f --> stop
					classDef error stroke:#f00
					classDef selected stroke:#0f0
				`.trim(),
		);
	});

	it('two action plan with branching', function () {
		const inc = Task.of<number>().from({
			condition: (state, { target }) => state < target,
			effect: (state) => ++state._,
			description: '+1',
		});

		const dec = Task.of<number>().from({
			condition: (state: number, { target }) => state > target,
			effect: (state) => --state._,
			description: '-1',
		});

		const trace = mermaid();
		const planner = Planner.from<number>({
			tasks: [dec, inc],
			config: { trace },
		});

		planner.findPlan(0, 2);

		expect(trace.render()).to.deep.equal(
			dedent`
				graph TD
					start(( ))
					start -.- d0{ }
					d0 -.- 8696c55("-1")
					8696c55 -.- 8696c55-err[ ]
					8696c55-err:::error
					d0 -.- 72cc560("+1")
					72cc560 -.- d1{ }
					d1 -.- 01a1b19("-1")
					01a1b19 -.- 01a1b19-err[ ]
					01a1b19-err:::error
					d1 -.- d09013f("+1")
					d09013f -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> 72cc560
					72cc560:::selected
					72cc560 --> d09013f
					d09013f:::selected
					d09013f --> stop
					classDef error stroke:#f00
					classDef selected stroke:#0f0
			`.trim(),
		);
	});

	it('single action plan with unused method', function () {
		const inc = Task.of<number>().from({
			condition: (state, { target }) => state < target,
			effect: (state) => ++state._,
			description: '+1',
		});

		const byTwo = Task.of<number>().from({
			condition: (state, { target }) => target - state > 1,
			method: (_, { target }) => [inc({ target }), inc({ target })],
			description: '+2',
		});

		const trace = mermaid();
		const planner = Planner.from<number>({
			tasks: [byTwo, inc],
			config: { trace },
		});

		planner.findPlan(0, 1);

		expect(trace.render()).to.deep.equal(
			dedent`
				graph TD
					start(( ))
					start -.- d0{ }
					d0 -.- cef8b47[["+2"]]
					cef8b47 -.- cef8b47-err[ ]
					cef8b47-err:::error
					d0 -.- 96fe396("+1")
					96fe396 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> 96fe396
					96fe396:::selected
					96fe396 --> stop
					classDef error stroke:#f00
					classDef selected stroke:#0f0
				`.trim(),
		);
	});

	it('single action plan with used method', function () {
		const inc = Task.of<number>().from({
			condition: (state, { target }) => state < target,
			effect: (state) => ++state._,
			description: '+1',
		});

		const byTwo = Task.of<number>().from({
			condition: (state, { target }) => target - state > 1,
			method: (_, { target }) => [inc({ target }), inc({ target })],
			description: '+2',
		});

		const trace = mermaid();
		const planner = Planner.from<number>({
			tasks: [byTwo, inc],
			config: { trace },
		});

		planner.findPlan(0, 3);

		expect(trace.render()).to.deep.equal(
			dedent`
				graph TD
					start(( ))
					start -.- d0{ }
					d0 -.- 7ade865[["+2"]]
					7ade865 -.- a2dfb3e("+1")
					a2dfb3e -.- f63ee47("+1")
					f63ee47 -.- d1{ }
					d1 -.- 9272fd8[["+2"]]
					9272fd8 -.- 9272fd8-err[ ]
					9272fd8-err:::error
					d1 -.- d7b857d("+1")
					d7b857d -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> a2dfb3e
					a2dfb3e:::selected
					a2dfb3e --> f63ee47
					f63ee47:::selected
					f63ee47 --> d7b857d
					d7b857d:::selected
					d7b857d --> stop
					classDef error stroke:#f00
					classDef selected stroke:#0f0
				`.trim(),
		);
	});

	it('nested methods', function () {
		const plusOne = Task.of<number>().from({
			// This means the task can only be triggered
			// if the system state is below the target
			condition: (state, { target }) => state < target,
			// The effect of the action is increasing the system
			// counter by 1
			effect: (state) => ++state._,
			// An optional description. Useful for testing
			description: '+1',
		});

		const plusTwo = Task.of<number>().from({
			condition: (state, { target }) => target - state > 1,
			method: (_, { target }) => [plusOne({ target }), plusOne({ target })],
			description: '+2',
		});

		const plusThree = Task.of<number>().from({
			condition: (state, { target }) => target - state > 2,
			method: (_, { target }) => [plusTwo({ target }), plusOne({ target })],
			description: '+3',
		});

		const trace = mermaid();
		const planner = Planner.from({
			tasks: [plusThree, plusTwo, plusOne],
			config: { trace },
		});

		planner.findPlan(0, 7);
		expect(trace.render()).to.deep.equal(
			dedent`
				graph TD
					start(( ))
					start -.- d0{ }
					d0 -.- 8ddddab[["+3"]]
					8ddddab -.- 60ade34[["+2"]]
					60ade34 -.- 617d313("+1")
					617d313 -.- 10f66dc("+1")
					10f66dc -.- dcb9f55("+1")
					dcb9f55 -.- d1{ }
					d1 -.- 64101c2[["+3"]]
					64101c2 -.- e8f3079[["+2"]]
					e8f3079 -.- 6c33b74("+1")
					6c33b74 -.- 2ef2aa4("+1")
					2ef2aa4 -.- 8c79fab("+1")
					8c79fab -.- d2{ }
					d2 -.- 92c1c3f[["+3"]]
					92c1c3f -.- 92c1c3f-err[ ]
					92c1c3f-err:::error
					d2 -.- db08bc1[["+2"]]
					db08bc1 -.- db08bc1-err[ ]
					db08bc1-err:::error
					d2 -.- 210b6cb("+1")
					210b6cb -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> 617d313
					617d313:::selected
					617d313 --> 10f66dc
					10f66dc:::selected
					10f66dc --> dcb9f55
					dcb9f55:::selected
					dcb9f55 --> 6c33b74
					6c33b74:::selected
					6c33b74 --> 2ef2aa4
					2ef2aa4:::selected
					2ef2aa4 --> 8c79fab
					8c79fab:::selected
					8c79fab --> 210b6cb
					210b6cb:::selected
					210b6cb --> stop
					classDef error stroke:#f00
					classDef selected stroke:#0f0
			`.trim(),
		);
	});

	it('parallel tasks without methods', function () {
		type Counters = { [k: string]: number };

		const byOne = Task.of<Counters>().from({
			lens: '/:counterId',
			condition: (counter, ctx) => counter < ctx.target,
			effect: (counter) => ++counter._,
			description: ({ counterId }) => `${counterId} + 1`,
		});

		const multiIncrement = Task.of<Counters>().from({
			condition: (counters, ctx) =>
				Object.keys(counters).filter((k) => ctx.target[k] - counters[k] > 0)
					.length > 1,
			method: (counters, ctx) =>
				Object.keys(counters)
					.filter((k) => ctx.target[k] - counters[k] > 0)
					.map((k) => byOne({ counterId: k, target: ctx.target[k] })),
			description: `increment counters`,
		});

		const trace = mermaid();
		const planner = Planner.from({
			tasks: [multiIncrement, byOne],
			config: { trace },
		});

		planner.findPlan({ a: 0, b: 0 }, { a: 3, b: 2 });
		expect(trace.render()).to.deep.equal(
			dedent`
				graph TD
					start(( ))
					start -.- d0{ }
					d0 -.- f1e6082[["increment counters"]]
					f1e6082 -.- 980309c("a + 1")
					f1e6082 -.- af4d0f2("b + 1")
					980309c -.- jef7679a
					af4d0f2 -.- jef7679a
					jef7679a(( ))
					jef7679a -.- d1{ }
					d1 -.- 724e914[["increment counters"]]
					724e914 -.- cfa5434("a + 1")
					724e914 -.- d0f3d83("b + 1")
					cfa5434 -.- jb406312
					d0f3d83 -.- jb406312
					jb406312(( ))
					jb406312 -.- d2{ }
					d2 -.- 638942b[["increment counters"]]
					638942b -.- 638942b-err[ ]
					638942b-err:::error
					d2 -.- 66ba0da("a + 1")
					66ba0da -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> fjef7679a(( ))
					fjef7679a:::selected
					fjef7679a --> 980309c
					980309c:::selected
					fjef7679a --> af4d0f2
					af4d0f2:::selected
					jef7679a(( ))
					980309c --> jef7679a
					af4d0f2 --> jef7679a
					jef7679a:::selected
					jef7679a --> fjb406312(( ))
					fjb406312:::selected
					fjb406312 --> cfa5434
					cfa5434:::selected
					fjb406312 --> d0f3d83
					d0f3d83:::selected
					jb406312(( ))
					cfa5434 --> jb406312
					d0f3d83 --> jb406312
					jb406312:::selected
					jb406312 --> 66ba0da
					66ba0da:::selected
					66ba0da --> stop
					classDef error stroke:#f00
					classDef selected stroke:#0f0
			`.trim(),
		);
	});

	it('parallel tasks with methods', function () {
		type Counters = { [k: string]: number };

		const byOne = Task.of<Counters>().from({
			lens: '/:counterId',
			condition: (counter, ctx) => counter < ctx.target,
			effect: (counter) => ++counter._,
			description: ({ counterId }) => `${counterId} + 1`,
		});

		const byTwo = Task.of<Counters>().from({
			lens: '/:counterId',
			condition: (counter, ctx) => ctx.target - counter > 1,
			method: (_, ctx) => [byOne({ ...ctx }), byOne({ ...ctx })],
			description: ({ counterId }) => `increase '${counterId}'`,
		});

		const multiIncrement = Task.of<Counters>().from({
			condition: (counters, ctx) =>
				Object.keys(counters).some((k) => ctx.target[k] - counters[k] > 1),
			method: (counters, ctx) =>
				Object.keys(counters)
					.filter((k) => ctx.target[k] - counters[k] > 1)
					.map((k) => byTwo({ counterId: k, target: ctx.target[k] })),
			description: `increment counters`,
		});

		const trace = mermaid();
		const planner = Planner.from({
			tasks: [multiIncrement, byTwo, byOne],
			config: { trace },
		});
		planner.findPlan({ a: 0, b: 0 }, { a: 3, b: 2 });
		expect(trace.render()).to.deep.equal(
			dedent`
				graph TD
					start(( ))
					start -.- d0{ }
					d0 -.- 473c818[["increment counters"]]
					473c818 -.- 4da4b47[["increase 'a'"]]
					4da4b47 -.- bc17831("a + 1")
					bc17831 -.- e3b6153("a + 1")
					473c818 -.- fb667a2[["increase 'b'"]]
					fb667a2 -.- db97a94("b + 1")
					db97a94 -.- 0cfd06e("b + 1")
					e3b6153 -.- jb406312
					0cfd06e -.- jb406312
					jb406312(( ))
					jb406312 -.- d1{ }
					d1 -.- b0d92d4[["increment counters"]]
					b0d92d4 -.- b0d92d4-err[ ]
					b0d92d4-err:::error
					d1 -.- 03f7700[["increase 'a'"]]
					03f7700 -.- 03f7700-err[ ]
					03f7700-err:::error
					d1 -.- 5ac8491("a + 1")
					5ac8491 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> fjef7679a(( ))
					fjef7679a:::selected
					fjef7679a --> bc17831
					bc17831:::selected
					bc17831 --> e3b6153
					e3b6153:::selected
					fjef7679a --> db97a94
					db97a94:::selected
					db97a94 --> 0cfd06e
					0cfd06e:::selected
					jef7679a(( ))
					e3b6153 --> jef7679a
					0cfd06e --> jef7679a
					jef7679a:::selected
					jef7679a --> 5ac8491
					5ac8491:::selected
					5ac8491 --> stop
					classDef error stroke:#f00
					classDef selected stroke:#0f0
				`,
		);
	});

	it('parallel tasks with nested forks', function () {
		type Counters = { [k: string]: number };

		const byOne = Task.of<Counters>().from({
			lens: '/:counterId',
			condition: (counter, ctx) => counter < ctx.target,
			effect: (counter) => ++counter._,
			description: ({ counterId }) => `${counterId}++`,
		});

		const byTwo = Task.of<Counters>().from({
			lens: '/:counterId',
			condition: (counter, ctx) => ctx.target - counter > 1,
			method: (_, ctx) => [byOne({ ...ctx }), byOne({ ...ctx })],
			description: ({ counterId }) => `${counterId} + 2`,
		});

		const multiIncrement = Task.of<Counters>().from({
			condition: (counters, ctx) =>
				Object.keys(counters).some((k) => ctx.target[k] - counters[k] > 1),
			method: (counters, ctx) =>
				Object.keys(counters)
					.filter((k) => ctx.target[k] - counters[k] > 1)
					.map((k) => byTwo({ counterId: k, target: ctx.target[k] })),
			description: `increment multiple`,
		});

		const chunker = Task.of<Counters>().from({
			condition: (counters, ctx) =>
				Object.keys(counters).some((k) => ctx.target[k] - counters[k] > 1),
			method: (counters, ctx) => {
				const toUpdate = Object.keys(counters).filter(
					(k) => ctx.target[k] - counters[k] > 1,
				);

				const chunkSize = 2;
				const tasks: Array<Instruction<Counters>> = [];
				for (let i = 0; i < toUpdate.length; i += chunkSize) {
					const chunk = toUpdate.slice(i, i + chunkSize);
					tasks.push(
						multiIncrement({
							target: {
								...counters,
								...chunk.reduce(
									(acc, k) => ({ ...acc, [k]: ctx.target[k] }),
									{},
								),
							},
						}),
					);
				}

				return tasks;
			},
			description: 'chunk',
		});

		const trace = mermaid();
		const planner = Planner.from({
			tasks: [chunker, multiIncrement, byTwo, byOne],
			config: { trace },
		});
		planner.findPlan({ a: 0, b: 0, c: 0, d: 0 }, { a: 3, b: 2, c: 2, d: 2 });
		expect(trace.render()).to.deep.equal(
			dedent`
				graph TD
					start(( ))
					start -.- d0{ }
					d0 -.- 95a2b94[["chunk"]]
					95a2b94 -.- 7d0d5d2[["increment multiple"]]
					7d0d5d2 -.- fb6e56f[["a + 2"]]
					fb6e56f -.- 7854521("a++")
					7854521 -.- ecbd5d3("a++")
					7d0d5d2 -.- 0998b72[["b + 2"]]
					0998b72 -.- 70ee190("b++")
					70ee190 -.- 8f2b8e8("b++")
					95a2b94 -.- 853d3ae[["increment multiple"]]
					853d3ae -.- 11839b9[["c + 2"]]
					11839b9 -.- ec0223b("c++")
					ec0223b -.- 08f6308("c++")
					853d3ae -.- f4a70f2[["d + 2"]]
					f4a70f2 -.- d1fe065("d++")
					d1fe065 -.- 05b84b6("d++")
					ecbd5d3 -.- j02896e9
					8f2b8e8 -.- j02896e9
					j02896e9(( )) -.- 383a848
					08f6308 -.- j89ab737
					05b84b6 -.- j89ab737
					j89ab737(( )) -.- 383a848
					383a848(( ))
					383a848 -.- d1{ }
					d1 -.- c978cdc[["chunk"]]
					c978cdc -.- c978cdc-err[ ]
					c978cdc-err:::error
					d1 -.- 9266c34[["increment multiple"]]
					9266c34 -.- 9266c34-err[ ]
					9266c34-err:::error
					d1 -.- 1f7243e[["a + 2"]]
					1f7243e -.- 1f7243e-err[ ]
					1f7243e-err:::error
					d1 -.- c30c1b7("a++")
					c30c1b7 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> f346e421(( ))
					f346e421:::selected
					f346e421 --> fj90ec815(( ))
					fj90ec815:::selected
					fj90ec815 --> 7854521
					7854521:::selected
					7854521 --> ecbd5d3
					ecbd5d3:::selected
					fj90ec815 --> 70ee190
					70ee190:::selected
					70ee190 --> 8f2b8e8
					8f2b8e8:::selected
					j90ec815(( ))
					ecbd5d3 --> j90ec815
					8f2b8e8 --> j90ec815
					j90ec815:::selected
					f346e421 --> fj312509d(( ))
					fj312509d:::selected
					fj312509d --> ec0223b
					ec0223b:::selected
					ec0223b --> 08f6308
					08f6308:::selected
					fj312509d --> d1fe065
					d1fe065:::selected
					d1fe065 --> 05b84b6
					05b84b6:::selected
					j312509d(( ))
					08f6308 --> j312509d
					05b84b6 --> j312509d
					j312509d:::selected
					346e421(( ))
					j90ec815 --> 346e421
					j312509d --> 346e421
					346e421:::selected
					346e421 --> c30c1b7
					c30c1b7:::selected
					c30c1b7 --> stop
					classDef error stroke:#f00
					classDef selected stroke:#0f0
				`,
		);
	});

	it('draws sequential plan when backtracking is reported', function () {
		type Counters = { [k: string]: number };

		const byOne = Task.of<Counters>().from({
			lens: '/:counterId',
			condition: (counter, ctx) => counter < ctx.target,
			effect: (counter) => ++counter._,
			description: ({ counterId }) => `${counterId} + 1`,
		});

		const conflictingIncrement = Task.of<Counters>().from({
			condition: (counters, ctx) =>
				Object.keys(counters).filter((k) => ctx.target[k] - counters[k] > 1)
					.length > 1,
			method: (counters, ctx) =>
				Object.keys(counters)
					.filter((k) => ctx.target[k] - counters[k] > 1)
					.flatMap((k) => [
						// We create parallel steps to increase the same element of the state
						// concurrently
						byOne({ counterId: k, target: ctx.target[k] }),
						byOne({ counterId: k, target: ctx.target[k] }),
					]),
			description: `increment counters`,
		});

		const trace = mermaid();
		const planner = Planner.from({
			tasks: [conflictingIncrement, byOne],
			config: { trace },
		});

		planner.findPlan({ a: 0, b: 0 }, { a: 3, b: 2 });
		expect(trace.render()).to.deep.equal(
			dedent`
				graph TD
					start(( ))
					start -.- d0{ }
					d0 -.- b447e67[["increment counters"]]
					b447e67 -.- e3bebaf("a + 1")
					e3bebaf -.- e3b6153("a + 1")
					e3b6153 -.- b3803f8("b + 1")
					b3803f8 -.- 0cfd06e("b + 1")
					0cfd06e -.- d1{ }
					d1 -.- 96a5cb1[["increment counters"]]
					96a5cb1 -.- 96a5cb1-err[ ]
					96a5cb1-err:::error
					d1 -.- 5ac8491("a + 1")
					5ac8491 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> e3bebaf
					e3bebaf:::selected
					e3bebaf --> e3b6153
					e3b6153:::selected
					e3b6153 --> b3803f8
					b3803f8:::selected
					b3803f8 --> 0cfd06e
					0cfd06e:::selected
					0cfd06e --> 5ac8491
					5ac8491:::selected
					5ac8491 --> stop
					classDef error stroke:#f00
					classDef selected stroke:#0f0
				`,
		);
	});
});
