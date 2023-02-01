# Planner (experimental, to be named)

An experimental HTN planner for building autonomous system agents.

## Features

- Simple, declarative API. Define tasks from a JS object and use those tasks as functions in other methods. Declare the applicability of the task
  to a specific part of the state or to a specific state operation (create, update, delete).
- External interface to allow re-planning if goals change. Integrated event dispatcher allows external agents to track changes in state as the plan is executed.
- Support for re-planning and cancelling current plan if goals or state changes by external target. The planner allows to use error data from previous runs in order to perform error recovery tasks.
- Easy to debug. A failure to find a plan reports the initial and target states for easy reproducibility.

## Concepts

- **Autonomous system agent** a process on a system that needs to operate with little or not feedback from the outside world. An autonomous agent needs to be able to recover from failures and adapt if conditions on the system change while performing its duties. In our definition, such an agent operates based on a given goal and will keep trying to achieve the goal until the goal changes or some other exit conditions are met.
- **Hierarchical Task Network (HTN)** is a type of automated planning system that allows to define actions in the planning domain in a hierarchical manner, allowing actions to be re-used as part of compound tasks. This reduces the search domain and provides developers more control on what plans are preferable (over something like [STRIPS](https://es.wikipedia.org/wiki/STRIPS)). This has made this type of system popular in [game design](https://www.youtube.com/watch?v=kXm467TFTcY).
- **Task** a task is any operation defined by a domain expert to provide to the planner. A task can be an _action_, e.g. "download a file", "write X to the database", or a _method_, i.e. a compound task, that provides a sequence of steps to follow.
- **Action Task** an action task is defined by a _condition_, i.e. some predicate on the system state that needs to be true before the task can be chosen, an _effect_, i.e. a transformation on the state that will result from running the action, and an action function, which is the actual operation that will be executed by the plan runner when the task is chosen.
- **Plan** a plan is a sequence of actions to execute in order to achieve a certain goal.
- **Goal** a goal is a desired state of the system. e.g, "temperature of the room == 25 degrees".
- **Sensor** a sensor is an observer of the system state, the agent can subscribe to one or more sensors in order to keep its local view of the state up-to-date and trigger re-planning if necessary.

## Design

The library design is inspired by the work in [Exploring HTN Planners through example](https://www.gameaipro.com/GameAIPro/GameAIPro_Chapter12_Exploring_HTN_Planners_through_Example.pdf).

![Planner design](./design.png)

## Example

Let's write an agent that switches the Wi-Fi network from a list of SSIDs if Internet connectivity is lost. The first step is to declare the shape of the state.

```typescript
type NetworkId = string;

type Network = {
	ssid: string;
	psk: string;
	// To indicate if we have already
	// authenticated with the network
	authenticated: boolean;
	// We are connected to this network.
	connected: boolean;
	// Indicates if the network is reachable a range 0 to 100%
	// 0% means the network is out of reach
	signal: number;
};

// The state represents everything the agent
// knows about the world
type State = {
	current: NetworkId | null;
	// We not only are connected, but we have access to the internet
	internetAccess: boolean;
	knownNetworks: { [id: NetworkId]: Network };
};
```

Now we define tasks for the agent. First we need a way to tell the planner to update the list of known networks.

```typescript
const addNetwork = Task.of({
	// This tells the planner to only consider this task if the state
	// is performing a create operation
	op: 'create',
	// This tells the planner that the task applies to a change in the known network
	// list. The `:id` variable will provided as part of the context to the tasks
	path: '/knownNetworks/:id',
	// Only run this task if the network is not part of the list yet
	condition: (state: State, network) =>
		!state.knownNetworks.keys().includes(network.id),
	// The effect of the task is that the target network should now be part
	// of the known network list. The `network` context object provides the
	// functional lens funtions `set` and `get` that allow to easily modify
	// a specific part of the state
	effect: (state: State, network) => network.set(state, network.target),
	// The action is what will be run by the task planner if the action gets selected.
	action: async (state: State, network) => {
		/* TODO: actually store the network in a local database */
	},
});
```

Now let's define tasks to authenticate and connect to a specific network.

```typescript
const authenticate = Task.of({
	// We don't care about the operation so we use `*`, this is the default so
	// it can be omitted
	op: '*',
	// This task applies to a specific network
	path: '/knownNetworks/:id',
	// Only run if the network is within reach and not authenticated
	condition: (state: State, network) =>
		network.get(state).signal > 0 &&
		!network.get(state).authenticated
	// The task has the effect of modifying the network state to authenticate
	effect: (state: State, network) => network.set(state, {...network.get(state), authenticated: true})
	// The action interacts with the system to authenticate with the SSID
	action: async (state: State, network) => {/* TODO: actually authenticate to the network */ }
});


const connect = Task.of({
	// This task applies to a specific network
	path: '/knownNetworks/:id',
	// Only run if the network is not connected and the network is at least 20%
	condition: (state: State, network) =>
		network.get(state).signal > 20 &&
		network.get(state).authenticated &&
		!network.get(state).connected,
	// The task has the effect of modifying the network state to connected
	effect: (state: State, network) => network.set(state, {...network.get(state), connected: true})
	// The action interacts with the system to switch SSIDs
	action: async (state: State, network) => {/* TODO: actually connect to the network */ }
});
```

The two tasks above define how to perform the connection and authentication operations against a specific SSID, however we usually will want to run both if the network is not connected. Here is where methods are useful, we can define a method that will try to authenticate first and then connect.

```typescript
const authenticateAndConnect = Task.of({
	path: '/knownNetworks/:id',
	// Run this method if the network is not connected and the signal is good
	condition: (state: State, network) =>
		network.get(state).signal > 20 && !network.get(state).connected,
	method: (state: State, network) => {
		const tasks = []; // A method returns a list of tasks
		const { id, target } = network;
		if (network.get(state).authenticated) {
			// Add an authentication step to the list of tasks
			// Calling the the `authenticate` task as a function "grounds" the task
			// with the specified arguments
			tasks.push(authenticate({ id, target }));
		}

		// Now add the connect instruction
		tasks.push(connect({ id, target }));
	},
});
```

Since the method is applicable to the same path than the previously defined tasks, the planner will prefer it over the individual tasks.

Our planner needs to switch networks if Internet access is lost, so we need to define a method to chose between the list of available known networks
for those that are in reach and try them.

```typescript
const switchNetworks = Task.of({
	// Only run if the system lost internet access
	condition: (state: State) => !state.internetAccess,
	// Chose from the list of known networks one different than the current
	// network and that has signal
	method: (state: State) => {
		// we find the first network with good enough signal that is not
		// the current network.
		// NOTE: a better approach could be to sort the networks by signal id
		const networkId = Object.keys(state.knownNetworks).find(
			(id) => id != state.current && state.knownNetworks[id].signal > 20,
		);

		if (!networkId) {
			// We return an empty array to tell the planner that this method
			// is not applicable to the current state
			return [];
		}

		// We found a candidate
		return [
			authenticateAndConnect({
				id: networkId,
				target: state.knownNetworks[id],
			}),
		];
	},
});
```

Finally we need to define some sensors, one to scan for available networks, and one to test the internet connectivity of the system.

```typescript
// TODO: define the sensor API
const networkScanner = Sensor.of<State>({
	path: '/knownNetworks',
	sensor: async (lens, subscriber) => {
		while (true) {
			// TODO: read signal
			subscriber.next(updatedNetworks);
		}
	},
});

const connectivityCheck = Sensor.of<State>({
	path: '/knownNetworks',
	sensor: async (lens, subscriber) => {
		while (true) {
			// TODO: ping www.google.com and get connectivity
			subscriber.next(internetAccessState);
		}
	},
});
```

Now that we have all our tasks and sensors defined, we can define our agent

```typescript
const agent = Agent.of<State>({
		initial: {current: null, internetAccess: false, knownNetworks: {}},
		tasks: [addNetwork, connect, authenticate, authenticateAndConnect, switchNetworks],
		sensors: [networkScanner, connectivityCheck]
	});

// Set an initial goal for the agent. New goals can be defined once the agent is started
// Note that we don't need to provide a current network, we only care that the agent remains connected
agent.goal({connected: true, knownNetworks: {home1: {ssid: 'My Home', psk: ''}, office1: {ssid: 'First floor', psk: ''}, office2: {ssid: 'Second floor', psk: ''}}})

// Start the agent. Set it to keep retrying to reach the goal and waiting
// 60 seconds goal check and retrying if nothing changes
agent.start({maxRetries: 0, retryTimeout: 60});


// We can modify the goal after the agent has started. In this case we are adding a new network, which
// will cause the agent to re-calculate the plan to include the `addNetwork` task.
agent.goal({knownNetworks: {
		home1: {ssid: 'My Home', psk: ''},
		office1: {ssid: 'First floor', psk: ''},
		office2: {ssid: 'Second floor', psk: ''}
		office3: {ssid: 'Kitchen', psk: ''}
	}})

```
