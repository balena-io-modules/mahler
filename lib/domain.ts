import { Sensor } from './sensor';
import { Task } from './task';

export const Domain = {
	of<T>() {
		return {
			task: Task.of<T>().from,
			sensor: Sensor.of<T>().from,
		};
	},
};
