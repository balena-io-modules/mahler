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

		// We set the task id for testing purposes
		// @ts-ignore
		inc.id = 'inc';

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
				d0 -.- 772a9a1568b8f28369099d9e335fb42f("+1")
				772a9a1568b8f28369099d9e335fb42f -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> 772a9a1568b8f28369099d9e335fb42f
				772a9a1568b8f28369099d9e335fb42f:::selected
				772a9a1568b8f28369099d9e335fb42f --> stop
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

		// We set the task id for testing purposes
		// @ts-ignore
		inc.id = 'inc';

		const dec = Task.of({
			condition: (state: number, { target }) => state > target,
			effect: (state: number) => state - 1,
			action: async (state: number) => state - 1,
			description: '-1',
		});

		// @ts-ignore
		dec.id = 'dec';

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
				d0 -.- 138f1a133ce5d9c83f4c0cf77634b761("-1")
				138f1a133ce5d9c83f4c0cf77634b761 -.- 138f1a133ce5d9c83f4c0cf77634b761-err[ ]
				138f1a133ce5d9c83f4c0cf77634b761-err:::error
				d0 -.- 772a9a1568b8f28369099d9e335fb42f("+1")
				772a9a1568b8f28369099d9e335fb42f -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> 772a9a1568b8f28369099d9e335fb42f
				772a9a1568b8f28369099d9e335fb42f:::selected
				772a9a1568b8f28369099d9e335fb42f --> stop
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

		// We set the task id for testing purposes
		// @ts-ignore
		inc.id = 'inc';

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
				d0 -.- ff38ec3561a058c1a52137782038a5c3("+1")
				ff38ec3561a058c1a52137782038a5c3 -.- d1{ }
				d1 -.- b8b9b9a7798256c1f23bae9421481387("+1")
				b8b9b9a7798256c1f23bae9421481387 -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> ff38ec3561a058c1a52137782038a5c3
				ff38ec3561a058c1a52137782038a5c3:::selected
				ff38ec3561a058c1a52137782038a5c3 --> b8b9b9a7798256c1f23bae9421481387
				b8b9b9a7798256c1f23bae9421481387:::selected
				b8b9b9a7798256c1f23bae9421481387 --> stop
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

		// We set the task id for testing purposes
		// @ts-ignore
		inc.id = 'inc';

		const dec = Task.of({
			condition: (state: number, { target }) => state > target,
			effect: (state: number) => state - 1,
			action: async (state: number) => state - 1,
			description: '-1',
		});

		// @ts-ignore
		dec.id = 'dec';

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
				d0 -.- 4cfbbb2264b56bf0abd33bb233643df9("-1")
				4cfbbb2264b56bf0abd33bb233643df9 -.- 4cfbbb2264b56bf0abd33bb233643df9-err[ ]
				4cfbbb2264b56bf0abd33bb233643df9-err:::error
				d0 -.- ff38ec3561a058c1a52137782038a5c3("+1")
				ff38ec3561a058c1a52137782038a5c3 -.- d1{ }
				d1 -.- feff79907a92497ef44a76c8c74a46f8("-1")
				feff79907a92497ef44a76c8c74a46f8 -.- feff79907a92497ef44a76c8c74a46f8-err[ ]
				feff79907a92497ef44a76c8c74a46f8-err:::error
				d1 -.- b8b9b9a7798256c1f23bae9421481387("+1")
				b8b9b9a7798256c1f23bae9421481387 -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> ff38ec3561a058c1a52137782038a5c3
				ff38ec3561a058c1a52137782038a5c3:::selected
				ff38ec3561a058c1a52137782038a5c3 --> b8b9b9a7798256c1f23bae9421481387
				b8b9b9a7798256c1f23bae9421481387:::selected
				b8b9b9a7798256c1f23bae9421481387 --> stop
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

		// We set the task id for testing purposes
		// @ts-ignore
		inc.id = 'inc';

		const byTwo = Task.of({
			condition: (state: number, { target }) => target - state > 1,
			method: (_: number, { target }) => [inc({ target }), inc({ target })],
			description: '+2',
		});

		// @ts-ignore
		byTwo.id = 'byTwo';

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
				d0 -.- 349b2493f3df73da2a9d999028d77c4f[["+2"]]
				349b2493f3df73da2a9d999028d77c4f -.- 349b2493f3df73da2a9d999028d77c4f-err[ ]
				349b2493f3df73da2a9d999028d77c4f-err:::error
				d0 -.- 772a9a1568b8f28369099d9e335fb42f("+1")
				772a9a1568b8f28369099d9e335fb42f -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> 772a9a1568b8f28369099d9e335fb42f
				772a9a1568b8f28369099d9e335fb42f:::selected
				772a9a1568b8f28369099d9e335fb42f --> stop
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

		// We set the task id for testing purposes
		// @ts-ignore
		inc.id = 'inc';

		const byTwo = Task.of({
			condition: (state: number, { target }) => target - state > 1,
			method: (_: number, { target }) => [inc({ target }), inc({ target })],
			description: '+2',
		});

		// @ts-ignore
		byTwo.id = 'byTwo';

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
				d0 -.- f852697376867f54d20adf463b8e123e[["+2"]]
				f852697376867f54d20adf463b8e123e -.- 395d88ae782a478f65d5212175184278("+1")
				395d88ae782a478f65d5212175184278 -.- bf4a6a8106e070855f4f76a77c69423e("+1")
				bf4a6a8106e070855f4f76a77c69423e -.- d1{ }
				d1 -.- 42e963e124dceaf78e691e41268913b7[["+2"]]
				42e963e124dceaf78e691e41268913b7 -.- 42e963e124dceaf78e691e41268913b7-err[ ]
				42e963e124dceaf78e691e41268913b7-err:::error
				d1 -.- 0515892ddaee3c96233a4029441d0ca9("+1")
				0515892ddaee3c96233a4029441d0ca9 -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> 395d88ae782a478f65d5212175184278
				395d88ae782a478f65d5212175184278:::selected
				395d88ae782a478f65d5212175184278 --> bf4a6a8106e070855f4f76a77c69423e
				bf4a6a8106e070855f4f76a77c69423e:::selected
				bf4a6a8106e070855f4f76a77c69423e --> 0515892ddaee3c96233a4029441d0ca9
				0515892ddaee3c96233a4029441d0ca9:::selected
				0515892ddaee3c96233a4029441d0ca9 --> stop
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
				d0 -.- ec9e18323b4b7f03b5320d8dedb64648[["increment counters"]]
				ec9e18323b4b7f03b5320d8dedb64648 -.- 17bab65fe43e1a164835f79216e6e294("a + 1")
				ec9e18323b4b7f03b5320d8dedb64648 -.- 1e49de1bd8a6ec9d1cc893248d2e01c4("b + 1")
				17bab65fe43e1a164835f79216e6e294 -.- j17bab65fe43e1a164835f79216e6e294
				1e49de1bd8a6ec9d1cc893248d2e01c4 -.- j17bab65fe43e1a164835f79216e6e294
				j17bab65fe43e1a164835f79216e6e294(( ))
				j17bab65fe43e1a164835f79216e6e294 -.- d1{ }
				d1 -.- c647f08071136037dfe15b6e8b821668[["increment counters"]]
				c647f08071136037dfe15b6e8b821668 -.- 0270df9752e78e64ef091c988f40221f("a + 1")
				c647f08071136037dfe15b6e8b821668 -.- 4b98d7ba48c25c28fb84cb5966c6d991("b + 1")
				0270df9752e78e64ef091c988f40221f -.- j0270df9752e78e64ef091c988f40221f
				4b98d7ba48c25c28fb84cb5966c6d991 -.- j0270df9752e78e64ef091c988f40221f
				j0270df9752e78e64ef091c988f40221f(( ))
				j0270df9752e78e64ef091c988f40221f -.- d2{ }
				d2 -.- d90079a8aa4531312d73e9034e49b84a[["increment counters"]]
				d90079a8aa4531312d73e9034e49b84a -.- d90079a8aa4531312d73e9034e49b84a-err[ ]
				d90079a8aa4531312d73e9034e49b84a-err:::error
				d2 -.- bd37a0fcd07979656230588d045b56c1("a + 1")
				bd37a0fcd07979656230588d045b56c1 -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> fj17bab65fe43e1a164835f79216e6e294(( ))
				fj17bab65fe43e1a164835f79216e6e294:::selected
				fj17bab65fe43e1a164835f79216e6e294 --> 17bab65fe43e1a164835f79216e6e294
				17bab65fe43e1a164835f79216e6e294:::selected
				fj17bab65fe43e1a164835f79216e6e294 --> 1e49de1bd8a6ec9d1cc893248d2e01c4
				1e49de1bd8a6ec9d1cc893248d2e01c4:::selected
				j17bab65fe43e1a164835f79216e6e294(( ))
				17bab65fe43e1a164835f79216e6e294 --> j17bab65fe43e1a164835f79216e6e294
				1e49de1bd8a6ec9d1cc893248d2e01c4 --> j17bab65fe43e1a164835f79216e6e294
				j17bab65fe43e1a164835f79216e6e294:::selected
				j17bab65fe43e1a164835f79216e6e294 --> fj0270df9752e78e64ef091c988f40221f(( ))
				fj0270df9752e78e64ef091c988f40221f:::selected
				fj0270df9752e78e64ef091c988f40221f --> 0270df9752e78e64ef091c988f40221f
				0270df9752e78e64ef091c988f40221f:::selected
				fj0270df9752e78e64ef091c988f40221f --> 4b98d7ba48c25c28fb84cb5966c6d991
				4b98d7ba48c25c28fb84cb5966c6d991:::selected
				j0270df9752e78e64ef091c988f40221f(( ))
				0270df9752e78e64ef091c988f40221f --> j0270df9752e78e64ef091c988f40221f
				4b98d7ba48c25c28fb84cb5966c6d991 --> j0270df9752e78e64ef091c988f40221f
				j0270df9752e78e64ef091c988f40221f:::selected
				j0270df9752e78e64ef091c988f40221f --> bd37a0fcd07979656230588d045b56c1
				bd37a0fcd07979656230588d045b56c1:::selected
				bd37a0fcd07979656230588d045b56c1 --> stop
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
				d0 -.- 9e1cfaf4acf6a9980b7cd43f1731f6c2[["increment counters"]]
				9e1cfaf4acf6a9980b7cd43f1731f6c2 -.- 682aa0eed0e50f962bd4ce622e5880dc[["increase 'a'"]]
				682aa0eed0e50f962bd4ce622e5880dc -.- 17bab65fe43e1a164835f79216e6e294("a + 1")
				17bab65fe43e1a164835f79216e6e294 -.- 0270df9752e78e64ef091c988f40221f("a + 1")
				9e1cfaf4acf6a9980b7cd43f1731f6c2 -.- 5dd218c06719f45d376ec683c77fa7c7[["increase 'b'"]]
				5dd218c06719f45d376ec683c77fa7c7 -.- 1e49de1bd8a6ec9d1cc893248d2e01c4("b + 1")
				1e49de1bd8a6ec9d1cc893248d2e01c4 -.- 4b98d7ba48c25c28fb84cb5966c6d991("b + 1")
				0270df9752e78e64ef091c988f40221f -.- j0270df9752e78e64ef091c988f40221f
				4b98d7ba48c25c28fb84cb5966c6d991 -.- j0270df9752e78e64ef091c988f40221f
				j0270df9752e78e64ef091c988f40221f(( ))
				j0270df9752e78e64ef091c988f40221f -.- d1{ }
				d1 -.- 1e78f4e62ab3b42f27f93f19b688d1da[["increment counters"]]
				1e78f4e62ab3b42f27f93f19b688d1da -.- 1e78f4e62ab3b42f27f93f19b688d1da-err[ ]
				1e78f4e62ab3b42f27f93f19b688d1da-err:::error
				d1 -.- 976345da088c6d069c0eec70d9ab0a1f[["increase 'a'"]]
				976345da088c6d069c0eec70d9ab0a1f -.- 976345da088c6d069c0eec70d9ab0a1f-err[ ]
				976345da088c6d069c0eec70d9ab0a1f-err:::error
				d1 -.- bd37a0fcd07979656230588d045b56c1("a + 1")
				bd37a0fcd07979656230588d045b56c1 -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> fj17bab65fe43e1a164835f79216e6e294(( ))
				fj17bab65fe43e1a164835f79216e6e294:::selected
				fj17bab65fe43e1a164835f79216e6e294 --> 17bab65fe43e1a164835f79216e6e294
				17bab65fe43e1a164835f79216e6e294:::selected
				17bab65fe43e1a164835f79216e6e294 --> 0270df9752e78e64ef091c988f40221f
				0270df9752e78e64ef091c988f40221f:::selected
				fj17bab65fe43e1a164835f79216e6e294 --> 1e49de1bd8a6ec9d1cc893248d2e01c4
				1e49de1bd8a6ec9d1cc893248d2e01c4:::selected
				1e49de1bd8a6ec9d1cc893248d2e01c4 --> 4b98d7ba48c25c28fb84cb5966c6d991
				4b98d7ba48c25c28fb84cb5966c6d991:::selected
				j17bab65fe43e1a164835f79216e6e294(( ))
				0270df9752e78e64ef091c988f40221f --> j17bab65fe43e1a164835f79216e6e294
				4b98d7ba48c25c28fb84cb5966c6d991 --> j17bab65fe43e1a164835f79216e6e294
				j17bab65fe43e1a164835f79216e6e294:::selected
				j17bab65fe43e1a164835f79216e6e294 --> bd37a0fcd07979656230588d045b56c1
				bd37a0fcd07979656230588d045b56c1:::selected
				bd37a0fcd07979656230588d045b56c1 --> stop
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
			title: parallel tasks with nested forks
			---
			graph TD
				start(( ))
				start -.- d0{ }
				d0 -.- db6e0ff78a918ca23297dcb9307068a1[["chunk"]]
				db6e0ff78a918ca23297dcb9307068a1 -.- 63633863c8dcc6b6c5c2d1602657e857[["increment multiple"]]
				63633863c8dcc6b6c5c2d1602657e857 -.- f086833b8ed23e33cb3f0393a5348416[["a + 2"]]
				f086833b8ed23e33cb3f0393a5348416 -.- 405808e925e8bf295a6331c8b5651c89("a++")
				405808e925e8bf295a6331c8b5651c89 -.- 7f6fe40a17f05f9871667cff213ede95("a++")
				63633863c8dcc6b6c5c2d1602657e857 -.- 491551c5728cb41b2afae6abdf1bedf0[["b + 2"]]
				491551c5728cb41b2afae6abdf1bedf0 -.- b7e3d255fdb6292cba9f6257abbcac04("b++")
				b7e3d255fdb6292cba9f6257abbcac04 -.- f247196cedc025892bcbfb620b49830c("b++")
				db6e0ff78a918ca23297dcb9307068a1 -.- a3bcc2f9620dff2e14b1135c01f20826[["increment multiple"]]
				a3bcc2f9620dff2e14b1135c01f20826 -.- a6594ae55a1c3e0c89e6f1ee7d64ad3c[["c + 2"]]
				a6594ae55a1c3e0c89e6f1ee7d64ad3c -.- 6c9e279c5c2fd3f6c07ff73a0b0b850f("c++")
				6c9e279c5c2fd3f6c07ff73a0b0b850f -.- ad26c6928e2005e71d876cbfb4ae1746("c++")
				a3bcc2f9620dff2e14b1135c01f20826 -.- 9a04ffdda7a6ff0fd4a922c8ec336da0[["d + 2"]]
				9a04ffdda7a6ff0fd4a922c8ec336da0 -.- d2b0c63363c1af4ffdfef3c262280749("d++")
				d2b0c63363c1af4ffdfef3c262280749 -.- a68cfba1eae3ef34e9e38fb91c154301("d++")
				7f6fe40a17f05f9871667cff213ede95 -.- j7f6fe40a17f05f9871667cff213ede95
				f247196cedc025892bcbfb620b49830c -.- j7f6fe40a17f05f9871667cff213ede95
				j7f6fe40a17f05f9871667cff213ede95(( )) -.- j857eb55bef6b937da630c6e163bf28a6
				ad26c6928e2005e71d876cbfb4ae1746 -.- jad26c6928e2005e71d876cbfb4ae1746
				a68cfba1eae3ef34e9e38fb91c154301 -.- jad26c6928e2005e71d876cbfb4ae1746
				jad26c6928e2005e71d876cbfb4ae1746(( )) -.- j857eb55bef6b937da630c6e163bf28a6
				j857eb55bef6b937da630c6e163bf28a6(( ))
				j857eb55bef6b937da630c6e163bf28a6 -.- d1{ }
				d1 -.- e9716b823d1aff4082ceb1a88aa9c6c0[["chunk"]]
				e9716b823d1aff4082ceb1a88aa9c6c0 -.- e9716b823d1aff4082ceb1a88aa9c6c0-err[ ]
				e9716b823d1aff4082ceb1a88aa9c6c0-err:::error
				d1 -.- d24469fed8041954fd821b3a4b25f4e8[["increment multiple"]]
				d24469fed8041954fd821b3a4b25f4e8 -.- d24469fed8041954fd821b3a4b25f4e8-err[ ]
				d24469fed8041954fd821b3a4b25f4e8-err:::error
				d1 -.- 892340421eded49522a76952e53ad8ff[["a + 2"]]
				892340421eded49522a76952e53ad8ff -.- 892340421eded49522a76952e53ad8ff-err[ ]
				892340421eded49522a76952e53ad8ff-err:::error
				d1 -.- 8c5905a95b301404eb0e5edbfd79c221("a++")
				8c5905a95b301404eb0e5edbfd79c221 -.- stop(( ))
				stop:::finish
				classDef finish stroke:#000,fill:#000
				start:::selected
				start --> fj639bc68a7c6b7856dca0d1d278fd0b76(( ))
				fj639bc68a7c6b7856dca0d1d278fd0b76:::selected
				fj639bc68a7c6b7856dca0d1d278fd0b76 --> fj405808e925e8bf295a6331c8b5651c89(( ))
				fj405808e925e8bf295a6331c8b5651c89:::selected
				fj405808e925e8bf295a6331c8b5651c89 --> 405808e925e8bf295a6331c8b5651c89
				405808e925e8bf295a6331c8b5651c89:::selected
				405808e925e8bf295a6331c8b5651c89 --> 7f6fe40a17f05f9871667cff213ede95
				7f6fe40a17f05f9871667cff213ede95:::selected
				fj405808e925e8bf295a6331c8b5651c89 --> b7e3d255fdb6292cba9f6257abbcac04
				b7e3d255fdb6292cba9f6257abbcac04:::selected
				b7e3d255fdb6292cba9f6257abbcac04 --> f247196cedc025892bcbfb620b49830c
				f247196cedc025892bcbfb620b49830c:::selected
				j405808e925e8bf295a6331c8b5651c89(( ))
				7f6fe40a17f05f9871667cff213ede95 --> j405808e925e8bf295a6331c8b5651c89
				f247196cedc025892bcbfb620b49830c --> j405808e925e8bf295a6331c8b5651c89
				j405808e925e8bf295a6331c8b5651c89:::selected
				fj639bc68a7c6b7856dca0d1d278fd0b76 --> fj6c9e279c5c2fd3f6c07ff73a0b0b850f(( ))
				fj6c9e279c5c2fd3f6c07ff73a0b0b850f:::selected
				fj6c9e279c5c2fd3f6c07ff73a0b0b850f --> 6c9e279c5c2fd3f6c07ff73a0b0b850f
				6c9e279c5c2fd3f6c07ff73a0b0b850f:::selected
				6c9e279c5c2fd3f6c07ff73a0b0b850f --> ad26c6928e2005e71d876cbfb4ae1746
				ad26c6928e2005e71d876cbfb4ae1746:::selected
				fj6c9e279c5c2fd3f6c07ff73a0b0b850f --> d2b0c63363c1af4ffdfef3c262280749
				d2b0c63363c1af4ffdfef3c262280749:::selected
				d2b0c63363c1af4ffdfef3c262280749 --> a68cfba1eae3ef34e9e38fb91c154301
				a68cfba1eae3ef34e9e38fb91c154301:::selected
				j6c9e279c5c2fd3f6c07ff73a0b0b850f(( ))
				ad26c6928e2005e71d876cbfb4ae1746 --> j6c9e279c5c2fd3f6c07ff73a0b0b850f
				a68cfba1eae3ef34e9e38fb91c154301 --> j6c9e279c5c2fd3f6c07ff73a0b0b850f
				j6c9e279c5c2fd3f6c07ff73a0b0b850f:::selected
				j639bc68a7c6b7856dca0d1d278fd0b76(( ))
				j405808e925e8bf295a6331c8b5651c89 --> j639bc68a7c6b7856dca0d1d278fd0b76
				j6c9e279c5c2fd3f6c07ff73a0b0b850f --> j639bc68a7c6b7856dca0d1d278fd0b76
				j639bc68a7c6b7856dca0d1d278fd0b76:::selected
				j639bc68a7c6b7856dca0d1d278fd0b76 --> 8c5905a95b301404eb0e5edbfd79c221
				8c5905a95b301404eb0e5edbfd79c221:::selected
				8c5905a95b301404eb0e5edbfd79c221 --> stop
				classDef error stroke:#f00
				classDef selected stroke:#0f0
			`,
		);
	});
});
