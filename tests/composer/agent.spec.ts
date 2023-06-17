import * as Docker from 'dockerode';
import { console, expect } from '~/tests';

import { Agent } from '~/lib';
import { planner } from './planner';
import { App } from './state';

const docker = new Docker();

describe('composer/agent', () => {
	const appname = 'testapp';

	const cleanup = async () => {
		const containers = await docker.listContainers({ all: true });
		await Promise.all(
			containers
				.filter(({ Names }) =>
					Names.some((name) => name.startsWith(`/${appname}_`)),
				)
				.map(({ Id }) => docker.getContainer(Id).remove({ force: true })),
		);

		await docker.pruneImages({ filters: { dangling: { false: true } } });
	};

	beforeEach(async () => {
		await cleanup();
	});

	after(async () => {
		await cleanup();
	});

	it('can execute a single service plan', async () => {
		const agent = Agent.of<App>({
			initial: { name: appname, services: {}, images: [] },
			planner,
			opts: { minWaitMs: 1000, logger: console },
		});

		agent.start({
			services: {
				main: {
					status: 'running',
					image: 'alpine:3.12',
					command: ['sleep', 'infinity'],
				},
			},
		});

		expect(
			await agent.result(),
			'starting a single container should succeed',
		).to.deep.equal({ success: true });

		const service = agent.state().services.main;
		expect(service).to.not.be.undefined;
		expect(service.containerId).to.not.be.undefined;

		expect(
			(await docker.getContainer(service.containerId!).inspect()).State,
			'container is running after plan is executed',
		)
			.to.have.property('Running')
			.that.equals(true);

		// Update the target
		await agent.target({
			services: {
				main: {
					status: 'stopped',
				},
			},
		});

		expect(
			await agent.result(),
			'stopping the container should succeed',
		).to.deep.equal({ success: true });
		expect(
			(await docker.getContainer(service.containerId!).inspect()).State,
			'container is stopped after the plan is executed',
		)
			.to.have.property('Running')
			.that.equals(false);

		await agent.target({
			services: {
				main: {
					status: 'running',
					image: 'alpine:3.13',
				},
			},
		});
		expect(
			await agent.result(),
			'modifying the service image should succeed',
		).to.deep.equal({ success: true });

		const newService = agent.state().services.main;
		expect(newService).to.not.be.undefined;
		expect(newService.containerId).to.not.be.undefined;
		expect(
			newService.containerId,
			'the container is recreated during execution',
		).to.not.equal(service.containerId);
		expect((await docker.getContainer(newService.containerId!).inspect()).State)
			.to.have.property('Running')
			.that.equals(true);
	});
});