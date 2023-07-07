# Mahler

A automated task composer and [HTN](https://en.wikipedia.org/wiki/Hierarchical_task_network) based planner for building autonomous system agents.

**NOTE** this project is still experimental, and ongoing active development.

## Features

- Simple, declarative API. Tasks are straightforward to define by declaring a pre-condition, effect, action and applicability. A task can be applicable to a specific part of the state object and/or data operation (create, update, delete). Tasks can be referenced in compound tasks (methods), to create more curated behaviors. Task runtime errors during previous plan executions may be used as contextual information to allow the planner to find alternative paths on the nexts run.
- Highly configurable agent interface allows to create autonomous agents to serve a wide variety of use cases. The state of the agent can be queried at any point of the execution and observable interface allows to follow changes to the state or errors during the plan execution. Plans can be interrupted and goals can be modified if system objectives change.
- Sensor interface allows to monitor changes in the state of the system coming from external events. Updated state may be used by agents to trigger a re-plan when necessary.
- Easy to debug. Error reporting includes information about system state and goals for easy replicability.
- Log ready. Agent uses task metadata and execution context to generate clear logs to communicate the state of the system to end users or for debugging. Plug your own logger to suit your system needs.

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

Let's write an agent for a simple Space Heater controller. The heater design is very simple, it is composed by a resistor that can be turned ON or OFF to heat the room, and a termometer that detects the room temperature. The heater interface allows to set a target room temperature. The controller will turn the resistor ON if the temperature is below target or OFF if the temperature is above target.

Let's start first by modelling the state. As the per the hardware design, the state needs to keep track of the resistor state and the room temperature.

```typescript
type Heater = { roomTemp: number; resistorOn: boolean };
```

Now let's define a task for turning the heater ON.

```typescript
const turnOn = Task.of({
	// Only run this task if the room temperature is below target
	condition: (state: Heater, { target }) =>
		state.roomTemp < target.roomTemp && !state.resistorOn,
	// What should the planner expect after running this task
	effect: (state: Heater, { target }) => ({
		...state,
		// Turning the resistor on does not change the temperature
		// immediately, but the effect is that the temperature eventually
		// will reach that point
		roomTemp: target.roomTemp,
		resistorOn: true,
	}),
	// The actual operation that will be ran by the plan runner
	action: async (state: Heater) => {
		// TODO: trigger the actuator to actually turn the resistor ON

		// Return the updated state
		return {
			...state,
			resistorOn: true,
		};
	},
	// A description of the task to use for logging purposes
	description: 'turn resistor ON',
});
```

A task, at minimum should define the following properties.

- A _condition_, this tells the planner when the task is applicable. In this case the task should be ran only if the temperature is below target and the current state of the resistor is OFF.
- An _effect_. This tells the planner what is the expected outcome of running the task. This allows the planner to decide that a potential plan allows to reach the target. As observed in the code, the effect is an intended outcome but it doesn't mean that the outcome is immediate. The effect function should not have any side effects.
- An _action_. This is the operation that will actually be ran by the plan runner and can modify the state of the system. It must return the modified state.

Opionally, a task may define the following properties

- A _description_, this is a string or a function that describes the task purpose. It is used for logging by the Agent.
- A _path_. This is a pointer to a part of the state that this action applies to, it defaults to '/', meaning task by default apply to the full state object. This will become more clear in the next example.
- An operation _op_ (`create`, `update`, `delete`, `*`), that this task is applicable for, for instance certain tasks may be relevant only when _deleting_ a certain element of the state (e.g. removing a system service). This property defaults to `update` as this is the most commona operation. Setting the `op` to `*` means that the task is applicable to any operation.

Continuing with our example, as we defined a task to turn the heater ON, we need to define another to turn the heater resistor OFF.

```typescript
const turnOff = Task.of({
	condition: (state: Heater, { target }) =>
		state.roomTemp > target.roomTemp && !!state.resistorOn,
	effect: (state: Heater, { target }) => ({
		...state,
		roomTemp: target.roomTemp,
		resistorOn: false,
	}),
	action: async (state: Heater) => ({
		...state,
		resistorOn: false,
	}),
	description: 'turn resistor OFF',
});
```

These two tasks specify the case where the temperature is off-target and the resistor is in the wrong state, however, what happens if the resistor is in the right state, but the temperature just has not been reached yet? In that case the planner would not be able to find any applicable tasks and fail. We can solve this by defining a task to handle this case.

```typescript
const wait = Task.of({
	condition: (state: Heater, { target }) =>
		// We have not reached the target but the resistor is already OFF
		(state.roomTemp > target.roomTemp && !state.resistorOn) ||
		// We have not reached the target but the resistor is already ON
		(state.roomTemp < target.roomTemp && !!state.resistorOn),
	effect: (state: Heater, { target }) => ({
		...state,
		roomTemp: target.roomTemp,
	}),
	// Nothing to do here, we let the agent wait
	action: NoOp,
	description: 'wait for temperature to reach target',
});
```

Finally, we need to define a temperature _Sensor_, a sensor monitors the state of the system allowing the agent to keep an up-to-date view of the world.

```typescript
const termometer = Sensor.of(async (subscriber: Subscriber<Heater>) => {
	while (true) {
		// TODO: read the actual temperature from the hardware
		const temp = 10;

		// The sensor subscriber receives a function that receives the current state as argument
		// and returns the updated state
		subscriber.next((state) => {
			// Update the temperure in the state object
			return { ...state, roomTemp: temp };
		});

		// Wait 100ms before querying the sensor again
		await setTimeout(100);
	}
});
```

Now that we have our tasks and our sensor defined, we can create our Heater agent.

```typescript
const Heater = Agent.of({
	// Provide the initial state of the world
	initial: { roomTemp: 10, resistorOn: false },

	// The tasks that the agent uses for planning
	tasks: [turnOn, turnOff, wait],

	// The sensors the agent uses to read the system state
	sensors: [termometer],

	// The `follow` flag tells the agent to keep monitoring
	// the state and re-plan if the state gets off-target.
	// By default, the agent wil terminate as soon as the
	// target has been reached.
	opts: { follow: true },
});
```

With that we can start the Heater controller with a specified target.

```typescript
// We can subscribe to temperature changes that are happening as the agent
// is running
Heater.subscribe((s) => console.log('Temperature is: ', s.roomTemp));

// Set the heater target temperature to 23 degrees
Heater.seek({ roomTemp: 23 });

// Wait for the heater to reach the target
await Heater.wait();
```

The above instruction will start the agent and have it run forever (because of the `follow: true`). The Heater will continue monitoring the room temperature and turning the resistor ON or OFF as the temperature goes outside the expected value.

## Another example

Let's now write an agent that monitors the connectivity of a system and switches the Wi-Fi network from a list of SSIDs if Internet connectivity is lost. As before, the first step is to declare the shape of the state.

```typescript
type NetworkId = string;

type Network = {
	ssid: string;
	psk: string;
	// To indicate if we have already
	// authenticated with the network
	authenticated?: boolean;
	// We are connected to this network.
	connected?: boolean;
	// Indicates if the network is reachable a range 0 to 100%
	// 0% means the network is out of reach
	signal?: number;
};

// The state represents everything the agent
// knows about the world
type State = {
	currentNetwork?: NetworkId;
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
		return network.set(state, network.target);
	},
	// We can add a description that will be used in the logs
	description: (network) => `create network ${network.id}`,
});
```

As we mentioned in the previous example, the applicability of a task can be further specified by the use of the `op` and `path` properties. The `op` property, tells the planner that this task is applicable only for a specific type of modification of the state. For instance, in the example above, the `op: 'create'` tells the planner that this task is applicable only if the given target is introducing a new entry to the `/knownNetworks` dictionary. The `path` object, tells the planner that the task is relevant for changes to a specific portion of the state object. In the example above, the `path: '/knownNetworks/:id'` tells the planner the task is only relevant for values of the `knownNetworks` dictionary.

Now let's define tasks to authenticate and connect to a specific network.

```typescript
const authenticate = Task.of({
	// This task applies to a specific network
	path: '/knownNetworks/:id',
	// Only run if the network is within reach and not authenticated
	condition: (state: State, network) =>
		network.get(state).signal > 0 &&
		!network.get(state).authenticated
	// The task has the effect of modifying the network state to authenticate
	effect: (state: State, network) => network.set(state, {...network.get(state), authenticated: true}),
	// The action interacts with the system to authenticate with the SSID
	action: async (state: State, network) => {
		/* TODO: actually authenticate to the network */
		return network.set(state, {...network.get(state), authenticated: true});
	},
	description: (network) => `authenticate network ${network.id}`,
});


const connect = Task.of({
	// This task applies to a specific network
	path: '/knownNetworks/:id',
	// Only run if the network is not connected and the signal is at least 20%
	condition: (state: State, network) =>
		network.get(state).signal > 20 &&
		network.get(state).authenticated &&
		!network.get(state).connected,
	// The task has the effect of modifying the network state to connected
	effect: (state: State, network) => network.set(state, {...network.get(state), connected: true}),
	// The action interacts with the system to switch SSIDs
	action: async (state: State, network) => {
		/* TODO: actually connect to the network */
		return network.set(state, {...network.get(state), connected: true});
	},
	description: (network) => `connect to network ${network.id}`,
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
			// with the specified context
			tasks.push(authenticate({ id, target }));
		}

		// Now add the connect instruction
		tasks.push(connect({ id, target }));

		return tasks;
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
			(id) => id != state.currentNetwork && state.knownNetworks[id].signal > 20,
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
const networkScanner = Sensor.of(async (subscriber: Subscriber<State>) => {
	while (true) {
		// TODO: read signal

		// Subscribers pass the current state object to the sensor, and the sensor
		// modifies the state with the updated data
		subscriber.next((state) => ({ ...state, knownNetworks: updatedNetworks }));

		// Scan the network again in 60 seconds
		await setTimeout(60 * 1000);
	}
});

const connectivityCheck = Sensor.of(async (subscriber: Subscriber<State>) => {
	while (true) {
		// TODO: ping www.google.com and get connectivity

		// Modify the state passed to the subscriber with the connectivity status
		subscriber.next((state) => ({
			...state,
			internetAccess: currentInternetAccess,
		}));

		// Check the connectivity again in 60 seconds
		await setTimeout(60 * 1000);
	}
});
```

Now that we have all our tasks and sensors defined, we can define our agent

```typescript
const WifiConnect = Agent.of<State>({
	initial: { internetAccess: false, knownNetworks: {} },
	tasks: [
		addNetwork,
		connect,
		authenticate,
		authenticateAndConnect,
		switchNetworks,
	],
	sensors: [networkScanner, connectivityCheck],
	opts: {
		// We want the agent to run forever
		follow: true,
		// And keep retrying on failure (this is the default)
		maxRetries: 0,
	},
});
```

Now we start can start the agent with the initial target. As this introduces new networks and requires that the
system is connected, this will add the networks to the internal database, perform authentication tasks and connect to
the first network that is available.

```typescript
WifiConnect.seek({
	connected: true,
	knownNetworks: {
		home1: { ssid: 'My Home', psk: '' },
		office1: { ssid: 'First floor', psk: '' },
		office2: { ssid: 'Second floor', psk: '' },
	},
});
```

We can modify the target after the agent has started. In this case we are adding a new network, which
will cause the agent to re-calculate the plan to include the `addNetwork` task. Internally, this will stop
the currently running agent execution and trigger a search for a new target.

```typescript
WifiConnect.seek({
	connected: true,
	knownNetworks: {
		home1: { ssid: 'My Home', psk: '' },
		office1: { ssid: 'First floor', psk: '' },
		office2: { ssid: 'Second floor', psk: '' },
		office3: { ssid: 'Kitchen', psk: '' },
	},
});
```

## More examples

You can see more examples in the [planner unit tests](lib/planner.spec.ts), the [agent unit tests](lib/agent.spec.ts) or the [service composition](./tests/composer/) and [service orchestration](./tests/orchestrator/) tests under the [tests](./tests) folder.

To run the examples, use the following

```
# Install dependencies
npm install logging

# Enable logging (options: trace,debug,info,warn,error)
export DEBUG=mahler:error,mahler:warn,mahler:info

# Run integration tests
npm run test:integration
```
