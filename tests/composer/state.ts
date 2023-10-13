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
	imageId?: string;
}

export type App = {
	name: string;
	services: Record<string, Service>;
	images: Record<string, Image>;
};
