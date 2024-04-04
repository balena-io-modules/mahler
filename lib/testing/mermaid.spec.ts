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
				d0 -.- eb35387("+1")
				eb35387 -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> eb35387
				eb35387:::selected
				eb35387 --> stop
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
					d0 -.- 34364f2("-1")
					34364f2 -.- 34364f2-err[ ]
					34364f2-err:::error
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
					d0 -.- 34364f2("-1")
					34364f2 -.- d1{ }
					d1 -.- 936cc5a("-1")
					936cc5a -.- d2{ }
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
					d0 -.- 34364f2("-1")
					34364f2 -.- 34364f2-err[ ]
					34364f2-err:::error
					d0 -.- eb35387("+1")
					eb35387 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> eb35387
					eb35387:::selected
					eb35387 --> stop
					classDef error stroke:#f00
					classDef selected stroke:#0f0
				`.trim(),
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
					d0 -.- ede85fb("+1")
					ede85fb -.- d1{ }
					d1 -.- 8d85823("+1")
					8d85823 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> ede85fb
					ede85fb:::selected
					ede85fb --> 8d85823
					8d85823:::selected
					8d85823 --> stop
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
					d0 -.- deeb466("-1")
					deeb466 -.- deeb466-err[ ]
					deeb466-err:::error
					d0 -.- ede85fb("+1")
					ede85fb -.- d1{ }
					d1 -.- 6eaa8d5("-1")
					6eaa8d5 -.- 6eaa8d5-err[ ]
					6eaa8d5-err:::error
					d1 -.- 8d85823("+1")
					8d85823 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> ede85fb
					ede85fb:::selected
					ede85fb --> 8d85823
					8d85823:::selected
					8d85823 --> stop
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
					d0 -.- eb35387("+1")
					eb35387 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> eb35387
					eb35387:::selected
					eb35387 --> stop
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
					7ade865 -.- d91038f("+1")
					d91038f -.- 56dee17("+1")
					56dee17 -.- d1{ }
					d1 -.- 9272fd8[["+2"]]
					9272fd8 -.- 9272fd8-err[ ]
					9272fd8-err:::error
					d1 -.- 6d61260("+1")
					6d61260 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> d91038f
					d91038f:::selected
					d91038f --> 56dee17
					56dee17:::selected
					56dee17 --> 6d61260
					6d61260:::selected
					6d61260 --> stop
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
					60ade34 -.- fa032ee("+1")
					fa032ee -.- af13cc0("+1")
					af13cc0 -.- b11100d("+1")
					b11100d -.- d1{ }
					d1 -.- 64101c2[["+3"]]
					64101c2 -.- e8f3079[["+2"]]
					e8f3079 -.- a28edfc("+1")
					a28edfc -.- 467594f("+1")
					467594f -.- 994a0c9("+1")
					994a0c9 -.- d2{ }
					d2 -.- 92c1c3f[["+3"]]
					92c1c3f -.- 92c1c3f-err[ ]
					92c1c3f-err:::error
					d2 -.- db08bc1[["+2"]]
					db08bc1 -.- db08bc1-err[ ]
					db08bc1-err:::error
					d2 -.- 593c362("+1")
					593c362 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> fa032ee
					fa032ee:::selected
					fa032ee --> af13cc0
					af13cc0:::selected
					af13cc0 --> b11100d
					b11100d:::selected
					b11100d --> a28edfc
					a28edfc:::selected
					a28edfc --> 467594f
					467594f:::selected
					467594f --> 994a0c9
					994a0c9:::selected
					994a0c9 --> 593c362
					593c362:::selected
					593c362 --> stop
					classDef error stroke:#f00
					classDef selected stroke:#0f0
			`,
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
					f1e6082 -.- bc81372("a + 1")
					f1e6082 -.- 745bd1f("b + 1")
					bc81372 -.- jf4e90eb
					745bd1f -.- jf4e90eb
					jf4e90eb(( ))
					jf4e90eb -.- d1{ }
					d1 -.- 724e914[["increment counters"]]
					724e914 -.- e152e9e("a + 1")
					724e914 -.- ef0db09("b + 1")
					e152e9e -.- j8578a7d
					ef0db09 -.- j8578a7d
					j8578a7d(( ))
					j8578a7d -.- d2{ }
					d2 -.- 638942b[["increment counters"]]
					638942b -.- 638942b-err[ ]
					638942b-err:::error
					d2 -.- 4f3358f("a + 1")
					4f3358f -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> fjf4e90eb(( ))
					fjf4e90eb:::selected
					fjf4e90eb --> bc81372
					bc81372:::selected
					fjf4e90eb --> 745bd1f
					745bd1f:::selected
					jf4e90eb(( ))
					bc81372 --> jf4e90eb
					745bd1f --> jf4e90eb
					jf4e90eb:::selected
					jf4e90eb --> fj8578a7d(( ))
					fj8578a7d:::selected
					fj8578a7d --> e152e9e
					e152e9e:::selected
					fj8578a7d --> ef0db09
					ef0db09:::selected
					j8578a7d(( ))
					e152e9e --> j8578a7d
					ef0db09 --> j8578a7d
					j8578a7d:::selected
					j8578a7d --> 4f3358f
					4f3358f:::selected
					4f3358f --> stop
					classDef error stroke:#f00
					classDef selected stroke:#0f0			`,
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
					4da4b47 -.- a9ef90e("a + 1")
					a9ef90e -.- 7379b58("a + 1")
					473c818 -.- fb667a2[["increase 'b'"]]
					fb667a2 -.- 1a61a0b("b + 1")
					1a61a0b -.- 619482f("b + 1")
					7379b58 -.- j8578a7d
					619482f -.- j8578a7d
					j8578a7d(( ))
					j8578a7d -.- d1{ }
					d1 -.- b0d92d4[["increment counters"]]
					b0d92d4 -.- b0d92d4-err[ ]
					b0d92d4-err:::error
					d1 -.- 03f7700[["increase 'a'"]]
					03f7700 -.- 03f7700-err[ ]
					03f7700-err:::error
					d1 -.- 7518c42("a + 1")
					7518c42 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> fjf4e90eb(( ))
					fjf4e90eb:::selected
					fjf4e90eb --> a9ef90e
					a9ef90e:::selected
					a9ef90e --> 7379b58
					7379b58:::selected
					fjf4e90eb --> 1a61a0b
					1a61a0b:::selected
					1a61a0b --> 619482f
					619482f:::selected
					jf4e90eb(( ))
					7379b58 --> jf4e90eb
					619482f --> jf4e90eb
					jf4e90eb:::selected
					jf4e90eb --> 7518c42
					7518c42:::selected
					7518c42 --> stop
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
					fb6e56f -.- 9a38b55("a++")
					9a38b55 -.- 61d794a("a++")
					7d0d5d2 -.- 0998b72[["b + 2"]]
					0998b72 -.- f4f729d("b++")
					f4f729d -.- 1afee5b("b++")
					95a2b94 -.- 853d3ae[["increment multiple"]]
					853d3ae -.- 11839b9[["c + 2"]]
					11839b9 -.- f169d20("c++")
					f169d20 -.- 9f5c731("c++")
					853d3ae -.- f4a70f2[["d + 2"]]
					f4a70f2 -.- fa111f1("d++")
					fa111f1 -.- 02175b1("d++")
					61d794a -.- jfdbd0fe
					1afee5b -.- jfdbd0fe
					jfdbd0fe(( )) -.- 1f2d05c
					9f5c731 -.- jf0c2aca
					02175b1 -.- jf0c2aca
					jf0c2aca(( )) -.- 1f2d05c
					1f2d05c(( ))
					1f2d05c -.- d1{ }
					d1 -.- c978cdc[["chunk"]]
					c978cdc -.- c978cdc-err[ ]
					c978cdc-err:::error
					d1 -.- 9266c34[["increment multiple"]]
					9266c34 -.- 9266c34-err[ ]
					9266c34-err:::error
					d1 -.- 1f7243e[["a + 2"]]
					1f7243e -.- 1f7243e-err[ ]
					1f7243e-err:::error
					d1 -.- 4ca63a1("a++")
					4ca63a1 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> f9648dae(( ))
					f9648dae:::selected
					f9648dae --> fj40f95ac(( ))
					fj40f95ac:::selected
					fj40f95ac --> 9a38b55
					9a38b55:::selected
					9a38b55 --> 61d794a
					61d794a:::selected
					fj40f95ac --> f4f729d
					f4f729d:::selected
					f4f729d --> 1afee5b
					1afee5b:::selected
					j40f95ac(( ))
					61d794a --> j40f95ac
					1afee5b --> j40f95ac
					j40f95ac:::selected
					f9648dae --> fjcc7ed51(( ))
					fjcc7ed51:::selected
					fjcc7ed51 --> f169d20
					f169d20:::selected
					f169d20 --> 9f5c731
					9f5c731:::selected
					fjcc7ed51 --> fa111f1
					fa111f1:::selected
					fa111f1 --> 02175b1
					02175b1:::selected
					jcc7ed51(( ))
					9f5c731 --> jcc7ed51
					02175b1 --> jcc7ed51
					jcc7ed51:::selected
					9648dae(( ))
					j40f95ac --> 9648dae
					jcc7ed51 --> 9648dae
					9648dae:::selected
					9648dae --> 4ca63a1
					4ca63a1:::selected
					4ca63a1 --> stop
					classDef error stroke:#f00
					classDef selected stroke:#0f0				`,
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
					b447e67 -.- 1c0350c("a + 1")
					1c0350c -.- 7379b58("a + 1")
					7379b58 -.- 4b05c26("b + 1")
					4b05c26 -.- 619482f("b + 1")
					619482f -.- d1{ }
					d1 -.- 96a5cb1[["increment counters"]]
					96a5cb1 -.- 96a5cb1-err[ ]
					96a5cb1-err:::error
					d1 -.- 7518c42("a + 1")
					7518c42 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> 1c0350c
					1c0350c:::selected
					1c0350c --> 7379b58
					7379b58:::selected
					7379b58 --> 4b05c26
					4b05c26:::selected
					4b05c26 --> 619482f
					619482f:::selected
					619482f --> 7518c42
					7518c42:::selected
					7518c42 --> stop
					classDef error stroke:#f00
					classDef selected stroke:#0f0
				`,
		);
	});
});
