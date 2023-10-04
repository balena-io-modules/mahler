import dedent from 'dedent';
import { expect } from '~/test-utils';
import { mermaid } from './mermaid';
import { Planner } from '../planner';
import { Instruction, Task } from '../task';

describe('Mermaid', () => {
	it('empty plan', function () {
		const trace = mermaid();
		const planner = Planner.of<number>({ tasks: [], config: { trace } });

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
		const planner = Planner.of<number>({ tasks: [], config: { trace } });

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
		const inc = Task.from({
			condition: (state: number, { target }) => state < target,
			effect: (state: number) => state + 1,
			action: async (state: number) => state + 1,
			description: '+1',
		});

		const trace = mermaid();
		const planner = Planner.of<number>({ tasks: [inc], config: { trace } });

		planner.findPlan(0, 1);

		expect(trace.render()).to.deep.equal(
			dedent`
			graph TD
				start(( ))
				start -.- d0{ }
				d0 -.- 496e8a2("+1")
				496e8a2 -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> 496e8a2
				496e8a2:::selected
				496e8a2 --> stop
				classDef error stroke:#f00
				classDef selected stroke:#0f0
			`.trim(),
		);
	});

	it('single action plan with branching', function () {
		const inc = Task.from({
			condition: (state: number, { target }) => state < target,
			effect: (state: number) => state + 1,
			action: async (state: number) => state + 1,
			description: '+1',
		});

		const dec = Task.from({
			condition: (state: number, { target }) => state > target,
			effect: (state: number) => state - 1,
			action: async (state: number) => state - 1,
			description: '-1',
		});

		const trace = mermaid();
		const planner = Planner.of<number>({
			tasks: [dec, inc],
			config: { trace },
		});

		planner.findPlan(0, 1);

		expect(trace.render()).to.deep.equal(
			dedent`
			graph TD
				start(( ))
				start -.- d0{ }
				d0 -.- 3f11921("-1")
				3f11921 -.- 3f11921-err[ ]
				3f11921-err:::error
				d0 -.- 496e8a2("+1")
				496e8a2 -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> 496e8a2
				496e8a2:::selected
				496e8a2 --> stop
				classDef error stroke:#f00
				classDef selected stroke:#0f0
				`.trim(),
		);
	});

	it('two action plan', function () {
		const inc = Task.from({
			condition: (state: number, { target }) => state < target,
			effect: (state: number) => state + 1,
			action: async (state: number) => state + 1,
			description: '+1',
		});

		const trace = mermaid();
		const planner = Planner.of<number>({ tasks: [inc], config: { trace } });

		planner.findPlan(0, 2);

		expect(trace.render()).to.deep.equal(
			dedent`
			graph TD
				start(( ))
				start -.- d0{ }
				d0 -.- c897673("+1")
				c897673 -.- d1{ }
				d1 -.- e87399f("+1")
				e87399f -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> c897673
				c897673:::selected
				c897673 --> e87399f
				e87399f:::selected
				e87399f --> stop
				classDef error stroke:#f00
				classDef selected stroke:#0f0
			`.trim(),
		);
	});

	it('two action plan with branching', function () {
		const inc = Task.from({
			condition: (state: number, { target }) => state < target,
			effect: (state: number) => state + 1,
			action: async (state: number) => state + 1,
			description: '+1',
		});

		const dec = Task.from({
			condition: (state: number, { target }) => state > target,
			effect: (state: number) => state - 1,
			action: async (state: number) => state - 1,
			description: '-1',
		});

		const trace = mermaid();
		const planner = Planner.of<number>({
			tasks: [dec, inc],
			config: { trace },
		});

		planner.findPlan(0, 2);

		expect(trace.render()).to.deep.equal(
			dedent`
			graph TD
				start(( ))
				start -.- d0{ }
				d0 -.- a12d4dc("-1")
				a12d4dc -.- a12d4dc-err[ ]
				a12d4dc-err:::error
				d0 -.- c897673("+1")
				c897673 -.- d1{ }
				d1 -.- 8bf512f("-1")
				8bf512f -.- 8bf512f-err[ ]
				8bf512f-err:::error
				d1 -.- e87399f("+1")
				e87399f -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> c897673
				c897673:::selected
				c897673 --> e87399f
				e87399f:::selected
				e87399f --> stop
				classDef error stroke:#f00
				classDef selected stroke:#0f0
				`.trim(),
		);
	});

	it('single action plan with unused method', function () {
		const inc = Task.from({
			condition: (state: number, { target }) => state < target,
			effect: (state: number) => state + 1,
			action: async (state: number) => state + 1,
			description: '+1',
		});

		const byTwo = Task.from({
			condition: (state: number, { target }) => target - state > 1,
			method: (_: number, { target }) => [inc({ target }), inc({ target })],
			description: '+2',
		});

		const trace = mermaid();
		const planner = Planner.of<number>({
			tasks: [byTwo, inc],
			config: { trace },
		});

		planner.findPlan(0, 1);

		expect(trace.render()).to.deep.equal(
			dedent`
			graph TD
				start(( ))
				start -.- d0{ }
				d0 -.- 826b197[["+2"]]
				826b197 -.- 826b197-err[ ]
				826b197-err:::error
				d0 -.- 496e8a2("+1")
				496e8a2 -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> 496e8a2
				496e8a2:::selected
				496e8a2 --> stop
				classDef error stroke:#f00
				classDef selected stroke:#0f0
				`.trim(),
		);
	});

	it('single action plan with used method', function () {
		const inc = Task.from({
			condition: (state: number, { target }) => state < target,
			effect: (state: number) => state + 1,
			action: async (state: number) => state + 1,
			description: '+1',
		});

		const byTwo = Task.from({
			condition: (state: number, { target }) => target - state > 1,
			method: (_: number, { target }) => [inc({ target }), inc({ target })],
			description: '+2',
		});

		const trace = mermaid();
		const planner = Planner.of<number>({
			tasks: [byTwo, inc],
			config: { trace },
		});

		planner.findPlan(0, 3);

		expect(trace.render()).to.deep.equal(
			dedent`
			graph TD
				start(( ))
				start -.- d0{ }
				d0 -.- 21ac729[["+2"]]
				21ac729 -.- dc2da69("+1")
				dc2da69 -.- 19e83b4("+1")
				19e83b4 -.- d1{ }
				d1 -.- c1bb3cb[["+2"]]
				c1bb3cb -.- c1bb3cb-err[ ]
				c1bb3cb-err:::error
				d1 -.- c9c70c6("+1")
				c9c70c6 -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> dc2da69
				dc2da69:::selected
				dc2da69 --> 19e83b4
				19e83b4:::selected
				19e83b4 --> c9c70c6
				c9c70c6:::selected
				c9c70c6 --> stop
				classDef error stroke:#f00
				classDef selected stroke:#0f0
				`.trim(),
		);
	});

	it('nested methods', function () {
		const plusOne = Task.from({
			// This means the task can only be triggered
			// if the system state is below the target
			condition: (state: number, { target }) => state < target,
			// The effect of the action is increasing the system
			// counter by 1
			effect: (state: number) => state + 1,
			// An optional description. Useful for testing
			description: '+1',
		});

		const plusTwo = Task.from({
			condition: (state: number, { target }) => target - state > 1,
			method: (_: number, { target }) => [
				plusOne({ target }),
				plusOne({ target }),
			],
			description: '+2',
		});

		const plusThree = Task.from({
			condition: (state: number, { target }) => target - state > 2,
			method: (_: number, { target }) => [
				plusTwo({ target }),
				plusOne({ target }),
			],
			description: '+3',
		});

		const trace = mermaid();
		const planner = Planner.of({
			tasks: [plusThree, plusTwo, plusOne],
			config: { trace },
		});

		planner.findPlan(0, 7);
		expect(trace.render()).to.deep.equal(
			dedent`
			graph TD
				start(( ))
				start -.- d0{ }
				d0 -.- 822bf63[["+3"]]
				822bf63 -.- edeeb11[["+2"]]
				edeeb11 -.- 8b74640("+1")
				8b74640 -.- 927a1d9("+1")
				927a1d9 -.- 93d33ca("+1")
				93d33ca -.- d1{ }
				d1 -.- 6edb6ff[["+3"]]
				6edb6ff -.- 8f0ba02[["+2"]]
				8f0ba02 -.- 192c0db("+1")
				192c0db -.- 823efa0("+1")
				823efa0 -.- 2a4b707("+1")
				2a4b707 -.- d2{ }
				d2 -.- e3e8116[["+3"]]
				e3e8116 -.- e3e8116-err[ ]
				e3e8116-err:::error
				d2 -.- 9649060[["+2"]]
				9649060 -.- 9649060-err[ ]
				9649060-err:::error
				d2 -.- c9f44d7("+1")
				c9f44d7 -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> 8b74640
				8b74640:::selected
				8b74640 --> 927a1d9
				927a1d9:::selected
				927a1d9 --> 93d33ca
				93d33ca:::selected
				93d33ca --> 192c0db
				192c0db:::selected
				192c0db --> 823efa0
				823efa0:::selected
				823efa0 --> 2a4b707
				2a4b707:::selected
				2a4b707 --> c9f44d7
				c9f44d7:::selected
				c9f44d7 --> stop
				classDef error stroke:#f00
				classDef selected stroke:#0f0
			`,
		);
	});

	it('parallel tasks without methods', function () {
		type Counters = { [k: string]: number };

		const byOne = Task.from({
			path: '/:counter',
			condition: (state: Counters, ctx) => ctx.get(state) < ctx.target,
			effect: (state: Counters, ctx) => ctx.set(state, ctx.get(state) + 1),
			description: ({ counter }) => `${counter} + 1`,
		});

		const multiIncrement = Task.from({
			condition: (state: Counters, ctx) =>
				Object.keys(state).filter((k) => ctx.target[k] - state[k] > 0).length >
				1,
			method: (state: Counters, ctx) =>
				Object.keys(state)
					.filter((k) => ctx.target[k] - state[k] > 0)
					.map((k) => byOne({ counter: k, target: ctx.target[k] })),
			description: `increment counters`,
		});

		const trace = mermaid();
		const planner = Planner.of({
			tasks: [multiIncrement, byOne],
			config: { trace },
		});

		planner.findPlan({ a: 0, b: 0 }, { a: 3, b: 2 });
		expect(trace.render()).to.deep.equal(
			dedent`
			graph TD
				start(( ))
				start -.- d0{ }
				d0 -.- 588eea4[["increment counters"]]
				588eea4 -.- 9071720("a + 1")
				588eea4 -.- 7747bff("b + 1")
				9071720 -.- j6b09f09
				7747bff -.- j6b09f09
				j6b09f09(( ))
				j6b09f09 -.- d1{ }
				d1 -.- c5108a8[["increment counters"]]
				c5108a8 -.- 6aa0594("a + 1")
				c5108a8 -.- 2c5439a("b + 1")
				6aa0594 -.- jf78e02c
				2c5439a -.- jf78e02c
				jf78e02c(( ))
				jf78e02c -.- d2{ }
				d2 -.- ee9e70b[["increment counters"]]
				ee9e70b -.- ee9e70b-err[ ]
				ee9e70b-err:::error
				d2 -.- b75673e("a + 1")
				b75673e -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> fj6b09f09(( ))
				fj6b09f09:::selected
				fj6b09f09 --> 9071720
				9071720:::selected
				fj6b09f09 --> 7747bff
				7747bff:::selected
				j6b09f09(( ))
				9071720 --> j6b09f09
				7747bff --> j6b09f09
				j6b09f09:::selected
				j6b09f09 --> fjf78e02c(( ))
				fjf78e02c:::selected
				fjf78e02c --> 6aa0594
				6aa0594:::selected
				fjf78e02c --> 2c5439a
				2c5439a:::selected
				jf78e02c(( ))
				6aa0594 --> jf78e02c
				2c5439a --> jf78e02c
				jf78e02c:::selected
				jf78e02c --> b75673e
				b75673e:::selected
				b75673e --> stop
				classDef error stroke:#f00
				classDef selected stroke:#0f0			`,
		);
	});

	it('parallel tasks with methods', function () {
		type Counters = { [k: string]: number };

		const byOne = Task.from({
			path: '/:counter',
			condition: (state: Counters, ctx) => ctx.get(state) < ctx.target,
			effect: (state: Counters, ctx) => ctx.set(state, ctx.get(state) + 1),
			description: ({ counter }) => `${counter} + 1`,
		});

		const byTwo = Task.from({
			path: '/:counter',
			condition: (state: Counters, ctx) => ctx.target - ctx.get(state) > 1,
			method: (_: Counters, ctx) => [byOne({ ...ctx }), byOne({ ...ctx })],
			description: ({ counter }) => `increase '${counter}'`,
		});

		const multiIncrement = Task.from({
			condition: (state: Counters, ctx) =>
				Object.keys(state).some((k) => ctx.target[k] - state[k] > 1),
			method: (state: Counters, ctx) =>
				Object.keys(state)
					.filter((k) => ctx.target[k] - state[k] > 1)
					.map((k) => byTwo({ counter: k, target: ctx.target[k] })),
			description: `increment counters`,
		});

		const trace = mermaid();
		const planner = Planner.of({
			tasks: [multiIncrement, byTwo, byOne],
			config: { trace },
		});
		planner.findPlan({ a: 0, b: 0 }, { a: 3, b: 2 });
		expect(trace.render()).to.deep.equal(
			dedent`
				graph TD
					start(( ))
					start -.- d0{ }
					d0 -.- 2396eea[["increment counters"]]
					2396eea -.- 682aa0e[["increase 'a'"]]
					682aa0e -.- f564b6b("a + 1")
					f564b6b -.- 0d3673e("a + 1")
					2396eea -.- 5dd218c[["increase 'b'"]]
					5dd218c -.- d4ee1fa("b + 1")
					d4ee1fa -.- c7319a4("b + 1")
					0d3673e -.- jf78e02c
					c7319a4 -.- jf78e02c
					jf78e02c(( ))
					jf78e02c -.- d1{ }
					d1 -.- 7de2726[["increment counters"]]
					7de2726 -.- 7de2726-err[ ]
					7de2726-err:::error
					d1 -.- 976345d[["increase 'a'"]]
					976345d -.- 976345d-err[ ]
					976345d-err:::error
					d1 -.- 468e422("a + 1")
					468e422 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> fj6b09f09(( ))
					fj6b09f09:::selected
					fj6b09f09 --> f564b6b
					f564b6b:::selected
					f564b6b --> 0d3673e
					0d3673e:::selected
					fj6b09f09 --> d4ee1fa
					d4ee1fa:::selected
					d4ee1fa --> c7319a4
					c7319a4:::selected
					j6b09f09(( ))
					0d3673e --> j6b09f09
					c7319a4 --> j6b09f09
					j6b09f09:::selected
					j6b09f09 --> 468e422
					468e422:::selected
					468e422 --> stop
					classDef error stroke:#f00
					classDef selected stroke:#0f0			`,
		);
	});

	it('parallel tasks with nested forks', function () {
		type Counters = { [k: string]: number };

		const byOne = Task.from({
			path: '/:counter',
			condition: (state: Counters, ctx) => ctx.get(state) < ctx.target,
			effect: (state: Counters, ctx) => ctx.set(state, ctx.get(state) + 1),
			description: ({ counter }) => `${counter}++`,
		});

		const byTwo = Task.from({
			path: '/:counter',
			condition: (state: Counters, ctx) => ctx.target - ctx.get(state) > 1,
			method: (_: Counters, ctx) => [byOne({ ...ctx }), byOne({ ...ctx })],
			description: ({ counter }) => `${counter} + 2`,
		});

		const multiIncrement = Task.from({
			condition: (state: Counters, ctx) =>
				Object.keys(state).some((k) => ctx.target[k] - state[k] > 1),
			method: (state: Counters, ctx) =>
				Object.keys(state)
					.filter((k) => ctx.target[k] - state[k] > 1)
					.map((k) => byTwo({ counter: k, target: ctx.target[k] })),
			description: `increment multiple`,
		});

		const chunker = Task.from({
			condition: (state: Counters, ctx) =>
				Object.keys(state).some((k) => ctx.target[k] - state[k] > 1),
			method: (state: Counters, ctx) => {
				const toUpdate = Object.keys(state).filter(
					(k) => ctx.target[k] - state[k] > 1,
				);

				const chunkSize = 2;
				const tasks: Array<Instruction<Counters>> = [];
				for (let i = 0; i < toUpdate.length; i += chunkSize) {
					const chunk = toUpdate.slice(i, i + chunkSize);
					tasks.push(
						multiIncrement({
							target: {
								...state,
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
		const planner = Planner.of({
			tasks: [chunker, multiIncrement, byTwo, byOne],
			config: { trace },
		});
		planner.findPlan({ a: 0, b: 0, c: 0, d: 0 }, { a: 3, b: 2, c: 2, d: 2 });
		expect(trace.render()).to.deep.equal(
			dedent`
				graph TD
					start(( ))
					start -.- d0{ }
					d0 -.- 16c4cee[["chunk"]]
					16c4cee -.- 85de134[["increment multiple"]]
					85de134 -.- f086833[["a + 2"]]
					f086833 -.- 6725504("a++")
					6725504 -.- d9eff37("a++")
					85de134 -.- 491551c[["b + 2"]]
					491551c -.- bb6a327("b++")
					bb6a327 -.- 1b3d60d("b++")
					16c4cee -.- 14b5abe[["increment multiple"]]
					14b5abe -.- a6594ae[["c + 2"]]
					a6594ae -.- 79ef4af("c++")
					79ef4af -.- d7098f4("c++")
					14b5abe -.- 9a04ffd[["d + 2"]]
					9a04ffd -.- 62f8002("d++")
					62f8002 -.- 5e7f342("d++")
					d9eff37 -.- jfb9402c
					1b3d60d -.- jfb9402c
					jfb9402c(( )) -.- 9034b1e
					d7098f4 -.- jb231a35
					5e7f342 -.- jb231a35
					jb231a35(( )) -.- 9034b1e
					9034b1e(( ))
					9034b1e -.- d1{ }
					d1 -.- cb79260[["chunk"]]
					cb79260 -.- cb79260-err[ ]
					cb79260-err:::error
					d1 -.- a65b91b[["increment multiple"]]
					a65b91b -.- a65b91b-err[ ]
					a65b91b-err:::error
					d1 -.- 8923404[["a + 2"]]
					8923404 -.- 8923404-err[ ]
					8923404-err:::error
					d1 -.- e51d42f("a++")
					e51d42f -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> f56cffb0(( ))
					f56cffb0:::selected
					f56cffb0 --> fj18095dd(( ))
					fj18095dd:::selected
					fj18095dd --> 6725504
					6725504:::selected
					6725504 --> d9eff37
					d9eff37:::selected
					fj18095dd --> bb6a327
					bb6a327:::selected
					bb6a327 --> 1b3d60d
					1b3d60d:::selected
					j18095dd(( ))
					d9eff37 --> j18095dd
					1b3d60d --> j18095dd
					j18095dd:::selected
					f56cffb0 --> fj343bab8(( ))
					fj343bab8:::selected
					fj343bab8 --> 79ef4af
					79ef4af:::selected
					79ef4af --> d7098f4
					d7098f4:::selected
					fj343bab8 --> 62f8002
					62f8002:::selected
					62f8002 --> 5e7f342
					5e7f342:::selected
					j343bab8(( ))
					d7098f4 --> j343bab8
					5e7f342 --> j343bab8
					j343bab8:::selected
					56cffb0(( ))
					j18095dd --> 56cffb0
					j343bab8 --> 56cffb0
					56cffb0:::selected
					56cffb0 --> e51d42f
					e51d42f:::selected
					e51d42f --> stop
					classDef error stroke:#f00
					classDef selected stroke:#0f0			`,
		);
	});

	it('draws sequential plan when backtracking is reported', function () {
		type Counters = { [k: string]: number };

		const byOne = Task.from({
			path: '/:counter',
			condition: (state: Counters, ctx) => ctx.get(state) < ctx.target,
			effect: (state: Counters, ctx) => ctx.set(state, ctx.get(state) + 1),
			description: ({ counter }) => `${counter} + 1`,
		});

		const conflictingIncrement = Task.from({
			condition: (state: Counters, ctx) =>
				Object.keys(state).filter((k) => ctx.target[k] - state[k] > 1).length >
				1,
			method: (state: Counters, ctx) =>
				Object.keys(state)
					.filter((k) => ctx.target[k] - state[k] > 1)
					.flatMap((k) => [
						// We create parallel steps to increase the same element of the state
						// concurrently
						byOne({ counter: k, target: ctx.target[k] }),
						byOne({ counter: k, target: ctx.target[k] }),
					]),
			description: `increment counters`,
		});

		const trace = mermaid();
		const planner = Planner.of({
			tasks: [conflictingIncrement, byOne],
			config: { trace },
		});

		planner.findPlan({ a: 0, b: 0 }, { a: 3, b: 2 });
		expect(trace.render()).to.deep.equal(
			dedent`
				graph TD
					start(( ))
					start -.- d0{ }
					d0 -.- 817288c[["increment counters"]]
					817288c -.- ac5943a("a + 1")
					ac5943a -.- 0d3673e("a + 1")
					0d3673e -.- 002f81e("b + 1")
					002f81e -.- c7319a4("b + 1")
					c7319a4 -.- d1{ }
					d1 -.- 4b2ca33[["increment counters"]]
					4b2ca33 -.- 4b2ca33-err[ ]
					4b2ca33-err:::error
					d1 -.- 468e422("a + 1")
					468e422 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> ac5943a
					ac5943a:::selected
					ac5943a --> 0d3673e
					0d3673e:::selected
					0d3673e --> 002f81e
					002f81e:::selected
					002f81e --> c7319a4
					c7319a4:::selected
					c7319a4 --> 468e422
					468e422:::selected
					468e422 --> stop
					classDef error stroke:#f00
					classDef selected stroke:#0f0
			`,
		);
	});
});
