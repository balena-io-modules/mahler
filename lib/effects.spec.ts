import { expect } from '~/test-utils';
import { Effect, doPipe, map, when, of, bindIO } from './effects';

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
			expect(await effect.run()).to.equal(4);
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
			await expect(effect.run()).to.be.rejected;
		});
	});

	describe('pipe', () => {
		it('allows piping effects', async () => {
			const effect = doPipe(
				0,
				map((x) => x + 1),
				bindIO(
					async (x) => x + 2,
					(x) => x + 1,
				),
				map((x) => x + 1),
				when((x) => x < 2, of),
			);
			expect(effect()).to.equal(3);
			expect(await effect.run()).to.equal(4);
		});
	});
});