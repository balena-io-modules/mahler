import { expect } from '~/test-utils';
import { Effect, doPipe, map, when, of, bindIO } from './effects';

import { stub } from 'sinon';

describe('Effects API', () => {
	describe('Effect', () => {
		it('allows chaining calculations', () => {
			const effect = Effect.of(0).map((x) => x + 1);
			expect(effect()).to.equal(1);
		});

		it('allows a sync and async executions', async () => {
			const effect = Effect.of(0)
				.map((x) => x + 1)
				.flatMap((x) =>
					Effect.from(
						async () => x + 2,
						() => x + 1,
					),
				)
				.flatMap((x) =>
					Effect.from(
						async () => x + 1,
						() => x + 1,
					),
				);
			expect(effect()).to.equal(3);
			expect(await effect).to.equal(4);
		});

		it('propagates errors in a promise', async () => {
			const effect = Effect.of(0)
				.map((x) => x + 1)
				.flatMap((x) =>
					Effect.from(
						async () => {
							if (x < 2) {
								throw new Error('x is too small');
							}
							// This will never be reached
							return x + 2;
						},
						() => x + 1,
					),
				)
				.flatMap((x) =>
					Effect.from(
						async () => x + 1,
						() => x + 1,
					),
				);
			expect(effect()).to.equal(3);
			await expect(effect).to.be.rejected;
		});
	});

	describe('pipe', () => {
		it('allows piping effects', async () => {
			const effectFn = () =>
				doPipe(
					0,
					map((x) => x + 1),
					bindIO(
						async (x) => x + 2,
						(x) => x + 1,
					),
					map((x) => x + 1),
					when((x) => x < 2, of),
				);
			expect(effectFn()()).to.equal(3);
			expect(await effectFn()).to.equal(4);
		});
	});

	describe('Observables', () => {
		it('allows using an async generator as IO', async () => {
			const effect = doPipe(
				0,
				map((x) => x + 1),
				bindIO(
					async function* (x) {
						yield x + 1;
						yield x + 2;
					},
					(x) => x + 1,
				),
				map((x) => x + 1),
			);
			const next = stub();

			// Create a new promise to wait for the effect to
			// finish
			const promise = new Promise<void>((resolve, reject) => {
				const subscriber = effect.subscribe({
					next,
					error: reject,
					complete: () => {
						resolve();
						subscriber.unsubscribe();
					},
				});
			});
			await promise;
			expect(effect()).to.equal(3);
			expect(next).to.have.been.calledTwice;
			expect(next).to.have.been.calledWith(3);
			expect(next).to.have.been.calledWith(4);
			expect(await effect).to.equal(4);
		});
	});
});
