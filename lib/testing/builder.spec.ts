import { expect } from '~/test-utils';
import { plan, branch, fork } from './builder';
import { DAG } from './dag';
import dedent from 'dedent';

describe('testing/builder', () => {
	it('builds a plan representation', () => {
		expect(plan().dag()).to.deep.equal([]);
		expect(plan().end()).to.deep.equal('');
		expect(plan().action('a').dag()).to.deep.equal(['a']);
		expect(plan().action('a').end()).to.deep.equal(
			dedent`
				- a
			`,
		);
		expect(plan().action('a').action('b').action('c').dag()).to.deep.equal([
			'a',
			'b',
			'c',
		]);
		expect(plan().action('a').action('b').action('c').end()).to.deep.equal(
			dedent`
				- a
				- b
				- c
			`,
		);
	});

	it('builds a plan with parallel branches', () => {
		expect(
			plan().action('a').fork(branch('b', 'c'), branch('d')).action('f').dag(),
		).to.deep.equal(['a', [['b', 'c'], ['d']], 'f']);
		expect(
			plan().action('a').fork(branch('b', 'c'), branch('d')).action('f').end(),
		).to.deep.equal(
			dedent`
        - a
        + ~ - b
            - c
          ~ - d
        - f
      `,
		);

		const p = plan()
			.fork(branch('a', fork(branch('c'), branch('d'))), branch('b'))
			.action('f');
		expect(p.dag()).to.deep.equal([[['a', [['c'], ['d']]], ['b']], 'f']);
		expect(p.end()).to.deep.equal(
			dedent`
        + ~ - a
            + ~ - c
              ~ - d
          ~ - b
        - f
  			`,
		);
	});

	it('collapses empty branches', () => {
		// Add an empty fork to the plan
		expect(plan().action('a').fork().action('f').dag()).to.deep.equal([
			'a',
			'f',
		]);
		const p = plan().action('a').fork(branch('b', 'c'), branch()).action('f');

		expect(p.dag()).to.deep.equal(['a', [['b', 'c']], 'f']);
		expect(p.end()).to.deep.equal(
			dedent`
        - a
        + ~ - b
            - c
        - f
    		`,
		);
	});

	it('builds a plan with just forks', () => {
		const p = plan()
			.fork(branch('a + 1'), branch('b + 1'))
			.fork(branch('a + 1'), branch('b + 1'));

		expect(p.dag()).to.deep.equal([
			[['a + 1'], ['b + 1']],
			[['a + 1'], ['b + 1']],
		]);
		expect(p.end()).to.deep.equal(
			dedent`
        + ~ - a + 1
          ~ - b + 1
        + ~ - a + 1
          ~ - b + 1
    		`,
		);
	});

	it('builds complex plans with nested forks', () => {
		const p0 = plan()
			.fork(
				branch(fork(branch('a++', 'a++'), branch('b++', 'b++'))),
				branch(fork(branch('c++', 'c++'), branch('d++', 'd++'))),
			)
			.action('a++');
		expect(p0.dag()).to.deep.equal([
			[
				[
					[
						['a++', 'a++'],
						['b++', 'b++'],
					],
				],
				[
					[
						['c++', 'c++'],
						['d++', 'd++'],
					],
				],
			],
			'a++',
		]);
		expect(p0.end()).to.deep.equal(
			dedent`
        + ~ + ~ - a++
                - a++
              ~ - b++
                - b++
          ~ + ~ - c++
                - c++
              ~ - d++
                - d++
        - a++
      `,
		);

		const p1 = plan()
			.fork(
				branch(
					fork(
						branch(fork(branch('a++', 'a++'), branch('b++', 'b++'))),
						branch(fork(branch('c++', 'c++'), branch('d++', 'd++'))),
					),
				),
				branch(
					fork(
						branch(fork(branch('e++', 'e++'), branch('f++', 'f++'))),
						branch(fork(branch('g++', 'g++'), branch('h++', 'h++'))),
					),
				),
			)
			.action('a++');
		expect(p1.dag()).to.deep.equal([
			[
				[
					[
						[
							[
								['a++', 'a++'],
								['b++', 'b++'],
							],
						],
						[
							[
								['c++', 'c++'],
								['d++', 'd++'],
							],
						],
					],
				],
				[
					[
						[
							[
								['e++', 'e++'],
								['f++', 'f++'],
							],
						],
						[
							[
								['g++', 'g++'],
								['h++', 'h++'],
							],
						],
					],
				],
			],
			'a++',
		]);
		expect(p1.end()).to.deep.equal(
			dedent`
        + ~ + ~ + ~ - a++
                    - a++
                  ~ - b++
                    - b++
              ~ + ~ - c++
                    - c++
                  ~ - d++
                    - d++
          ~ + ~ + ~ - e++
                    - e++
                  ~ - f++
                    - f++
              ~ + ~ - g++
                    - g++
                  ~ - h++
                    - h++
        - a++
  		`,
		);
	});
});
