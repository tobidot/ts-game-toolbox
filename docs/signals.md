# Signals

Helpers to connect distant parts of the programs with events and signals.

## SignalSocket

A `SignalSocket` transmits a specific type of value to all attached listeners.

### Usage

```typescript
import { SignalSocket } from 'ts-game-toolbox';

const scoreSignal = new SignalSocket<number>();

const handle = scoreSignal.attach((score) => {
    console.log(`New score: ${score}`);
});

scoreSignal.dispatch(100);

scoreSignal.detach(handle);
```

## EventSocket

Similar to `SignalSocket`, but designed for event-based communication.

## ObservableSocket

A socket that can be observed for changes.

## ChainProperty

A property that can be chained and observed. When the value of a `ChainProperty` changes, it can trigger updates in other properties.

### Usage

```typescript
import { ChainProperty } from 'ts-game-toolbox';

const name = new ChainProperty<string>("John");
name.attach((newName) => {
    console.log(`Name changed to: ${newName}`);
});

name.set("Jane");
```
