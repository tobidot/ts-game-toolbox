import { describe, expect, it } from "vitest";
import { EventBase, EventSocket } from "./EventSocket";
import { ObservableSocket } from "./ObservableSocket";
import { SignalSocket } from "./SignalSocket";

class SaleEvent extends EventBase {
    public static readonly EVENT_NAME = "test.sale";
    public constructor(public readonly amount: number) {
        super(SaleEvent.EVENT_NAME);
    }
}

class MissEvent extends EventBase {
    public static readonly EVENT_NAME = "test.miss";
    public constructor() {
        super(MissEvent.EVENT_NAME);
    }
}

type MarketEvent = SaleEvent | MissEvent;

describe("SignalSocket", () => {
    it("tells every listener, until it's detached", () => {
        const socket = new SignalSocket<number>();
        const heard: string[] = [];
        const first = socket.attach((value) => {
            heard.push(`a${value}`);
        });
        socket.attach((value) => {
            heard.push(`b${value}`);
        });

        socket.dispatch(1);
        expect(socket.detach(first)).toBe(true);
        socket.dispatch(2);

        expect(heard).toEqual(["a1", "b1", "b2"]);
        expect(socket.detach(first)).toBe(false);
    });

    it("an old handle can't detach a listener attached after detach_all", () => {
        const socket = new SignalSocket<number>();
        const old = socket.attach(() => {});
        socket.detach_all();
        const heard: number[] = [];
        socket.attach((value) => {
            heard.push(value);
        });

        expect(socket.detach(old)).toBe(false);
        socket.dispatch(3);

        expect(heard).toEqual([3]);
    });

    it("a listener attached during a dispatch hears only the next one", () => {
        const socket = new SignalSocket<number>();
        const heard: number[] = [];
        socket.attach(() => {
            socket.attach((value) => {
                heard.push(value);
            });
        });

        socket.dispatch(1);
        socket.detach(0);
        socket.dispatch(2);

        expect(heard).toEqual([2]);
    });
});

describe("ObservableSocket", () => {
    it("has the new value when it tells, with the old one in the signal", () => {
        const cash = new ObservableSocket(20);
        const heard: string[] = [];
        cash.attach((change) => {
            heard.push(`${change.old}>${change.new}, get ${cash.get()}`);
        });

        cash.set(25);

        expect(heard).toEqual(["20>25, get 25"]);
    });

    it("says nothing when the value stays the same", () => {
        const stock = new ObservableSocket(5);
        let count = 0;
        stock.attach(() => {
            count++;
        });

        stock.set(5);
        stock.set(4);
        stock.set(4);

        expect(count).toBe(1);
        expect(stock.get()).toBe(4);
    });

    it("watch() tells at once with the current value, then on every change", () => {
        const price = new ObservableSocket(3);
        const heard: string[] = [];

        price.watch((change) => {
            heard.push(`${change.old}>${change.new}`);
        });
        price.set(4);

        expect(heard).toEqual(["3>3", "3>4"]);
    });
});

describe("EventSocket", () => {
    it("tells a listener only the events of its class", () => {
        const market = new EventSocket<MarketEvent>();
        const sales: number[] = [];
        let misses = 0;
        market.attach(SaleEvent, (event) => {
            sales.push(event.amount);
        });
        market.attach(MissEvent, () => {
            misses++;
        });

        market.dispatch(new SaleEvent(3));
        market.dispatch(new MissEvent());
        market.dispatch(new SaleEvent(5));

        expect(sales).toEqual([3, 5]);
        expect(misses).toBe(1);
    });

    it("detaches by handle or by class", () => {
        const market = new EventSocket<MarketEvent>();
        let count = 0;
        const handle = market.attach(SaleEvent, () => {
            count++;
        });
        market.attach(MissEvent, () => {
            count += 10;
        });
        market.attach(MissEvent, () => {
            count += 100;
        });

        expect(market.detach(handle)).toBe(true);
        expect(market.detach(MissEvent)).toBe(true);
        market.dispatch(new SaleEvent(1));
        market.dispatch(new MissEvent());

        expect(count).toBe(0);
        expect(market.detach(MissEvent)).toBe(false);
    });

    it("an old handle can't detach a listener attached after detach_all", () => {
        const market = new EventSocket<MarketEvent>();
        const old = market.attach(SaleEvent, () => {});
        market.detach_all();
        let count = 0;
        market.attach(SaleEvent, () => {
            count++;
        });

        expect(market.detach(old)).toBe(false);
        market.dispatch(new SaleEvent(1));

        expect(count).toBe(1);
    });
});
