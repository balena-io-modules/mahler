import * as Docker from 'dockerode';
import { expect } from '~/test-utils';

import { Image } from './state';
import { fetch } from './tasks';

const docker = new Docker();

describe('composer/tasks', () => {
	describe('fetch', () => {
		const doFetch = fetch({
			serviceName: 'my-service',
			target: { image: 'alpine:latest', command: ['sleep', 'infinity'] },
		});

		it('should pull an image', async () => {
			const s = await doFetch({
				name: 'test-app',
				images: [] as Image[],
				services: {},
			});
			expect(s.images.map((i) => i.name)).to.include('alpine:latest');
			expect(s.images[0]!.imageId!).to.not.be.undefined;
			expect(await docker.getImage(s.images[0]!.imageId!).inspect())
				.to.have.property('RepoTags')
				.that.contains('alpine:latest');
		});
	});

	// TODO: add more tests for other tasks
});
