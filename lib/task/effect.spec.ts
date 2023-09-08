import { expect } from '~/test-utils';
import { Effect, WithIO, WithoutIO } from './effect';

describe('Effect', () => {
	it('calculates changes to the given object', () => {
		const effect = Effect.of((s: { foo: string }) => {
			s.foo = 'bar';
		});

		const o = { foo: 'baz' };
		effect(o);
		expect(effect.changes).to.deep.equal([
			{ op: 'replace', path: '/foo', value: 'bar' },
		]);

		expect(o).to.deep.equal({ foo: 'baz' });
	});

	it('it can perform async operations depending on the execution context', async () => {
		const effect = Effect.of(async (s: { foo: string }, withIO: WithIO) => {
			s.foo = await withIO(async () => 'bazbaz', 'bar');
		});

		const o = { foo: 'baz' };
		await effect(o, WithoutIO);
		expect(effect.changes).to.deep.equal([
			{ op: 'replace', path: '/foo', value: 'bar' },
		]);

		await effect(o, WithIO);
		expect(effect.changes).to.deep.equal([
			{ op: 'replace', path: '/foo', value: 'bazbaz' },
		]);

		expect(o).to.deep.equal({ foo: 'baz' });
	});
});
