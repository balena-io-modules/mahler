export type ServiceStatus = 'created' | 'stopped' | 'running';

export interface Service {
	image: string;
	status?: ServiceStatus;
	createdAt?: Date;
	startedAt?: Date;
	finishedAt?: Date;
	containerId?: string;
	command: string[];
}

export interface Image {
	name: string;
	contentHash?: string;
	dockerId?: string;
}

export type UUID = string;

export type Release = {
	services: Record<string, Service>;
};

export type App = {
	name: string;
	// We accept multiple releases as part of the state but only
	// one should be running at all times
	releases: Record<UUID, Release>;
};

export type Device = {
	name: string;
	uuid: string;
	keys: { [url: string]: string };
	apps: Record<UUID, App>;
	images: Record<string, Image>;
};
