import * as Docker from 'dockerode';
import { Domain } from 'mahler';
import type { Service, ServiceStatus } from './state';
import { App } from './state';

interface StatusError extends Error {
	statusCode: number;
}

function isStatusError(x: unknown): x is StatusError {
	return x instanceof Error && typeof (x as any).statusCode === 'number';
}

function isEqualConfig(s1: Service, s2: Service) {
	return s1.image === s2.image && s1.command.join(' ') === s2.command.join(' ');
}

const docker = new Docker();

const App = Domain.of<App>();

/**
 * Pull an image from the registry, this task is applicable to
 * the creation of a new image
 *
 * Condition: the image is not already present in the device
 * Effect: add the image to the list of images
 * Action: pull the image from the registry and add it to the images local registry
 */
export const fetchImage = App.task({
	op: 'create',
	lens: '/images/:imageName',
	effect: (image) => {
		// Create an empty image
		image._ = {};
	},
	action: async (image, { imageName }) => {
		await new Promise((resolve, reject) =>
			docker
				.pull(imageName)
				.catch(reject)
				.then((stream) => {
					stream.on('data', () => void 0);
					stream.on('error', reject);
					stream.on('close', resolve);
					stream.on('finish', resolve);
				}),
		);

		// Get the image using the name
		const dockerImage = await docker.getImage(imageName).inspect();

		image._ = { imageId: dockerImage.Id };
	},
	description: ({ imageName }) => `pull image '${imageName}'`,
});

/**
 * Pull an image from the registry, this task is applicable to
 * the creation of a service, as pulling an image is only needed
 * in that case.
 *
 * Condition: the image is not already present in the device (checked by the fetchImage action)
 * Effect: add the image to the list of images
 * Action: pull the image from the registry
 */
export const fetchServiceImage = App.task({
	op: 'create',
	lens: '/services/:serviceName',
	method: (_, { target }) => {
		return fetchImage({ imageName: target.image, target: {} });
	},
	description: (service) =>
		`pull image '${service.target.image}' for service '${service.serviceName}'`,
});

/**
 * Create a new service container from service data
 *
 * Condition: the service is not already present in the `services` object and the service image has already been downloaded
 * Effect: add the service to the `services` object, with a `status` of `created`
 * Action: create a new container using the docker API and set the `containerId` property of the service in the `services` object
 */
export const installService = App.task({
	op: 'create',
	lens: '/services/:serviceName',
	condition: (_, { system, target }) => target.image in system.images,
	effect: (service, { target }) => {
		service._ = {
			image: target.image,
			command: target.command,
			status: 'created',
			containerId: 'deadbeef',
		};
	},
	action: async (service, { target, serviceName, system: app }) => {
		// This is our way to update the internal agent state, we look for
		// the service before we do anything, and if it exists, we update
		// the state with the service metadata.
		const existing = await docker
			.getContainer(`${app.name}_${serviceName}`)
			.inspect()
			.catch((e) => {
				if (isStatusError(e) && e.statusCode === 404) {
					return null;
				}
				throw e;
			});

		if (existing != null) {
			const status: ServiceStatus = (() => {
				if (existing.State.Running) {
					return 'running';
				}
				if (existing.State.ExitCode === 0) {
					return 'stopped';
				}
				return 'created';
			})();
			const s: Service = {
				image:
					(await docker.getImage(existing.Image).inspect()).RepoTags[0] ||
					existing.Image,
				startedAt: new Date(existing.State.StartedAt),
				createdAt: new Date(existing.Created),
				containerId: existing.Id,
				status,
				command: existing.Config.Cmd,
			};

			// If the service has a different config to what we are expecting
			// the service start step will fail and we'll need to re-plan
			service._ = s;
		}

		const container = await docker.createContainer({
			name: `${app.name}_${serviceName}`,
			Image: target.image,
			Cmd: target.command || [],
		});

		const { Id: containerId, Created } = await container.inspect();

		// TODO: here we should get the configuration from the container as docker
		// sometimes ignores configurations that are unsupported by the underlying OS
		service._ = {
			image: target.image,
			command: target.command,
			status: 'created',
			containerId,
			createdAt: new Date(Created),
		};
	},
	description: ({ serviceName }) =>
		`install container for service '${serviceName}'`,
});

/**
 * Start a service container
 *
 * Condition: the service container has been created (it has a container id) and the container not running already.
 * Effect: set the service status to `running`
 * Action: start the container using the docker API
 */
export const startService = App.task({
	lens: '/services/:serviceName',
	condition: (service, { target }) =>
		service.containerId != null &&
		isEqualConfig(service, target) &&
		service.status !== 'running',
	effect: (service) => {
		service._.status = 'running';
	},
	action: async (service) => {
		const container = docker.getContainer(service._.containerId!);
		await container.start();

		const { State } = await container.inspect();

		service._.status = 'running';
		service._.startedAt = new Date(State.StartedAt);
	},
	description: ({ serviceName }) =>
		`start container for service '${serviceName}'`,
});

/**
 * Stop a service container
 *
 * Condition: the service exists (it has a container id), and the container is running.
 * Effect: set the service status to `stopped`
 * Action: stop the container using the docker API
 */
export const stopService = App.task({
	op: '*',
	lens: '/services/:serviceName',
	condition: (service) =>
		service?.containerId != null && service?.status === 'running',
	effect: (service) => {
		service._.status = 'stopped';
	},
	action: async (service) => {
		const container = docker.getContainer(service._.containerId!);
		await container.stop().catch((e) => {
			if (isStatusError(e)) {
				if (e.statusCode !== 304 && e.statusCode !== 404) {
					throw e;
				}
			} else {
				throw e;
			}
		});

		const { State } = await container.inspect();

		service._.status = 'stopped';
		service._.finishedAt = new Date(State.FinishedAt);
	},
	description: ({ serviceName }) =>
		`stop container for service '${serviceName}'`,
});

/**
 * Remove a service container
 *
 * Condition: the service exists (it has a container id), and the container is not running.
 * Effect: remove the service from the app
 * Action: remove the container using the docker API
 */
export const uninstallService = App.task({
	// Recreating the service also requires that the container is uninstalled first
	// so this needs to apply to a service update or a service removal
	op: '*',
	lens: '/services/:serviceName',
	condition: (service) =>
		service != null &&
		service.containerId != null &&
		service.status !== 'running',
	effect: (service) => {
		// We need to purposely delete the service here, as the task
		// operation is '*'
		service.delete();
	},
	action: async (service) => {
		const container = docker.getContainer(service._.containerId!);
		await container.remove({ v: true });

		service.delete();
	},
	description: ({ serviceName }) =>
		`remove container for service '${serviceName}'`,
});
