import { Planner } from 'mahler/planner';
import { console } from '~/test-utils';

import { App } from './state';
import { fetch, install, remove, start, stop } from './tasks';

export const planner = Planner.of<App>({
	tasks: [fetch, install, start, stop, remove],
	config: { trace: console.trace },
});
