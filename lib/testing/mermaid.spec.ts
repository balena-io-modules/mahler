import { stripIndent } from 'common-tags';
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
			stripIndent`
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
			stripIndent`
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
			stripIndent`
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
			stripIndent`
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
			stripIndent`
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
			stripIndent`
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
			stripIndent`
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
			stripIndent`
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
			parallel: (state: Counters, ctx) =>
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
			stripIndent`
			---
			title: ${this.test!.title}
			---
			graph TD
				start(( ))
				start -.- d0{ }
				d0 -.- ec9e183[["increment counters"]]
				ec9e183 -.- 306db69("a + 1")
				ec9e183 -.- a21ae1f("b + 1")
				306db69 -.- j17bab65
				a21ae1f -.- j17bab65
				j17bab65(( ))
				j17bab65 -.- d1{ }
				d1 -.- c647f08[["increment counters"]]
				c647f08 -.- f435bfd("a + 1")
				c647f08 -.- 832b19f("b + 1")
				f435bfd -.- j0270df9
				832b19f -.- j0270df9
				j0270df9(( ))
				j0270df9 -.- d2{ }
				d2 -.- d90079a[["increment counters"]]
				d90079a -.- d90079a-err[ ]
				d90079a-err:::error
				d2 -.- 2627161("a + 1")
				2627161 -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> fj17bab65(( ))
				fj17bab65:::selected
				fj17bab65 --> 306db69
				306db69:::selected
				fj17bab65 --> a21ae1f
				a21ae1f:::selected
				j17bab65(( ))
				306db69 --> j17bab65
				a21ae1f --> j17bab65
				j17bab65:::selected
				j17bab65 --> fj0270df9(( ))
				fj0270df9:::selected
				fj0270df9 --> f435bfd
				f435bfd:::selected
				fj0270df9 --> 832b19f
				832b19f:::selected
				j0270df9(( ))
				f435bfd --> j0270df9
				832b19f --> j0270df9
				j0270df9:::selected
				j0270df9 --> 2627161
				2627161:::selected
				2627161 --> stop
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
			parallel: (state: Counters, ctx) =>
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
			stripIndent`
			---
			title: ${this.test!.title}
			---
			graph TD
				start(( ))
				start -.- d0{ }
				d0 -.- 9e1cfaf[["increment counters"]]
				9e1cfaf -.- 682aa0e[["increase 'a'"]]
				682aa0e -.- 4b66884("a + 1")
				4b66884 -.- 29aedf2("a + 1")
				9e1cfaf -.- 5dd218c[["increase 'b'"]]
				5dd218c -.- aafffea("b + 1")
				aafffea -.- 17593a3("b + 1")
				29aedf2 -.- j0270df9
				17593a3 -.- j0270df9
				j0270df9(( ))
				j0270df9 -.- d1{ }
				d1 -.- 1e78f4e[["increment counters"]]
				1e78f4e -.- 1e78f4e-err[ ]
				1e78f4e-err:::error
				d1 -.- 976345d[["increase 'a'"]]
				976345d -.- 976345d-err[ ]
				976345d-err:::error
				d1 -.- eb463ce("a + 1")
				eb463ce -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> fj17bab65(( ))
				fj17bab65:::selected
				fj17bab65 --> 4b66884
				4b66884:::selected
				4b66884 --> 29aedf2
				29aedf2:::selected
				fj17bab65 --> aafffea
				aafffea:::selected
				aafffea --> 17593a3
				17593a3:::selected
				j17bab65(( ))
				29aedf2 --> j17bab65
				17593a3 --> j17bab65
				j17bab65:::selected
				j17bab65 --> eb463ce
				eb463ce:::selected
				eb463ce --> stop
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
			parallel: (state: Counters, ctx) =>
				Object.keys(state)
					.filter((k) => ctx.target[k] - state[k] > 1)
					.map((k) => byTwo({ counter: k, target: ctx.target[k] })),
			description: `increment multiple`,
		});

		const chunker = Task.of({
			condition: (state: Counters, ctx) =>
				Object.keys(state).some((k) => ctx.target[k] - state[k] > 1),
			parallel: (state: Counters, ctx) => {
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
			stripIndent`
			---
			title: ${this.test!.title}
			---
			graph TD
				start(( ))
				start -.- d0{ }
				d0 -.- db6e0ff[["chunk"]]
				db6e0ff -.- 6363386[["increment multiple"]]
				6363386 -.- f086833[["a + 2"]]
				f086833 -.- 55f3eb4("a++")
				55f3eb4 -.- c49ebf7("a++")
				6363386 -.- 491551c[["b + 2"]]
				491551c -.- 497f947("b++")
				497f947 -.- f401546("b++")
				db6e0ff -.- a3bcc2f[["increment multiple"]]
				a3bcc2f -.- a6594ae[["c + 2"]]
				a6594ae -.- 7932f99("c++")
				7932f99 -.- 6f42d9e("c++")
				a3bcc2f -.- 9a04ffd[["d + 2"]]
				9a04ffd -.- d8ec9ff("d++")
				d8ec9ff -.- 9e0f26a("d++")
				c49ebf7 -.- j7f6fe40
				f401546 -.- j7f6fe40
				j7f6fe40(( )) -.- 4d89b9e
				6f42d9e -.- jad26c69
				9e0f26a -.- jad26c69
				jad26c69(( )) -.- 4d89b9e
				4d89b9e(( ))
				4d89b9e -.- d1{ }
				d1 -.- e9716b8[["chunk"]]
				e9716b8 -.- e9716b8-err[ ]
				e9716b8-err:::error
				d1 -.- d24469f[["increment multiple"]]
				d24469f -.- d24469f-err[ ]
				d24469f-err:::error
				d1 -.- 8923404[["a + 2"]]
				8923404 -.- 8923404-err[ ]
				8923404-err:::error
				d1 -.- 4664fc1("a++")
				4664fc1 -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> ffbcbfff(( ))
				ffbcbfff:::selected
				ffbcbfff --> fj405808e(( ))
				fj405808e:::selected
				fj405808e --> 55f3eb4
				55f3eb4:::selected
				55f3eb4 --> c49ebf7
				c49ebf7:::selected
				fj405808e --> 497f947
				497f947:::selected
				497f947 --> f401546
				f401546:::selected
				j405808e(( ))
				c49ebf7 --> j405808e
				f401546 --> j405808e
				j405808e:::selected
				ffbcbfff --> fj6c9e279(( ))
				fj6c9e279:::selected
				fj6c9e279 --> 7932f99
				7932f99:::selected
				7932f99 --> 6f42d9e
				6f42d9e:::selected
				fj6c9e279 --> d8ec9ff
				d8ec9ff:::selected
				d8ec9ff --> 9e0f26a
				9e0f26a:::selected
				j6c9e279(( ))
				6f42d9e --> j6c9e279
				9e0f26a --> j6c9e279
				j6c9e279:::selected
				fbcbfff(( ))
				j405808e --> fbcbfff
				j6c9e279 --> fbcbfff
				fbcbfff:::selected
				fbcbfff --> 4664fc1
				4664fc1:::selected
				4664fc1 --> stop
				classDef error stroke:#f00
				classDef selected stroke:#0f0
			`,
		);
	});

	it('draws planning conflicts', function () {
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
			parallel: (state: Counters, ctx) =>
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
			stripIndent`
			---
			title: ${this.test!.title}
			---
			graph TD
				start(( ))
				start -.- d0{ }
				d0 -.- 4eb9782[["increment counters"]]
				4eb9782 -.- 31dcac9("a + 1")
				4eb9782 -.- 31dcac9("a + 1")
				4eb9782 -.- 01f267c("b + 1")
				4eb9782 -.- 01f267c("b + 1")
				01f267c -.- 01f267c-err[ ]
				01f267c-err:::error
				d0 -.- e98197f("a + 1")
				e98197f -.- d1{ }
				d1 -.- ac04f57[["increment counters"]]
				ac04f57 -.- 006821a("a + 1")
				ac04f57 -.- 006821a("a + 1")
				ac04f57 -.- fffbba2("b + 1")
				ac04f57 -.- fffbba2("b + 1")
				fffbba2 -.- fffbba2-err[ ]
				fffbba2-err:::error
				d1 -.- 508e19c("a + 1")
				508e19c -.- d2{ }
				d2 -.- 005b62e[["increment counters"]]
				005b62e -.- 005b62e-err[ ]
				005b62e-err:::error
				d2 -.- 2627161("a + 1")
				2627161 -.- d3{ }
				d3 -.- 8537a4a[["increment counters"]]
				8537a4a -.- 8537a4a-err[ ]
				8537a4a-err:::error
				d3 -.- cc6de07("b + 1")
				cc6de07 -.- d4{ }
				d4 -.- 6c9329a[["increment counters"]]
				6c9329a -.- 6c9329a-err[ ]
				6c9329a-err:::error
				d4 -.- ab7b1e6("b + 1")
				ab7b1e6 -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> e98197f
				e98197f:::selected
				e98197f --> 508e19c
				508e19c:::selected
				508e19c --> 2627161
				2627161:::selected
				2627161 --> cc6de07
				cc6de07:::selected
				cc6de07 --> ab7b1e6
				ab7b1e6:::selected
				ab7b1e6 --> stop
				classDef error stroke:#f00
				classDef selected stroke:#0f0
			`,
		);
	});
});
