import { Planner } from '~/lib';
import { console } from '~/tests';

import { Device } from './state';
import {
	fetch,
	createApp,
	createRelease,
	installService,
	startService,
	stopService,
	removeService,
	removeRelease,
	removeApp,
} from './tasks';

export const planner = Planner.of<Device>({
	tasks: [
		fetch,
		createApp,
		createRelease,
		installService,
		startService,
		stopService,
		removeService,
		removeRelease,
		removeApp,
	],
	opts: { trace: console.trace },
});
