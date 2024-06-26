import { expect } from '~/test-utils';
import { plan, branch, fork } from './builder';
import dedent from 'dedent';

describe('testing/builder', () => {
	it('builds a plan representation', () => {
		expect(plan().end()).to.deep.equal('');
		expect(plan().action('a').end()).to.deep.equal(
			dedent`
				- a
			`,
		);
		expect(plan().action('a').action('b').action('c').end()).to.deep.equal(
			dedent`
				- a
				- b
				- c
			`,
		);
		expect(plan().actions('a', 'b', 'c').end()).to.deep.equal(
			dedent`
				- a
				- b
				- c
			`,
		);
	});

	it('builds a plan with parallel branches', () => {
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

		expect(
			plan()
				.fork(branch('a', fork(branch('c'), branch('d'))), branch('b'))
				.action('f')
				.end(),
		).to.deep.equal(
			dedent`
		      + ~ - a
		          + ~ - c
		            ~ - d
		        ~ - b
		      - f
					`,
		);
	});

	it('collapses empty branches and single branch forks', () => {
		// Add an empty fork to the plan
		expect(
			plan().action('a').fork(branch('b', 'c'), branch()).action('f').end(),
		).to.deep.equal(
			dedent`
        - a
        - b
        - c
        - f
    		`,
		);

		expect(
			plan()
				.action('a')
				.fork(branch('b', 'c'), branch('d'), branch())
				.action('f')
				.end(),
		).to.deep.equal(
			dedent`
        - a
        + ~ - b
            - c
          ~ - d
        - f
    		`,
		);
	});

	it('builds a plan with just forks', () => {
		expect(
			plan()
				.fork(branch('a + 1'), branch('b + 1'))
				.fork(branch('a + 1'), branch('b + 1'))
				.end(),
		).to.deep.equal(
			dedent`
        + ~ - a + 1
          ~ - b + 1
        + ~ - a + 1
          ~ - b + 1
    		`,
		);
	});

	it('builds complex plans with nested forks', () => {
		expect(
			plan()
				.fork(
					branch(fork(branch('a++', 'a++'), branch('b++', 'b++'))),
					branch(fork(branch('c++', 'c++'), branch('d++', 'd++'))),
				)
				.action('a++')
				.end(),
		).to.deep.equal(
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

		expect(
			plan()
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
				.action('a++')
				.end(),
		).to.deep.equal(
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
