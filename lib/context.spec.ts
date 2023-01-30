import { expect } from '~/tests';
import { Context } from './context';

describe('context', () => {
	it('calculates a simple context', () => {
		type State = { a: { b: { c: string[] }; d: number } };

		const c = Context.of<State, '/a/b/:value'>('/a/b/:value', '/a/b/c', [
			'one',
			'two',
		]);

		expect(c).to.deep.include({
			target: ['one', 'two'],
			value: 'c',
		});

		// The context includes a lens to get the value
		expect(c.get({ a: { b: { c: ['zero'] }, d: 123 } })).to.deep.equal([
			'zero',
		]);

		// The context includes a lens to update the value
		const obj = { a: { b: { c: ['zero'] }, d: 123 } };
		expect(c.set(obj, ['one'])).to.deep.equal({
			a: { b: { c: ['one'] }, d: 123 },
		});
		// The original object has not changed
		expect(obj).to.deep.equal({ a: { b: { c: ['zero'] }, d: 123 } });
	});

	it('calculates a context with arrays', () => {
		type State = { a: { b: { c: string[] }; d: number } };

		const c = Context.of<State, '/a/b/c/:pos'>(
			'/a/b/c/:pos',
			'/a/b/c/0',
			'one',
		);

		expect(c).to.deep.include({
			target: 'one',
			pos: 0,
		});

		// The context includes a lens to get the value
		expect(c.get({ a: { b: { c: ['zero'] }, d: 123 } })).to.deep.equal('zero');

		// The context includes a lens to update the value
		const obj = { a: { b: { c: ['zero'] }, d: 123 } };
		expect(c.set(obj, 'one')).to.deep.equal({
			a: { b: { c: ['one'] }, d: 123 },
		});
		// The original object has not changed
		expect(obj).to.deep.equal({ a: { b: { c: ['zero'] }, d: 123 } });
	});

	it('calculates a context nested in an array', () => {
		type State = { a: { b: { c: Array<{ e: string }> }; d: number } };

		const c = Context.of<State, '/a/b/c/:pos/e'>(
			'/a/b/c/:pos/e',
			'/a/b/c/0/e',
			'one',
		);

		expect(c).to.deep.include({
			target: 'one',
			pos: 0,
		});

		// The context includes a lens to get the value
		expect(c.get({ a: { b: { c: [{ e: 'zero' }] }, d: 123 } })).to.deep.equal(
			'zero',
		);

		// The context includes a lens to update the value
		const obj = { a: { b: { c: [{ e: 'zero' }, { e: 'two' }] }, d: 123 } };
		expect(c.set(obj, 'one')).to.deep.equal({
			a: { b: { c: [{ e: 'one' }, { e: 'two' }] }, d: 123 },
		});
		// The original object has not changed
		expect(obj).to.deep.equal({
			a: { b: { c: [{ e: 'zero' }, { e: 'two' }] }, d: 123 },
		});
	});
});
