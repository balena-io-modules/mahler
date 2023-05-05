import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as sinonChai from 'sinon-chai';

import logger from './console';

export const console = logger;

chai.use(sinonChai);
chai.use(chaiAsPromised);

export default chai;

export const { expect } = chai;
