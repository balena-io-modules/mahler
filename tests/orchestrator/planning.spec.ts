import { expect } from '~/tests';

import { ServiceStatus } from './state';
import { planner } from './planner';
import { DELETED } from 'lib/target';

describe('orchestrator/planning', () => {
	it('updates the app/release state if it has not been set', () => {
		const device = {
			name: 'test',
			uuid: 'd0',
			apps: {},
			keys: {},
			images: [{ name: 'a0_main:r0' }],
		};

		const result = planner.findPlan(device, {
			apps: {
				a0: {
					name: 'test-app',
					releases: {
						r0: {
							services: {
								main: {
									image: 'alpine:latest',
									command: ['sleep', 'infinity'],
									status: 'running',
								},
							},
						},
					},
				},
			},
		});

		if (result.success) {
			expect(result.plan.map((a) => a.description)).to.deep.equal([
				"prepare app 'test-app'",
				"prepare release 'r0'",
				"create container for service 'main' of app 'a0' and release 'r0'",
				"start container for service 'main' of app 'a0' and release 'r0'",
			]);
		} else {
			expect.fail('Plan not found');
		}
	});

	it('pulls the service image if it does not exist yet', () => {
		const device = {
			name: 'test',
			uuid: 'd0',
			apps: {
				a0: {
					name: 'test-app',
					releases: {
						r0: {
							services: {},
						},
					},
				},
			},
			keys: {},
			images: [],
		};

		const result = planner.findPlan(device, {
			apps: {
				a0: {
					name: 'test-app',
					releases: {
						r0: {
							services: {
								main: {
									image: 'alpine:latest',
									command: ['sleep', 'infinity'],
									status: 'running',
								},
							},
						},
					},
				},
			},
		});

		if (result.success) {
			expect(result.plan.map((a) => a.description)).to.deep.equal([
				"pull image 'alpine:latest' for service 'main' of app 'a0'",
				"create container for service 'main' of app 'a0' and release 'r0'",
				"start container for service 'main' of app 'a0' and release 'r0'",
			]);
		} else {
			expect.fail('Plan not found');
		}
	});

	it('starts the service if the container already exists', () => {
		const device = {
			name: 'test',
			uuid: 'd0',
			apps: {
				a0: {
					name: 'test-app',
					releases: {
						r0: {
							services: {
								main: {
									image: 'alpine:latest',
									command: ['sleep', 'infinity'],
									status: 'created' as ServiceStatus,
									containerId: 'c0',
								},
							},
						},
					},
				},
			},
			keys: {},
			images: [{ name: 'a0_main:r0' }],
		};

		const result = planner.findPlan(device, {
			apps: {
				a0: {
					name: 'test-app',
					releases: {
						r0: {
							services: {
								main: {
									status: 'running',
								},
							},
						},
					},
				},
			},
		});

		if (result.success) {
			expect(result.plan.map((a) => a.description)).to.deep.equal([
				"start container for service 'main' of app 'a0' and release 'r0'",
			]);
		} else {
			expect.fail('Plan not found');
		}
	});

	it('installs and stops service if service does not exist and target state is "stopped"', () => {
		const device = {
			name: 'test',
			uuid: 'd0',
			apps: {
				a0: {
					name: 'test-app',
					releases: {
						r0: {
							services: {},
						},
					},
				},
			},
			keys: {},
			images: [],
		};

		const result = planner.findPlan(device, {
			name: 'test',
			uuid: 'd0',
			apps: {
				a0: {
					name: 'test-app',
					releases: {
						r0: {
							services: {
								main: {
									image: 'alpine:latest',
									command: ['sleep', 'infinity'],
									status: 'stopped' as ServiceStatus,
								},
							},
						},
					},
				},
			},
			keys: {},
			images: [{ name: 'a0_main:r0' }],
		});

		if (result.success) {
			expect(result.plan.map((a) => a.description)).to.deep.equal([
				"pull image 'alpine:latest' for service 'main' of app 'a0'",
				"create container for service 'main' of app 'a0' and release 'r0'",
				"start container for service 'main' of app 'a0' and release 'r0'",
				"stop container for service 'main' of app 'a0' and release 'r0'",
			]);
		} else {
			expect.fail('Plan not found');
		}
	});

	it('recreates the service container if the configuration does not match', () => {
		const device = {
			name: 'test',
			uuid: 'd0',
			apps: {
				a0: {
					name: 'test-app',
					releases: {
						r0: {
							services: {
								main: {
									image: 'alpine:latest',
									command: ['sleep', 'infinity'],
									status: 'running' as ServiceStatus,
									containerId: 'c0',
								},
							},
						},
					},
				},
			},
			keys: {},
			images: [{ name: 'a0_main:r0' }],
		};

		const result = planner.findPlan(device, {
			name: 'test',
			uuid: 'd0',
			apps: {
				a0: {
					name: 'test-app',
					releases: {
						r0: {
							services: {
								main: {
									command: ['sleep', '30'],
									status: 'running',
								},
							},
						},
					},
				},
			},
			keys: {},
			images: [{ name: 'a0_main:r0' }],
		});

		if (result.success) {
			expect(result.plan.map((a) => a.description)).to.deep.equal([
				"stop container for service 'main' of app 'a0' and release 'r0'",
				"remove container for service 'main' of app 'a0' and release 'r0'",
				"create container for service 'main' of app 'a0' and release 'r0'",
				"start container for service 'main' of app 'a0' and release 'r0'",
			]);
		} else {
			expect.fail('Plan not found');
		}
	});

	it('updates a release by first installing the new services and then stopping the old services', () => {
		const device = {
			name: 'test',
			uuid: 'd0',
			apps: {
				a0: {
					name: 'test-app',
					releases: {
						r0: {
							services: {
								main: {
									image: 'alpine:latest',
									command: ['sleep', 'infinity'],
									status: 'running' as ServiceStatus,
									containerId: 'c0',
								},
							},
						},
					},
				},
			},
			keys: {},
			images: [{ name: 'a0_main:r0' }],
		};

		const result = planner.findPlan(device, {
			apps: {
				a0: {
					name: 'test-app',
					releases: {
						r0: DELETED,
						r1: {
							services: {
								main: {
									image: 'alpine:latest',
									command: ['sleep', '30'],
									status: 'running',
								},
								other: {
									image: 'alpine:latest',
									command: ['sleep', '30'],
									status: 'running',
								},
							},
						},
					},
				},
			},
		});

		if (result.success) {
			expect(result.plan.map((a) => a.description)).to.deep.equal([
				"prepare release 'r1'",
				"pull image 'alpine:latest' for service 'main' of app 'a0'",
				"create container for service 'main' of app 'a0' and release 'r1'",
				"stop container for service 'main' of app 'a0' and release 'r0'",
				"remove container for service 'main' of app 'a0' and release 'r0'",
				"remove release 'r0'",
				"start container for service 'main' of app 'a0' and release 'r1'",
				"pull image 'alpine:latest' for service 'other' of app 'a0'",
				"create container for service 'other' of app 'a0' and release 'r1'",
				"start container for service 'other' of app 'a0' and release 'r1'",
			]);
		} else {
			expect.fail('Plan not found');
		}
	});

	it('migrates unchanged services between releases', () => {
		const device = {
			name: 'test',
			uuid: 'd0',
			apps: {
				a0: {
					name: 'test-app',
					releases: {
						r0: {
							services: {
								main: {
									image: 'alpine:latest',
									command: ['sleep', 'infinity'],
									status: 'running' as ServiceStatus,
									containerId: 'c0',
								},
							},
						},
					},
				},
			},
			keys: {},
			images: [{ name: 'a0_main:r0' }],
		};

		const result = planner.findPlan(device, {
			apps: {
				a0: {
					name: 'test-app',
					releases: {
						r0: DELETED,
						r1: {
							services: {
								// main service has not changed
								main: {
									image: 'alpine:latest',
									command: ['sleep', 'infinity'],
									status: 'running',
								},
								other: {
									image: 'alpine:latest',
									command: ['sleep', '30'],
									status: 'running',
								},
							},
						},
					},
				},
			},
		});

		if (result.success) {
			expect(result.plan.map((a) => a.description)).to.deep.equal([
				"prepare release 'r1'",
				"pull image 'alpine:latest' for service 'main' of app 'a0'",
				"migrate unchanged service 'main' of app 'a0 to release 'r1' '",
				"remove release 'r0'",
				"pull image 'alpine:latest' for service 'other' of app 'a0'",
				"create container for service 'other' of app 'a0' and release 'r1'",
				"start container for service 'other' of app 'a0' and release 'r1'",
			]);
		} else {
			expect.fail('Plan not found');
		}
	});
});
