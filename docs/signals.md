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
Several kinds of event through one socket. An event is a class with a static `EVENT_NAME`; a listener attaches to a class and gets only its events. For things that happen, once each: a sale, a click (every UI widget has one as `events`).

```typescript
class SaleEvent extends EventBase {
    public static readonly EVENT_NAME = 'market.sale';
    public constructor(public readonly amount: number) {
        super(SaleEvent.EVENT_NAME);
    }
}

const market = new EventSocket<SaleEvent | MissEvent>();
market.attach(SaleEvent, (event) => play_sound('coin'));
market.dispatch(new SaleEvent(3));
market.detach(SaleEvent); // or by the handle attach() returned
```

## ObservableSocket
A value that tells its listeners when it changes, with `{ old, new }`. For state that several widgets show: cash, a price, a stock.

```typescript
const cash = new ObservableSocket(20);
cash.watch((change) => (cash_label.value = `${change.new} €`)); // at once, then on every change
cash.attach((change) => (buy_button.is_disabled = change.new < 9));
cash.set(cash.get() - 9);
```

- Listeners already read the new value from `get()`.
- Setting the same value (`Object.is`) tells nobody.
- `watch()` attaches and calls at once with the current value.

Handles are never reused, not even after `detach_all()`.

## ChainProperty
A property whose `set()` returns its owner, so settings can be chained. It doesn't tell anyone about changes.

### Usage
```typescript
class Zoo {
    public foo = new ChainProperty<Zoo, number>(this, 0);
    public bar = new ChainProperty<Zoo, string>(this, 'hello');
}
new Zoo().foo.set(5).bar.set('hey');
```
