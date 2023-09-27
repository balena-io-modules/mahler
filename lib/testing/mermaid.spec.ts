import dedent from 'dedent';
import { expect } from '~/test-utils';
import { mermaid } from './mermaid';
import { Planner } from '../planner';
import { Instruction, Task } from '../task';

describe('Mermaid', () => {
	it('empty plan', function () {
		const trace = mermaid(this.test!.title);
		const planner = Planner.of<number>({ tasks: [], config: { trace } });

		planner.findPlan(0, 0);

		expect(trace.build()).to.deep.equal(
			dedent`
			---
			title: ${this.test!.title}
			---
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
		const trace = mermaid(this.test!.title);
		const planner = Planner.of<number>({ tasks: [], config: { trace } });

		planner.findPlan(0, 1);

		expect(trace.build()).to.deep.equal(
			dedent`
			---
			title: ${this.test!.title}
			---
			graph TD
				start(( ))
				start -.- d0{ }
				start:::error
				classDef error stroke:#f00
			`.trim(),
		);
	});

	it('single action plan', function () {
		const inc = Task.of({
			condition: (state: number, { target }) => state < target,
			effect: (state: number) => state + 1,
			action: async (state: number) => state + 1,
			description: '+1',
		});

		const trace = mermaid(this.test!.title);
		const planner = Planner.of<number>({ tasks: [inc], config: { trace } });

		planner.findPlan(0, 1);

		expect(trace.build()).to.deep.equal(
			dedent`
			---
			title: ${this.test!.title}
			---
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
		const inc = Task.of({
			condition: (state: number, { target }) => state < target,
			effect: (state: number) => state + 1,
			action: async (state: number) => state + 1,
			description: '+1',
		});

		const dec = Task.of({
			condition: (state: number, { target }) => state > target,
			effect: (state: number) => state - 1,
			action: async (state: number) => state - 1,
			description: '-1',
		});

		const trace = mermaid(this.test!.title);
		const planner = Planner.of<number>({
			tasks: [dec, inc],
			config: { trace },
		});

		planner.findPlan(0, 1);

		expect(trace.build()).to.deep.equal(
			dedent`
			---
			title: ${this.test!.title}
			---
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
		const inc = Task.of({
			condition: (state: number, { target }) => state < target,
			effect: (state: number) => state + 1,
			action: async (state: number) => state + 1,
			description: '+1',
		});

		const trace = mermaid(this.test!.title);
		const planner = Planner.of<number>({ tasks: [inc], config: { trace } });

		planner.findPlan(0, 2);

		expect(trace.build()).to.deep.equal(
			dedent`
			---
			title: ${this.test!.title}
			---
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
		const inc = Task.of({
			condition: (state: number, { target }) => state < target,
			effect: (state: number) => state + 1,
			action: async (state: number) => state + 1,
			description: '+1',
		});

		const dec = Task.of({
			condition: (state: number, { target }) => state > target,
			effect: (state: number) => state - 1,
			action: async (state: number) => state - 1,
			description: '-1',
		});

		const trace = mermaid(this.test!.title);
		const planner = Planner.of<number>({
			tasks: [dec, inc],
			config: { trace },
		});

		planner.findPlan(0, 2);

		expect(trace.build()).to.deep.equal(
			dedent`
			---
			title: ${this.test!.title}
			---
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
		const inc = Task.of({
			condition: (state: number, { target }) => state < target,
			effect: (state: number) => state + 1,
			action: async (state: number) => state + 1,
			description: '+1',
		});

		const byTwo = Task.of({
			condition: (state: number, { target }) => target - state > 1,
			method: (_: number, { target }) => [inc({ target }), inc({ target })],
			description: '+2',
		});

		const trace = mermaid(this.test!.title);
		const planner = Planner.of<number>({
			tasks: [byTwo, inc],
			config: { trace },
		});

		planner.findPlan(0, 1);

		expect(trace.build()).to.deep.equal(
			dedent`
			---
			title: ${this.test!.title}
			---
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
		const inc = Task.of({
			condition: (state: number, { target }) => state < target,
			effect: (state: number) => state + 1,
			action: async (state: number) => state + 1,
			description: '+1',
		});

		const byTwo = Task.of({
			condition: (state: number, { target }) => target - state > 1,
			method: (_: number, { target }) => [inc({ target }), inc({ target })],
			description: '+2',
		});

		const trace = mermaid(this.test!.title);
		const planner = Planner.of<number>({
			tasks: [byTwo, inc],
			config: { trace },
		});

		planner.findPlan(0, 3);

		expect(trace.build()).to.deep.equal(
			dedent`
			---
			title: ${this.test!.title}
			---
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

	it('parallel tasks without methods', function () {
		type Counters = { [k: string]: number };

		const byOne = Task.of({
			path: '/:counter',
			condition: (state: Counters, ctx) => ctx.get(state) < ctx.target,
			effect: (state: Counters, ctx) => ctx.set(state, ctx.get(state) + 1),
			description: ({ counter }) => `${counter} + 1`,
		});

		const multiIncrement = Task.of({
			condition: (state: Counters, ctx) =>
				Object.keys(state).filter((k) => ctx.target[k] - state[k] > 0).length >
				1,
			method: (state: Counters, ctx) =>
				Object.keys(state)
					.filter((k) => ctx.target[k] - state[k] > 0)
					.map((k) => byOne({ counter: k, target: ctx.target[k] })),
			description: `increment counters`,
		});

		const trace = mermaid(this.test!.title);
		const planner = Planner.of({
			tasks: [multiIncrement, byOne],
			config: { trace },
		});

		planner.findPlan({ a: 0, b: 0 }, { a: 3, b: 2 });
		expect(trace.build()).to.deep.equal(
			dedent`
			---
			title: ${this.test!.title}
			---
			graph TD
				start(( ))
				start -.- d0{ }
				d0 -.- 588eea4[["increment counters"]]
				588eea4 -.- 0874e9a("a + 1")
				588eea4 -.- ef61a3a("b + 1")
				0874e9a -.- jf4ad1f3
				ef61a3a -.- jf4ad1f3
				jf4ad1f3(( ))
				jf4ad1f3 -.- d1{ }
				d1 -.- c5108a8[["increment counters"]]
				c5108a8 -.- 99bf28d("a + 1")
				c5108a8 -.- bd9e0b4("b + 1")
				99bf28d -.- j9ed3ea0
				bd9e0b4 -.- j9ed3ea0
				j9ed3ea0(( ))
				j9ed3ea0 -.- d2{ }
				d2 -.- ee9e70b[["increment counters"]]
				ee9e70b -.- ee9e70b-err[ ]
				ee9e70b-err:::error
				d2 -.- cea1c98("a + 1")
				cea1c98 -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> fjf4ad1f3(( ))
				fjf4ad1f3:::selected
				fjf4ad1f3 --> 0874e9a
				0874e9a:::selected
				fjf4ad1f3 --> ef61a3a
				ef61a3a:::selected
				jf4ad1f3(( ))
				0874e9a --> jf4ad1f3
				ef61a3a --> jf4ad1f3
				jf4ad1f3:::selected
				jf4ad1f3 --> fj9ed3ea0(( ))
				fj9ed3ea0:::selected
				fj9ed3ea0 --> 99bf28d
				99bf28d:::selected
				fj9ed3ea0 --> bd9e0b4
				bd9e0b4:::selected
				j9ed3ea0(( ))
				99bf28d --> j9ed3ea0
				bd9e0b4 --> j9ed3ea0
				j9ed3ea0:::selected
				j9ed3ea0 --> cea1c98
				cea1c98:::selected
				cea1c98 --> stop
				classDef error stroke:#f00
				classDef selected stroke:#0f0
			`,
		);
	});

	it('parallel tasks with methods', function () {
		type Counters = { [k: string]: number };

		const byOne = Task.of({
			path: '/:counter',
			condition: (state: Counters, ctx) => ctx.get(state) < ctx.target,
			effect: (state: Counters, ctx) => ctx.set(state, ctx.get(state) + 1),
			description: ({ counter }) => `${counter} + 1`,
		});

		const byTwo = Task.of({
			path: '/:counter',
			condition: (state: Counters, ctx) => ctx.target - ctx.get(state) > 1,
			method: (_: Counters, ctx) => [byOne({ ...ctx }), byOne({ ...ctx })],
			description: ({ counter }) => `increase '${counter}'`,
		});

		const multiIncrement = Task.of({
			condition: (state: Counters, ctx) =>
				Object.keys(state).some((k) => ctx.target[k] - state[k] > 1),
			method: (state: Counters, ctx) =>
				Object.keys(state)
					.filter((k) => ctx.target[k] - state[k] > 1)
					.map((k) => byTwo({ counter: k, target: ctx.target[k] })),
			description: `increment counters`,
		});

		const trace = mermaid(this.test!.title);
		const planner = Planner.of({
			tasks: [multiIncrement, byTwo, byOne],
			config: { trace },
		});
		planner.findPlan({ a: 0, b: 0 }, { a: 3, b: 2 });
		expect(trace.build()).to.deep.equal(
			dedent`
			---
			title: ${this.test!.title}
			---
			graph TD
				start(( ))
				start -.- d0{ }
				d0 -.- 2396eea[["increment counters"]]
				2396eea -.- 682aa0e[["increase 'a'"]]
				682aa0e -.- f900ff9("a + 1")
				f900ff9 -.- 00e5bb0("a + 1")
				2396eea -.- 5dd218c[["increase 'b'"]]
				5dd218c -.- 22ef581("b + 1")
				22ef581 -.- d11a32a("b + 1")
				00e5bb0 -.- j9ed3ea0
				d11a32a -.- j9ed3ea0
				j9ed3ea0(( ))
				j9ed3ea0 -.- d1{ }
				d1 -.- 7de2726[["increment counters"]]
				7de2726 -.- 7de2726-err[ ]
				7de2726-err:::error
				d1 -.- 976345d[["increase 'a'"]]
				976345d -.- 976345d-err[ ]
				976345d-err:::error
				d1 -.- 2f364fb("a + 1")
				2f364fb -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> fjf4ad1f3(( ))
				fjf4ad1f3:::selected
				fjf4ad1f3 --> f900ff9
				f900ff9:::selected
				f900ff9 --> 00e5bb0
				00e5bb0:::selected
				fjf4ad1f3 --> 22ef581
				22ef581:::selected
				22ef581 --> d11a32a
				d11a32a:::selected
				jf4ad1f3(( ))
				00e5bb0 --> jf4ad1f3
				d11a32a --> jf4ad1f3
				jf4ad1f3:::selected
				jf4ad1f3 --> 2f364fb
				2f364fb:::selected
				2f364fb --> stop
				classDef error stroke:#f00
				classDef selected stroke:#0f0
			`,
		);
	});

	it('parallel tasks with nested forks', function () {
		type Counters = { [k: string]: number };

		const byOne = Task.of({
			path: '/:counter',
			condition: (state: Counters, ctx) => ctx.get(state) < ctx.target,
			effect: (state: Counters, ctx) => ctx.set(state, ctx.get(state) + 1),
			description: ({ counter }) => `${counter}++`,
		});

		const byTwo = Task.of({
			path: '/:counter',
			condition: (state: Counters, ctx) => ctx.target - ctx.get(state) > 1,
			method: (_: Counters, ctx) => [byOne({ ...ctx }), byOne({ ...ctx })],
			description: ({ counter }) => `${counter} + 2`,
		});

		const multiIncrement = Task.of({
			condition: (state: Counters, ctx) =>
				Object.keys(state).some((k) => ctx.target[k] - state[k] > 1),
			method: (state: Counters, ctx) =>
				Object.keys(state)
					.filter((k) => ctx.target[k] - state[k] > 1)
					.map((k) => byTwo({ counter: k, target: ctx.target[k] })),
			description: `increment multiple`,
		});

		const chunker = Task.of({
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

		const trace = mermaid(this.test!.title);
		const planner = Planner.of({
			tasks: [chunker, multiIncrement, byTwo, byOne],
			config: { trace },
		});
		planner.findPlan({ a: 0, b: 0, c: 0, d: 0 }, { a: 3, b: 2, c: 2, d: 2 });
		expect(trace.build()).to.deep.equal(
			dedent`
			---
			title: ${this.test!.title}
			---
			graph TD
				start(( ))
				start -.- d0{ }
				d0 -.- 16c4cee[["chunk"]]
				16c4cee -.- 85de134[["increment multiple"]]
				85de134 -.- f086833[["a + 2"]]
				f086833 -.- b97653c("a++")
				b97653c -.- fdd46f5("a++")
				85de134 -.- 491551c[["b + 2"]]
				491551c -.- 76d9b13("b++")
				76d9b13 -.- 0d8a6c4("b++")
				16c4cee -.- 14b5abe[["increment multiple"]]
				14b5abe -.- a6594ae[["c + 2"]]
				a6594ae -.- fb528c3("c++")
				fb528c3 -.- d7c9a30("c++")
				14b5abe -.- 9a04ffd[["d + 2"]]
				9a04ffd -.- b0c761f("d++")
				b0c761f -.- d970700("d++")
				fdd46f5 -.- jef318f8
				0d8a6c4 -.- jef318f8
				jef318f8(( )) -.- 25e807e
				d7c9a30 -.- j902d46d
				d970700 -.- j902d46d
				j902d46d(( )) -.- 25e807e
				25e807e(( ))
				25e807e -.- d1{ }
				d1 -.- cb79260[["chunk"]]
				cb79260 -.- cb79260-err[ ]
				cb79260-err:::error
				d1 -.- a65b91b[["increment multiple"]]
				a65b91b -.- a65b91b-err[ ]
				a65b91b-err:::error
				d1 -.- 8923404[["a + 2"]]
				8923404 -.- 8923404-err[ ]
				8923404-err:::error
				d1 -.- 7a51307("a++")
				7a51307 -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> f3a3585e(( ))
				f3a3585e:::selected
				f3a3585e --> fjb462b59(( ))
				fjb462b59:::selected
				fjb462b59 --> b97653c
				b97653c:::selected
				b97653c --> fdd46f5
				fdd46f5:::selected
				fjb462b59 --> 76d9b13
				76d9b13:::selected
				76d9b13 --> 0d8a6c4
				0d8a6c4:::selected
				jb462b59(( ))
				fdd46f5 --> jb462b59
				0d8a6c4 --> jb462b59
				jb462b59:::selected
				f3a3585e --> fj47a9bc7(( ))
				fj47a9bc7:::selected
				fj47a9bc7 --> fb528c3
				fb528c3:::selected
				fb528c3 --> d7c9a30
				d7c9a30:::selected
				fj47a9bc7 --> b0c761f
				b0c761f:::selected
				b0c761f --> d970700
				d970700:::selected
				j47a9bc7(( ))
				d7c9a30 --> j47a9bc7
				d970700 --> j47a9bc7
				j47a9bc7:::selected
				3a3585e(( ))
				jb462b59 --> 3a3585e
				j47a9bc7 --> 3a3585e
				3a3585e:::selected
				3a3585e --> 7a51307
				7a51307:::selected
				7a51307 --> stop
				classDef error stroke:#f00
				classDef selected stroke:#0f0
			`,
		);
	});

	it('draws sequential plan when backtracking is reported', function () {
		type Counters = { [k: string]: number };

		const byOne = Task.of({
			path: '/:counter',
			condition: (state: Counters, ctx) => ctx.get(state) < ctx.target,
			effect: (state: Counters, ctx) => ctx.set(state, ctx.get(state) + 1),
			description: ({ counter }) => `${counter} + 1`,
		});

		const conflictingIncrement = Task.of({
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

		const trace = mermaid(this.test!.title);
		const planner = Planner.of({
			tasks: [conflictingIncrement, byOne],
			config: { trace },
		});

		planner.findPlan({ a: 0, b: 0 }, { a: 3, b: 2 });
		expect(trace.build()).to.deep.equal(
			dedent`
			---
			title: ${this.test!.title}
			---
			graph TD
				start(( ))
				start -.- d0{ }
				d0 -.- 817288c[["increment counters"]]
				817288c -.- 570ec53("a + 1")
				570ec53 -.- 00e5bb0("a + 1")
				00e5bb0 -.- 78cc211("b + 1")
				78cc211 -.- d11a32a("b + 1")
				d11a32a -.- d1{ }
				d1 -.- 4b2ca33[["increment counters"]]
				4b2ca33 -.- 4b2ca33-err[ ]
				4b2ca33-err:::error
				d1 -.- 2f364fb("a + 1")
				2f364fb -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> 570ec53
				570ec53:::selected
				570ec53 --> 00e5bb0
				00e5bb0:::selected
				00e5bb0 --> 78cc211
				78cc211:::selected
				78cc211 --> d11a32a
				d11a32a:::selected
				d11a32a --> 2f364fb
				2f364fb:::selected
				2f364fb --> stop
				classDef error stroke:#f00
				classDef selected stroke:#0f0
			`,
		);
	});
});
