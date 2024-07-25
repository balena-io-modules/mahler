import * as Docker from 'dockerode';
import { expect } from '~/test-utils';

import { zip } from 'mahler/testing';
import { fetchServiceImage } from './tasks';

const docker = new Docker();

describe('composer/tasks', () => {
	describe('fetch', () => {
		const doFetch = zip(
			fetchServiceImage({
				serviceName: 'my-service',
				target: { image: 'alpine:latest', command: ['sleep', 'infinity'] },
			}),
		);

		it('should pull the service image if it does not exist yet', async () => {
			const s = await doFetch({
				name: 'test-app',
				images: {},
				services: {},
			});
			expect(s.images).to.have.property('alpine:latest');
			expect(s.images['alpine:latest'].imageId!).to.not.be.undefined;
			expect(
				await docker.getImage(s.images['alpine:latest'].imageId!).inspect(),
			)
				.to.have.property('RepoTags')
				.that.contains('alpine:latest');
		});
	});

	// TODO: add more tests for other tasks
});
