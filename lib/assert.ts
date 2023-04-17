import { strict as assert } from 'assert';
export { AssertionError } from 'assert';

// For now we use node assert here, but we will need to provide
// a custom implementation or use a polyfill for the library to
// support browsers.
export default assert;
