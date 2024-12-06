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
			'68635e74289a6533db2ac4389c4a0190c8ffc5ea2177f06001972fd778167504',
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
			'244a7aa41b5dfea349fb2736551f434f9c5e4158487f0e99d9e38b00eb56bb37',
		);
		expect(dec.id).to.not.equal(byTwo.id);

		const byTwo2 = Task.from<number>({
			condition: (state, { target }) => target - state > 1,
			method: (_, { target }) => [inc({ target }), inc({ target })],
			description: '+2',
		});
		expect(byTwo.id).to.equal(byTwo2.id);

		type Numbers = { [k: string]: number };
		const remove1 = Task.of<Numbers>().from({
			op: 'delete',
			effect: () => {
				console.log('nothing to do');
			},
			description: 'remove',
		});
		const remove2 = Task.of<Numbers>().from({
			op: 'delete',
			effect: () => {
				console.log('also nothing to do');
			},
			description: 'remove',
		});

		expect(remove1.id).to.not.equal(remove2.id);
	});

	it('create tasks should automatically check that the property does not exist beforehand', function () {
		type S = { props: { [k: string]: string } };
		const effectFn = stub();
		const task = Task.of<S>().from({
			op: 'create',
			lens: '/props/:propId',
			effect: (state, { target }) => {
				expect(state._).to.be.undefined;
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

	it('delete tasks should automatically check that the property exists', function () {
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
