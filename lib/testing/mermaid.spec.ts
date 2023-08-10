import { stripIndent } from 'common-tags';
import { expect } from '~/test-utils';
import { mermaid } from './mermaid';
import { Planner } from '../planner';
import { Task } from '../task';

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
				start:::selected
				start --> stop(( ))
				stop:::finish
				classDef error stroke:#f00
				classDef selected stroke:#0f0
				classDef finish stroke:#000,fill:#000
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
				start:::selected
				start --> 772a9a1568b8f28369099d9e335fb42f
				772a9a1568b8f28369099d9e335fb42f:::selected
				772a9a1568b8f28369099d9e335fb42f --> stop(( ))
				stop:::finish
				classDef error stroke:#f00
				classDef selected stroke:#0f0
				classDef finish stroke:#000,fill:#000
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
				start:::selected
				start --> 772a9a1568b8f28369099d9e335fb42f
				772a9a1568b8f28369099d9e335fb42f:::selected
				772a9a1568b8f28369099d9e335fb42f --> stop(( ))
				stop:::finish
				classDef error stroke:#f00
				classDef selected stroke:#0f0
				classDef finish stroke:#000,fill:#000
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
				start:::selected
				start --> ff38ec3561a058c1a52137782038a5c3
				ff38ec3561a058c1a52137782038a5c3:::selected
				ff38ec3561a058c1a52137782038a5c3 --> b8b9b9a7798256c1f23bae9421481387
				b8b9b9a7798256c1f23bae9421481387:::selected
				b8b9b9a7798256c1f23bae9421481387 --> stop(( ))
				stop:::finish
				classDef error stroke:#f00
				classDef selected stroke:#0f0
				classDef finish stroke:#000,fill:#000
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
				start:::selected
				start --> ff38ec3561a058c1a52137782038a5c3
				ff38ec3561a058c1a52137782038a5c3:::selected
				ff38ec3561a058c1a52137782038a5c3 --> b8b9b9a7798256c1f23bae9421481387
				b8b9b9a7798256c1f23bae9421481387:::selected
				b8b9b9a7798256c1f23bae9421481387 --> stop(( ))
				stop:::finish
				classDef error stroke:#f00
				classDef selected stroke:#0f0
				classDef finish stroke:#000,fill:#000
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
				start:::selected
				start --> 772a9a1568b8f28369099d9e335fb42f
				772a9a1568b8f28369099d9e335fb42f:::selected
				772a9a1568b8f28369099d9e335fb42f --> stop(( ))
				stop:::finish
				classDef error stroke:#f00
				classDef selected stroke:#0f0
				classDef finish stroke:#000,fill:#000
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
				start:::selected
				start --> 395d88ae782a478f65d5212175184278
				395d88ae782a478f65d5212175184278:::selected
				395d88ae782a478f65d5212175184278 --> bf4a6a8106e070855f4f76a77c69423e
				bf4a6a8106e070855f4f76a77c69423e:::selected
				bf4a6a8106e070855f4f76a77c69423e --> 0515892ddaee3c96233a4029441d0ca9
				0515892ddaee3c96233a4029441d0ca9:::selected
				0515892ddaee3c96233a4029441d0ca9 --> stop(( ))
				stop:::finish
				classDef error stroke:#f00
				classDef selected stroke:#0f0
				classDef finish stroke:#000,fill:#000
				`.trim(),
		);
	});
});
