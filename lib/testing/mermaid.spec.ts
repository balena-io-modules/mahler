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
				d0 -.- 1461420("+1")
				1461420 -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> 1461420
				1461420:::selected
				1461420 --> stop
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
					d0 -.- 0ad51d7("-1")
					0ad51d7 -.- 0ad51d7-err[ ]
					0ad51d7-err:::error
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
					d0 -.- 9254d0f("-1")
					9254d0f -.- d1{ }
					d1 -.- 9759627("-1")
					9759627 -.- d2{ }
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
					d0 -.- 0ad51d7("-1")
					0ad51d7 -.- 0ad51d7-err[ ]
					0ad51d7-err:::error
					d0 -.- 1461420("+1")
					1461420 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> 1461420
					1461420:::selected
					1461420 --> stop
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
					d0 -.- d6dbb7a("+1")
					d6dbb7a -.- d1{ }
					d1 -.- 2aa2ee2("+1")
					2aa2ee2 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> d6dbb7a
					d6dbb7a:::selected
					d6dbb7a --> 2aa2ee2
					2aa2ee2:::selected
					2aa2ee2 --> stop
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
					d0 -.- c4bb219("-1")
					c4bb219 -.- c4bb219-err[ ]
					c4bb219-err:::error
					d0 -.- d6dbb7a("+1")
					d6dbb7a -.- d1{ }
					d1 -.- b52246f("-1")
					b52246f -.- b52246f-err[ ]
					b52246f-err:::error
					d1 -.- 2aa2ee2("+1")
					2aa2ee2 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> d6dbb7a
					d6dbb7a:::selected
					d6dbb7a --> 2aa2ee2
					2aa2ee2:::selected
					2aa2ee2 --> stop
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
					d0 -.- 33297a1[["+2"]]
					33297a1 -.- 33297a1-err[ ]
					33297a1-err:::error
					d0 -.- 1461420("+1")
					1461420 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> 1461420
					1461420:::selected
					1461420 --> stop
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
					d0 -.- 12daded[["+2"]]
					12daded -.- 7d7e586("+1")
					7d7e586 -.- 8d6733c("+1")
					8d6733c -.- d1{ }
					d1 -.- 8ac273c[["+2"]]
					8ac273c -.- 8ac273c-err[ ]
					8ac273c-err:::error
					d1 -.- dfbf9a6("+1")
					dfbf9a6 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> 7d7e586
					7d7e586:::selected
					7d7e586 --> 8d6733c
					8d6733c:::selected
					8d6733c --> dfbf9a6
					dfbf9a6:::selected
					dfbf9a6 --> stop
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
					d0 -.- 51d88d0[["+3"]]
					51d88d0 -.- 823d4a1[["+2"]]
					823d4a1 -.- b07be91("+1")
					b07be91 -.- 9597dc2("+1")
					9597dc2 -.- 8c9363e("+1")
					8c9363e -.- d1{ }
					d1 -.- 51020ab[["+3"]]
					51020ab -.- 3a801c4[["+2"]]
					3a801c4 -.- 72e151d("+1")
					72e151d -.- 880b8b7("+1")
					880b8b7 -.- b50ba52("+1")
					b50ba52 -.- d2{ }
					d2 -.- 2d3729d[["+3"]]
					2d3729d -.- 2d3729d-err[ ]
					2d3729d-err:::error
					d2 -.- 5be51f2[["+2"]]
					5be51f2 -.- 5be51f2-err[ ]
					5be51f2-err:::error
					d2 -.- 3496872("+1")
					3496872 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> b07be91
					b07be91:::selected
					b07be91 --> 9597dc2
					9597dc2:::selected
					9597dc2 --> 8c9363e
					8c9363e:::selected
					8c9363e --> 72e151d
					72e151d:::selected
					72e151d --> 880b8b7
					880b8b7:::selected
					880b8b7 --> b50ba52
					b50ba52:::selected
					b50ba52 --> 3496872
					3496872:::selected
					3496872 --> stop
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
					d0 -.- 5c2cd27[["increment counters"]]
					5c2cd27 -.- 3b2bc73("a + 1")
					5c2cd27 -.- 03920e6("b + 1")
					3b2bc73 -.- j02f523f
					03920e6 -.- j02f523f
					j02f523f(( ))
					j02f523f -.- d1{ }
					d1 -.- 8cdbef4[["increment counters"]]
					8cdbef4 -.- 012a8ae("a + 1")
					8cdbef4 -.- ad25ac3("b + 1")
					012a8ae -.- ja235917
					ad25ac3 -.- ja235917
					ja235917(( ))
					ja235917 -.- d2{ }
					d2 -.- e32f884[["increment counters"]]
					e32f884 -.- e32f884-err[ ]
					e32f884-err:::error
					d2 -.- 6df61b7("a + 1")
					6df61b7 -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> fj02f523f(( ))
					fj02f523f:::selected
					fj02f523f --> 3b2bc73
					3b2bc73:::selected
					fj02f523f --> 03920e6
					03920e6:::selected
					j02f523f(( ))
					3b2bc73 --> j02f523f
					03920e6 --> j02f523f
					j02f523f:::selected
					j02f523f --> fja235917(( ))
					fja235917:::selected
					fja235917 --> 012a8ae
					012a8ae:::selected
					fja235917 --> ad25ac3
					ad25ac3:::selected
					ja235917(( ))
					012a8ae --> ja235917
					ad25ac3 --> ja235917
					ja235917:::selected
					ja235917 --> 6df61b7
					6df61b7:::selected
					6df61b7 --> stop
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
					d0 -.- 9a30756[["increment counters"]]
					9a30756 -.- d8d3d0a[["increase 'a'"]]
					d8d3d0a -.- 6bcdf54("a + 1")
					6bcdf54 -.- 25cd4c8("a + 1")
					9a30756 -.- 9a8cff4[["increase 'b'"]]
					9a8cff4 -.- aa3d7ce("b + 1")
					aa3d7ce -.- c522839("b + 1")
					25cd4c8 -.- ja235917
					c522839 -.- ja235917
					ja235917(( ))
					ja235917 -.- d1{ }
					d1 -.- d31d74f[["increment counters"]]
					d31d74f -.- d31d74f-err[ ]
					d31d74f-err:::error
					d1 -.- 8ef3900[["increase 'a'"]]
					8ef3900 -.- 8ef3900-err[ ]
					8ef3900-err:::error
					d1 -.- ef2fdcd("a + 1")
					ef2fdcd -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> fj02f523f(( ))
					fj02f523f:::selected
					fj02f523f --> 6bcdf54
					6bcdf54:::selected
					6bcdf54 --> 25cd4c8
					25cd4c8:::selected
					fj02f523f --> aa3d7ce
					aa3d7ce:::selected
					aa3d7ce --> c522839
					c522839:::selected
					j02f523f(( ))
					25cd4c8 --> j02f523f
					c522839 --> j02f523f
					j02f523f:::selected
					j02f523f --> ef2fdcd
					ef2fdcd:::selected
					ef2fdcd --> stop
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
					d0 -.- 7926520[["chunk"]]
					7926520 -.- dbc8ff2[["increment multiple"]]
					dbc8ff2 -.- c9898fb[["a + 2"]]
					c9898fb -.- 3bd5a46("a++")
					3bd5a46 -.- 1ec8e6c("a++")
					dbc8ff2 -.- 266bb3c[["b + 2"]]
					266bb3c -.- abe8e26("b++")
					abe8e26 -.- 031f2b8("b++")
					7926520 -.- 5431fbe[["increment multiple"]]
					5431fbe -.- ed67158[["c + 2"]]
					ed67158 -.- 8156fc6("c++")
					8156fc6 -.- 84e00c4("c++")
					5431fbe -.- 3ae6ed4[["d + 2"]]
					3ae6ed4 -.- d53b7a7("d++")
					d53b7a7 -.- 1e76a89("d++")
					1ec8e6c -.- jb93956d
					031f2b8 -.- jb93956d
					jb93956d(( )) -.- c654704
					84e00c4 -.- j22f7476
					1e76a89 -.- j22f7476
					j22f7476(( )) -.- c654704
					c654704(( ))
					c654704 -.- d1{ }
					d1 -.- 42a0d35[["chunk"]]
					42a0d35 -.- 42a0d35-err[ ]
					42a0d35-err:::error
					d1 -.- c550763[["increment multiple"]]
					c550763 -.- c550763-err[ ]
					c550763-err:::error
					d1 -.- 7d44565[["a + 2"]]
					7d44565 -.- 7d44565-err[ ]
					7d44565-err:::error
					d1 -.- 9f6272c("a++")
					9f6272c -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> f9258371(( ))
					f9258371:::selected
					f9258371 --> fj6750364(( ))
					fj6750364:::selected
					fj6750364 --> 3bd5a46
					3bd5a46:::selected
					3bd5a46 --> 1ec8e6c
					1ec8e6c:::selected
					fj6750364 --> abe8e26
					abe8e26:::selected
					abe8e26 --> 031f2b8
					031f2b8:::selected
					j6750364(( ))
					1ec8e6c --> j6750364
					031f2b8 --> j6750364
					j6750364:::selected
					f9258371 --> fj2640430(( ))
					fj2640430:::selected
					fj2640430 --> 8156fc6
					8156fc6:::selected
					8156fc6 --> 84e00c4
					84e00c4:::selected
					fj2640430 --> d53b7a7
					d53b7a7:::selected
					d53b7a7 --> 1e76a89
					1e76a89:::selected
					j2640430(( ))
					84e00c4 --> j2640430
					1e76a89 --> j2640430
					j2640430:::selected
					9258371(( ))
					j6750364 --> 9258371
					j2640430 --> 9258371
					9258371:::selected
					9258371 --> 9f6272c
					9f6272c:::selected
					9f6272c --> stop
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
					d0 -.- ae76317[["increment counters"]]
					ae76317 -.- 1bda1fb("a + 1")
					1bda1fb -.- 25cd4c8("a + 1")
					25cd4c8 -.- 910b67c("b + 1")
					910b67c -.- c522839("b + 1")
					c522839 -.- d1{ }
					d1 -.- 2899232[["increment counters"]]
					2899232 -.- 2899232-err[ ]
					2899232-err:::error
					d1 -.- ef2fdcd("a + 1")
					ef2fdcd -.- stop(( ))
					stop:::finish
					classDef finish stroke:#000,fill:#000
					start:::selected
					start --> 1bda1fb
					1bda1fb:::selected
					1bda1fb --> 25cd4c8
					25cd4c8:::selected
					25cd4c8 --> 910b67c
					910b67c:::selected
					910b67c --> c522839
					c522839:::selected
					c522839 --> ef2fdcd
					ef2fdcd:::selected
					ef2fdcd --> stop
					classDef error stroke:#f00
					classDef selected stroke:#0f0
				`,
		);
	});
});
