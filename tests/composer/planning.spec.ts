import { expect } from '~/test-utils';

import { planner } from './planner';
import { ServiceStatus } from './state';
import { plan, stringify } from 'mahler/testing';

describe('composer/planning', () => {
	it('pulls the service image if it does not exist yet', () => {
		const app = {
			name: 'test',
			services: {},
			images: {},
		};

		const result = planner.findPlan(app, {
			services: {
				main: {
					image: 'alpine:latest',
					command: ['sleep', 'infinity'],
					status: 'running',
				},
			},
		});

		expect(stringify(result)).to.deep.equal(
			plan()
				.action("pull image 'alpine:latest'")
				.action("install container for service 'main'")
				.action("start container for service 'main'")
				.end(),
		);
	});

	it('skips pull if it image already exists', () => {
		const app = {
			name: 'test',
			services: {},
			images: { 'alpine:latest': { imageId: '123' } },
		};

		const result = planner.findPlan(app, {
			services: {
				main: {
					status: 'running',
					image: 'alpine:latest',
					command: ['sleep', 'infinity'],
				},
			},
		});

		expect(stringify(result)).to.deep.equal(
			plan()
				.action("install container for service 'main'")
				.action("start container for service 'main'")
				.end(),
		);
	});

	it('stops running service if target state is "stopped"', () => {
		const app = {
			name: 'test',
			services: {
				main: {
					status: 'running' as ServiceStatus,
					image: 'alpine:latest',
					containerId: 'deadbeef',
					command: ['sleep', 'infinity'],
				},
			},
			images: { 'alpine:latest': { imageId: '123' } },
		};

		const result = planner.findPlan(app, {
			services: {
				main: {
					status: 'stopped',
				},
			},
		});

		expect(stringify(result)).to.deep.equal(
			plan().action("stop container for service 'main'").end(),
		);
	});

	it('installs and stops service if service does not exist and target state is "stopped"', () => {
		const app = {
			name: 'test',
			services: {},
			images: {},
		};

		const result = planner.findPlan(app, {
			services: {
				main: {
					status: 'stopped',
					image: 'alpine:latest',
					containerId: 'deadbeef',
					command: ['sleep', 'infinity'],
				},
			},
		});

		expect(stringify(result)).to.deep.equal(
			plan()
				.action("pull image 'alpine:latest'")
				.action("install container for service 'main'")
				.action("start container for service 'main'")
				.action("stop container for service 'main'")
				.end(),
		);
	});

	it('knows to recreate the service if the image changes', () => {
		const app = {
			name: 'test',
			services: {
				main: {
					status: 'running' as ServiceStatus,
					image: 'alpine:3.13',
					containerId: 'deadbeef',
					command: ['sleep', 'infinity'],
				},
			},
			images: { 'alpine:3.13': { imageId: '123' } },
		};

		const result = planner.findPlan(app, {
			services: {
				main: {
					status: 'running',
					image: 'alpine:3.14',
				},
			},
		});

		expect(stringify(result)).to.deep.equal(
			plan()
				.action("stop container for service 'main'")
				.action("remove container for service 'main'")
				.action("pull image 'alpine:3.14'")
				.action("install container for service 'main'")
				.action("start container for service 'main'")
				.end(),
		);
	});

	it('knows to recreate the service if the image changes and the service is stopped', () => {
		const app = {
			name: 'test',
			services: {
				main: {
					status: 'stopped' as ServiceStatus,
					image: 'alpine:3.13',
					containerId: 'deadbeef',
					command: ['sleep', 'infinity'],
				},
			},
			images: { 'alpine:3.13': { imageId: '123' } },
		};

		const result = planner.findPlan(app, {
			services: {
				main: {
					status: 'running',
					image: 'alpine:3.14',
				},
			},
		});

		expect(stringify(result)).to.deep.equal(
			plan()
				.action("remove container for service 'main'")
				.action("pull image 'alpine:3.14'")
				.action("install container for service 'main'")
				.action("start container for service 'main'")
				.end(),
		);
	});
});

it('knows to recreate service if config has changed', () => {
	const app = {
		name: 'test',
		services: {
			main: {
				status: 'running' as ServiceStatus,
				image: 'alpine:3.13',
				containerId: 'deadbeef',
				command: ['sleep', 'infinity'],
			},
		},
		images: { 'alpine:3.13': { imageId: '123' } },
	};

	const result = planner.findPlan(app, {
		services: {
			main: {
				status: 'running',
				command: ['sleep', '10'],
			},
		},
	});

	expect(stringify(result)).to.deep.equal(
		plan()
			.action("stop container for service 'main'")
			.action("remove container for service 'main'")
			.action("install container for service 'main'")
			.action("start container for service 'main'")
			.end(),
	);
});
