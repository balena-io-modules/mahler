module.exports = {
	bail: true, // Exit test script on first error
	exit: true, // Force Mocha to exit after tests complete
	recursive: true, // Look for tests in subdirectories
	require: ['ts-node/register/transpile-only', 'tsconfig-paths/register'],
	timeout: '30000', // Give a larger timeout as some of the integration tests may take a while
};
