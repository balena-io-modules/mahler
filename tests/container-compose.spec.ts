import { expect } from '~/tests';

import { Task, Planner, Agent } from '~/lib';
import * as Docker from 'dockerode';

interface Service {
	readonly image: string;
	readonly status?: 'created' | 'stopped' | 'running';
	readonly createdAt?: Date;
	readonly containerId?: string;
	readonly command: string[];
}

interface Image {
	readonly name: string;
	readonly imageId?: string;
}

type App = {
	name: string;
	services: Record<string, Service>;
	images: Image[];
};

const docker = new Docker();

const pull = Task.of({
	path: '/services/:name',
	condition: (state: App, service) =>
		!state.images.some((img) => img.name === service.target.image),
	effect: (state: App, service) => ({
		...state,
		images: [...state.images, { name: service.target.image }],
	}),
	action: async (state: App, service) => {
		// Pull the image
		await new Promise((resolve, reject) =>
			docker
				.pull(service.target.image)
				.catch(reject)
				.then((stream) => {
					stream.on('data', () => void 0);
					stream.on('error', reject);
					stream.on('close', resolve);
					stream.on('finish', resolve);
				}),
		);

		// Get the image using the name
		const dockerImage = await docker.getImage(service.target.image).inspect();

		return {
			...state,
			images: [
				...state.images,
				{ name: service.target.image, imageId: dockerImage.Id },
			],
		};
	},
	description: (service) =>
		`pulling image '${service.target.image}' for service '${service.name}'`,
});

const run = Task.of({
	path: '/services/:name',
	condition: (state: App, service) =>
		state.images.some((img) => img.name === service.target.image) &&
		service.get(state)?.status !== 'running',
	effect: (app: App, { target: service, set }) =>
		set(app, { ...service, status: 'running' }),
	action: async (app: App, { name, target: service, set }) => {
		const container = await docker.createContainer({
			name: `${app.name}_${name}`,
			Image: service.image,
			Cmd: service.command || [],
		});

		await container.start();

		const { Id: containerId, Created } = await container.inspect();

		return set(app, {
			...service,
			status: 'running',
			containerId,
			createdAt: new Date(Created),
		});
	},
	description: ({ name }) => `starting container for service '${name}'`,
});

const planner = Planner.of<App>([pull, run]);

describe('container-compose', () => {
	describe('planner', () => {
		it('pulls images if it does not exist yet', async () => {
			const app = {
				name: 'test',
				services: {
					main: {
						image: 'alpine:latest',
						command: ['sleep', 'infinity'],
					},
				},
				images: [],
			};

			const plan = planner.plan(app, {
				services: {
					main: {
						status: 'running',
					},
				},
			});

			expect(plan.map((a) => a.description)).to.deep.equal([
				"pulling image 'alpine:latest' for service 'main'",
				"starting container for service 'main'",
			]);
		});

		it('skips pull if it image already exists', async () => {
			const app = {
				name: 'test',
				services: {},
				images: [{ name: 'alpine:latest', imageId: '123' }],
			};

			const plan = planner.plan(app, {
				services: {
					main: {
						status: 'running',
						image: 'alpine:latest',
						command: ['sleep', 'infinity'],
					},
				},
			});

			expect(plan.map((a) => a.description)).to.deep.equal([
				"starting container for service 'main'",
			]);
		});
	});

	describe('agent', () => {
		it('runs the plan', async () => {
			const agent = Agent.of<App>({
				initial: { name: 'test', services: {}, images: [] },
				tasks: [pull, run],
			});

			agent.start({
				services: {
					main: {
						status: 'running',
						image: 'alpine:latest',
						command: ['sleep', 'infinity'],
					},
				},
			});

			await agent.result();
		});
	});
});
