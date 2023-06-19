# Service orchestration example

These tests provide a simple example of how to implement a service orchestrator agent using the Mahler API.

The orchestrator can control the state of multiple apps in a device, an App should be running a single release at the time, and a release is composed by services. The orchestrator uses the Docker API to manage service state and perform updates to releases.

## Included files

- [state.ts](./state.ts) type definitions used by tasks. In particular it defines the `Device` state which is the top level object that tasks, planner and agent interact with.
- [tasks.ts](./tasks.ts) this is the bulk of the composer implementation, task definitions provide the order of operations
  that allows the planner to find the right paths to the target.
- [tasks.spec.ts](./tasks.spec.ts) example on how to use the Task interface to test task definitions for bugs.
- [planner.ts](./planner.ts) planner setup for use in planning and agent tests
- [planning.ts](./planning.spec.ts) tests to check that task definitions allow the planner to find the right paths to different targets
- [agent.spec.ts](./agent.spec.ts) integration tests on the agent to check that the system is modified as expected when given different targets.

## Tasks

See comments in [tasks definitions](./tasks.ts) for more details. Note that this is a very simple orchestrator implementation, and more complex update scenarios can be created.

| Task           | Effect                                                            | Condition                                                                                                                                                                                          |
| -------------- | ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fetch          | Pull service image and update image list                          | The image has not been downloaded yet                                                                                                                                                              |
| createApp      | Create an app in the state object from the target metadata        | The app does not exist yet                                                                                                                                                                         |
| createRelease  | Create a release in the state object                              | The release does not exist yet                                                                                                                                                                     |
| installService | Create service container for a release and set state to `created` | The service image is present and the container has not been created                                                                                                                                |
| startService   | Start service container                                           | The service container has been created with the same configuration as the target service, the service is not running already and no services with the same name from previous releases are running |
| stopService    | Stop a service container                                          | The service container exists and is running, and equivalent services from new releases have their containers created                                                                               |
| removeService  | Remove a service container                                        | The service container exists and is no longer running                                                                                                                                              |
| removeRelease  | Remove a release from the state object                            | There are no services left in the release                                                                                                                                                          |
| removeApp      | Remove an app from the state object                               | There are no releases left in the app                                                                                                                                                              |
