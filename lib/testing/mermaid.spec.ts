import dedent from 'dedent';
import { expect } from '~/test-utils';
import { mermaid } from './mermaid';
import { Planner } from '../planner';
import { Instruction, Task } from '../task';

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
				d0 -.- 1b61d85("+1")
				1b61d85 -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> 1b61d85
				1b61d85:::selected
				1b61d85 --> stop
				classDef error stroke:#f00
				classDef selected stroke:#0f0
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
					d0 -.- 430b5ac("-1")
					430b5ac -.- 430b5ac-err[ ]
					430b5ac-err:::error
					d0 -.- 1b61d85("+1")
					1b61d85 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> 1b61d85
					1b61d85:::selected
					1b61d85 --> stop
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
					d0 -.- 32215d7("+1")
					32215d7 -.- d1{ }
					d1 -.- bb43ece("+1")
					bb43ece -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> 32215d7
					32215d7:::selected
					32215d7 --> bb43ece
					bb43ece:::selected
					bb43ece --> stop
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
					d0 -.- 90d01a4("-1")
					90d01a4 -.- 90d01a4-err[ ]
					90d01a4-err:::error
					d0 -.- 32215d7("+1")
					32215d7 -.- d1{ }
					d1 -.- 3f3fe30("-1")
					3f3fe30 -.- 3f3fe30-err[ ]
					3f3fe30-err:::error
					d1 -.- bb43ece("+1")
					bb43ece -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> 32215d7
					32215d7:::selected
					32215d7 --> bb43ece
					bb43ece:::selected
					bb43ece --> stop
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
					d0 -.- 85ff46f[["+2"]]
					85ff46f -.- 85ff46f-err[ ]
					85ff46f-err:::error
					d0 -.- 1b61d85("+1")
					1b61d85 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> 1b61d85
					1b61d85:::selected
					1b61d85 --> stop
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
					d0 -.- afa7c77[["+2"]]
					afa7c77 -.- 1d5c604("+1")
					1d5c604 -.- e4545aa("+1")
					e4545aa -.- d1{ }
					d1 -.- 5a8d071[["+2"]]
					5a8d071 -.- 5a8d071-err[ ]
					5a8d071-err:::error
					d1 -.- 6ba514a("+1")
					6ba514a -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> 1d5c604
					1d5c604:::selected
					1d5c604 --> e4545aa
					e4545aa:::selected
					e4545aa --> 6ba514a
					6ba514a:::selected
					6ba514a --> stop
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
					d0 -.- e1410cd[["+3"]]
					e1410cd -.- ced9af0[["+2"]]
					ced9af0 -.- 180733b("+1")
					180733b -.- 9c0697d("+1")
					9c0697d -.- 4402352("+1")
					4402352 -.- d1{ }
					d1 -.- 5180f6e[["+3"]]
					5180f6e -.- 193c573[["+2"]]
					193c573 -.- 6653d29("+1")
					6653d29 -.- 5e028cf("+1")
					5e028cf -.- 8efc9e4("+1")
					8efc9e4 -.- d2{ }
					d2 -.- 97cf280[["+3"]]
					97cf280 -.- 97cf280-err[ ]
					97cf280-err:::error
					d2 -.- 5800777[["+2"]]
					5800777 -.- 5800777-err[ ]
					5800777-err:::error
					d2 -.- b71bed1("+1")
					b71bed1 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> 180733b
					180733b:::selected
					180733b --> 9c0697d
					9c0697d:::selected
					9c0697d --> 4402352
					4402352:::selected
					4402352 --> 6653d29
					6653d29:::selected
					6653d29 --> 5e028cf
					5e028cf:::selected
					5e028cf --> 8efc9e4
					8efc9e4:::selected
					8efc9e4 --> b71bed1
					b71bed1:::selected
					b71bed1 --> stop
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
					d0 -.- 8dd5003[["increment counters"]]
					8dd5003 -.- 5bb6c18("a + 1")
					8dd5003 -.- 9c5d478("b + 1")
					5bb6c18 -.- j7272a3d
					9c5d478 -.- j7272a3d
					j7272a3d(( ))
					j7272a3d -.- d1{ }
					d1 -.- 2fb608a[["increment counters"]]
					2fb608a -.- a5d1149("a + 1")
					2fb608a -.- 9578070("b + 1")
					a5d1149 -.- jde6ad08
					9578070 -.- jde6ad08
					jde6ad08(( ))
					jde6ad08 -.- d2{ }
					d2 -.- 8abf853[["increment counters"]]
					8abf853 -.- 8abf853-err[ ]
					8abf853-err:::error
					d2 -.- 05e1e95("a + 1")
					05e1e95 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> fj7272a3d(( ))
					fj7272a3d:::selected
					fj7272a3d --> 5bb6c18
					5bb6c18:::selected
					fj7272a3d --> 9c5d478
					9c5d478:::selected
					j7272a3d(( ))
					5bb6c18 --> j7272a3d
					9c5d478 --> j7272a3d
					j7272a3d:::selected
					j7272a3d --> fjde6ad08(( ))
					fjde6ad08:::selected
					fjde6ad08 --> a5d1149
					a5d1149:::selected
					fjde6ad08 --> 9578070
					9578070:::selected
					jde6ad08(( ))
					a5d1149 --> jde6ad08
					9578070 --> jde6ad08
					jde6ad08:::selected
					jde6ad08 --> 05e1e95
					05e1e95:::selected
					05e1e95 --> stop
					classDef error stroke:#f00
					classDef selected stroke:#0f0
			`,
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
					d0 -.- 6155512[["increment counters"]]
					6155512 -.- 9ea56ac[["increase 'a'"]]
					9ea56ac -.- 27fff9e("a + 1")
					27fff9e -.- 0e3f56c("a + 1")
					6155512 -.- 5003b21[["increase 'b'"]]
					5003b21 -.- de69aab("b + 1")
					de69aab -.- 0bf9a34("b + 1")
					0e3f56c -.- jde6ad08
					0bf9a34 -.- jde6ad08
					jde6ad08(( ))
					jde6ad08 -.- d1{ }
					d1 -.- 3311fc0[["increment counters"]]
					3311fc0 -.- 3311fc0-err[ ]
					3311fc0-err:::error
					d1 -.- a9c52c6[["increase 'a'"]]
					a9c52c6 -.- a9c52c6-err[ ]
					a9c52c6-err:::error
					d1 -.- eb5cff4("a + 1")
					eb5cff4 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> fj7272a3d(( ))
					fj7272a3d:::selected
					fj7272a3d --> 27fff9e
					27fff9e:::selected
					27fff9e --> 0e3f56c
					0e3f56c:::selected
					fj7272a3d --> de69aab
					de69aab:::selected
					de69aab --> 0bf9a34
					0bf9a34:::selected
					j7272a3d(( ))
					0e3f56c --> j7272a3d
					0bf9a34 --> j7272a3d
					j7272a3d:::selected
					j7272a3d --> eb5cff4
					eb5cff4:::selected
					eb5cff4 --> stop
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
					d0 -.- ac8cc3a[["chunk"]]
					ac8cc3a -.- b2fcf21[["increment multiple"]]
					b2fcf21 -.- 9ef9ead[["a + 2"]]
					9ef9ead -.- c5037ba("a++")
					c5037ba -.- 39337c1("a++")
					b2fcf21 -.- 332010e[["b + 2"]]
					332010e -.- 034bbe0("b++")
					034bbe0 -.- 20ee506("b++")
					ac8cc3a -.- bf2a438[["increment multiple"]]
					bf2a438 -.- 8ec14bf[["c + 2"]]
					8ec14bf -.- 9313895("c++")
					9313895 -.- 9483746("c++")
					bf2a438 -.- 7093746[["d + 2"]]
					7093746 -.- 98a9a34("d++")
					98a9a34 -.- d36adcb("d++")
					39337c1 -.- j2b2a51d
					20ee506 -.- j2b2a51d
					j2b2a51d(( )) -.- 4fa0388
					9483746 -.- j02d8902
					d36adcb -.- j02d8902
					j02d8902(( )) -.- 4fa0388
					4fa0388(( ))
					4fa0388 -.- d1{ }
					d1 -.- fd65f2e[["chunk"]]
					fd65f2e -.- fd65f2e-err[ ]
					fd65f2e-err:::error
					d1 -.- 6571c52[["increment multiple"]]
					6571c52 -.- 6571c52-err[ ]
					6571c52-err:::error
					d1 -.- df8fad6[["a + 2"]]
					df8fad6 -.- df8fad6-err[ ]
					df8fad6-err:::error
					d1 -.- b715c94("a++")
					b715c94 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> f304966c(( ))
					f304966c:::selected
					f304966c --> fj5213432(( ))
					fj5213432:::selected
					fj5213432 --> c5037ba
					c5037ba:::selected
					c5037ba --> 39337c1
					39337c1:::selected
					fj5213432 --> 034bbe0
					034bbe0:::selected
					034bbe0 --> 20ee506
					20ee506:::selected
					j5213432(( ))
					39337c1 --> j5213432
					20ee506 --> j5213432
					j5213432:::selected
					f304966c --> fj316bfe2(( ))
					fj316bfe2:::selected
					fj316bfe2 --> 9313895
					9313895:::selected
					9313895 --> 9483746
					9483746:::selected
					fj316bfe2 --> 98a9a34
					98a9a34:::selected
					98a9a34 --> d36adcb
					d36adcb:::selected
					j316bfe2(( ))
					9483746 --> j316bfe2
					d36adcb --> j316bfe2
					j316bfe2:::selected
					304966c(( ))
					j5213432 --> 304966c
					j316bfe2 --> 304966c
					304966c:::selected
					304966c --> b715c94
					b715c94:::selected
					b715c94 --> stop
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
					d0 -.- d90b3da[["increment counters"]]
					d90b3da -.- dd89b07("a + 1")
					dd89b07 -.- 0e3f56c("a + 1")
					0e3f56c -.- f733eae("b + 1")
					f733eae -.- 0bf9a34("b + 1")
					0bf9a34 -.- d1{ }
					d1 -.- e45e61b[["increment counters"]]
					e45e61b -.- e45e61b-err[ ]
					e45e61b-err:::error
					d1 -.- eb5cff4("a + 1")
					eb5cff4 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> dd89b07
					dd89b07:::selected
					dd89b07 --> 0e3f56c
					0e3f56c:::selected
					0e3f56c --> f733eae
					f733eae:::selected
					f733eae --> 0bf9a34
					0bf9a34:::selected
					0bf9a34 --> eb5cff4
					eb5cff4:::selected
					eb5cff4 --> stop
					classDef error stroke:#f00
					classDef selected stroke:#0f0
				`,
		);
	});
});
