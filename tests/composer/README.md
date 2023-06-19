# Service composition example

These tests provide a simple example of how to implement a service composition agent using the Mahler API.

The composer uses the docker API to pull service images and create/destroy containers depending on the target given
to the agent.

## Usage

To run the example, use the following

```
# Install dependencies
npm install logging

# Enable logging (options: trace,debug,info,warn,error)
export DEBUG=mahler:error,mahler:warn,mahler:info

# Run tests
npm run test:integration -- -g "composer/*"
```

## Included files

- [state.ts](./state.ts) type definitions used by tasks. In particular it defines the `App` state which is the top level object that tasks, planner and agent interact with.
- [tasks.ts](./tasks.ts) this is the bulk of the composer implementation, task definitions provide the order of operations
  that allows the planner to find the right paths to the target.
- [tasks.spec.ts](./tasks.spec.ts) example on how to use the Task interface to test task definitions for bugs.
- [planner.ts](./planner.ts) planner setup for use in planning and agent tests
- [planning.ts](./planning.spec.ts) tests to check that task definitions allow the planner to find the right paths to different targets
- [agent.spec.ts](./agent.spec.ts) integration tests on the agent to check that the system is modified as expected when given different targets.

## Tasks

See comments in [tasks definitions](./tasks.ts) for more details.

| Task    | Effect                                              | Condition                                                                                                           |
| ------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| fetch   | Pull service image and update image list            | The image has not been downloaded yet                                                                               |
| install | Create service container and set state to `created` | The image is present and the container has not been created                                                         |
| start   | Start service container                             | The service container has been created with the same configuration as the target service and is not running already |
| stop    | Stop a service container                            | The service container exists and is running                                                                         |
| remove  | Remove a service container                          | The service container exists and is not running                                                                     |
