import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as sinonChai from 'sinon-chai';

export { log, logger, trace } from './console';

chai.use(sinonChai);
chai.use(chaiAsPromised);

export default chai;

export const { expect } = chai;
