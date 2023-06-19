import { Planner } from '~/lib';
import { console } from '~/tests';

import { App } from './state';
import { fetch, install, remove, start, stop } from './tasks';

export const planner = Planner.of<App>({
	tasks: [fetch, install, start, stop, remove],
	opts: { trace: console.trace },
});
