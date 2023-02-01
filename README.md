# Planner (experimental, to be named)

An experimental HTN planner for building autonomous system agents.

## Features

- Simple, declarative API. Tasks can be defined around operations over the system state (create, update, delete), which
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

![Planner design](./design.svg)

## Example

Let's write an agent that switches the Wi-Fi network from a list of SSIDs if Internet connectivity is lost.
