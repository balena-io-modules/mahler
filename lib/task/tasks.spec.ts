import { stub } from 'sinon';
import { expect } from '~/test-utils';
import { Task } from './tasks';
import { Ref } from '../ref';

describe('Tasks', () => {
	it('tasks with the same specification should have the same id', function () {
		const inc = Task.from<number>({
			condition: (state, { target }) => state < target,
			effect: (state) => ++state._,
			description: '+1',
		});
		expect(inc.id).to.equal(
			'9d73c72d26c1bbb33a4ee484e399129fcab792122a52a5816f1e0ef20dfc47ec',
		);

		const inc2 = Task.from<number>({
			condition: (state, { target }) => state < target,
			effect: (state) => ++state._,
			description: '+1',
		});
		expect(inc.id).to.equal(inc2.id);

		const inc3 = Task.from<number>({
			condition: (state, { target }) => state < target,
			effect: (state) => ++state._,
			description: 'increment',
		});
		expect(inc.id).to.not.equal(inc3.id);

		const dec = Task.from<number>({
			condition: (state, { target }) => state > target,
			effect: (state) => --state._,
			description: '-1',
		});
		expect(inc.id).to.not.equal(dec.id);

		const byTwo = Task.from<number>({
			condition: (state, { target }) => target - state > 1,
			method: (_, { target }) => [inc({ target }), inc({ target })],
			description: '+2',
		});
		expect(byTwo.id).to.equal(
			'e6ae37e6ef05cc2ee70493842cd1799aeeec8867c6efd15b1b1f1bca96436a48',
		);
		expect(dec.id).to.not.equal(byTwo.id);

		const byTwo2 = Task.from<number>({
			condition: (state, { target }) => target - state > 1,
			method: (_, { target }) => [inc({ target }), inc({ target })],
			description: '+2',
		});
		expect(byTwo.id).to.equal(byTwo2.id);
	});

	it('create tasks should automatically check that the property does not exist beforehand', async function () {
		type S = { props: { [k: string]: string } };
		const effectFn = stub();
		const task = Task.of<S>().from({
			op: 'create',
			lens: '/props/:propId',
			effect: (state, { target }) => {
				expect(state._).to.not.be.undefined;
				state._ = target;
				effectFn();
			},
		});

		const doTask = task({ propId: 'a', target: 'hello' });
		expect(doTask.condition({ props: {} })).to.be.true;
		expect(doTask.condition({ props: { b: 'goodbye' } })).to.be.true;

		// The condition only checks that the property exists, not that it
		// has the right value
		expect(doTask.condition({ props: { a: 'something' } })).to.be.false;
		expect(doTask.condition({ props: { a: 'hello' } })).to.be.false;

		const ref = Ref.of({ props: {} });

		doTask.effect(ref);
		expect(effectFn).to.have.been.called;
		expect(ref._.props).to.deep.equal({ a: 'hello' });
	});

	it('delete tasks should automatically check that the property exists', async function () {
		type S = { props: { [k: string]: string } };
		const effectFn = stub();
		const task = Task.of<S>().from({
			op: 'delete',
			lens: '/props/:propId',
			effect: (state) => {
				expect(state._).to.not.be.undefined;
				effectFn();
			},
		});

		const doTask = task({ propId: 'a' });
		expect(doTask.condition({ props: { a: 'hello' } })).to.be.true;
		expect(doTask.condition({ props: { a: 'hello', b: 'goodbye' } })).to.be
			.true;
		expect(doTask.condition({ props: { b: 'goodbye' } })).to.be.false;

		const ref = Ref.of({ props: { a: 'hello', b: 'goodbye' } });

		doTask.effect(ref);
		expect(effectFn).to.have.been.called;

		// Because the task sets the 'delete' operation, the property
		// will be deleted wihout having to set it to undefined
		expect(ref._.props).to.deep.equal({ b: 'goodbye' });
	});
});
