import { expect } from '~/tests';

import { planner } from './planner';
import { ServiceStatus } from './state';

describe('composer/planning', () => {
	it('pulls the service image if it does not exist yet', () => {
		const app = {
			name: 'test',
			services: {},
			images: [],
		};

		const result = planner.find(app, {
			services: {
				main: {
					image: 'alpine:latest',
					command: ['sleep', 'infinity'],
					status: 'running',
				},
			},
		});

		if (result.success) {
			expect(result.plan.map((a) => a.description)).to.deep.equal([
				"pull image 'alpine:latest' for service 'main'",
				"installing container for service 'main'",
				"starting container for service 'main'",
			]);
		} else {
			expect.fail('Plan not found');
		}
	});

	it('skips pull if it image already exists', () => {
		const app = {
			name: 'test',
			services: {},
			images: [{ name: 'alpine:latest', imageId: '123' }],
		};

		const result = planner.find(app, {
			services: {
				main: {
					status: 'running',
					image: 'alpine:latest',
					command: ['sleep', 'infinity'],
				},
			},
		});

		if (result.success) {
			expect(result.plan.map((a) => a.description)).to.deep.equal([
				"installing container for service 'main'",
				"starting container for service 'main'",
			]);
		} else {
			expect.fail('Plan not found');
		}
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
			images: [{ name: 'alpine:latest', imageId: '123' }],
		};

		const result = planner.find(app, {
			services: {
				main: {
					status: 'stopped',
				},
			},
		});

		if (result.success) {
			expect(result.plan.map((a) => a.description)).to.deep.equal([
				"stopping container for service 'main'",
			]);
		} else {
			expect.fail('Plan not found');
		}
	});

	it('installs and stops service if service does not exist and target state is "stopped"', () => {
		const app = {
			name: 'test',
			services: {},
			images: [],
		};

		const result = planner.find(app, {
			services: {
				main: {
					status: 'stopped',
					image: 'alpine:latest',
					containerId: 'deadbeef',
					command: ['sleep', 'infinity'],
				},
			},
		});

		if (result.success) {
			expect(result.plan.map((a) => a.description)).to.deep.equal([
				"pull image 'alpine:latest' for service 'main'",
				"installing container for service 'main'",
				"starting container for service 'main'",
				"stopping container for service 'main'",
			]);
		} else {
			expect.fail('Plan not found');
		}
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
			images: [{ name: 'alpine:3.13', imageId: '123' }],
		};

		const result = planner.find(app, {
			services: {
				main: {
					status: 'running',
					image: 'alpine:3.14',
				},
			},
		});

		if (result.success) {
			expect(result.plan.map((a) => a.description)).to.deep.equal([
				"pull image 'alpine:3.14' for service 'main'",
				"stopping container for service 'main'",
				"removing container for service 'main'",
				"installing container for service 'main'",
				"starting container for service 'main'",
			]);
		} else {
			expect.fail('Plan not found');
		}
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
			images: [{ name: 'alpine:3.13', imageId: '123' }],
		};

		const result = planner.find(app, {
			services: {
				main: {
					status: 'running',
					image: 'alpine:3.14',
				},
			},
		});

		if (result.success) {
			expect(result.plan.map((a) => a.description)).to.deep.equal([
				"pull image 'alpine:3.14' for service 'main'",
				"removing container for service 'main'",
				"installing container for service 'main'",
				"starting container for service 'main'",
			]);
		} else {
			expect.fail('Plan not found');
		}
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
		images: [{ name: 'alpine:3.13', imageId: '123' }],
	};

	const result = planner.find(app, {
		services: {
			main: {
				status: 'running',
				command: ['sleep', '10'],
			},
		},
	});

	if (result.success) {
		expect(result.plan.map((a) => a.description)).to.deep.equal([
			"stopping container for service 'main'",
			"removing container for service 'main'",
			"installing container for service 'main'",
			"starting container for service 'main'",
		]);
	} else {
		expect.fail('Plan not found');
	}
});
