import { describe, expect, it } from "vitest";
import { StateMachine, StateHandlers } from "./StateMachine";

type Phase = "entering" | "checking" | "won";

interface Context {
    log: string[];
    should_win: boolean;
}

function build(context: Context): StateMachine<Phase, Context> {
    const states: Record<Phase, StateHandlers<Phase, Context>> = {
        entering: {
            enter: (c, from) => c.log.push(`enter entering from ${from}`),
            exit: (c, to) => c.log.push(`exit entering to ${to}`),
        },
        checking: {
            enter: (c, from) => c.log.push(`enter checking from ${from}`),
            exit: (c, to) => c.log.push(`exit checking to ${to}`),
            update: (c) => (c.should_win ? "won" : "entering"),
        },
        won: {
            enter: (c) => c.log.push("enter won"),
        },
    };
    return new StateMachine(states, "entering", context);
}

describe("StateMachine", () => {
    it("enters the initial state with from === null", () => {
        const context: Context = { log: [], should_win: false };
        const machine = build(context);
        expect(machine.current).toBe("entering");
        expect(machine.previous).toBeNull();
        expect(machine.is("entering")).toBe(true);
        expect(context.log).toEqual(["enter entering from null"]);
    });

    it("runs exit before enter on a transition and tracks previous", () => {
        const context: Context = { log: [], should_win: false };
        const machine = build(context);
        context.log.length = 0;
        machine.transition("checking");
        expect(context.log).toEqual([
            "exit entering to checking",
            "enter checking from entering",
        ]);
        expect(machine.current).toBe("checking");
        expect(machine.previous).toBe("entering");
    });

    it("re-enters when transitioning to the same state", () => {
        const context: Context = { log: [], should_win: false };
        const machine = build(context);
        machine.update(2);
        context.log.length = 0;
        machine.transition("entering");
        expect(context.log).toEqual([
            "exit entering to entering",
            "enter entering from entering",
        ]);
        expect(machine.seconds_in_state).toBe(0);
    });

    it("follows exactly one transition per update", () => {
        const context: Context = { log: [], should_win: true };
        const machine = build(context);
        machine.transition("checking");
        context.log.length = 0;
        machine.update(0.1);
        expect(machine.current).toBe("won");
        expect(context.log).toEqual(["exit checking to won", "enter won"]);
        // "won" has no update: the machine stays.
        machine.update(0.1);
        expect(machine.current).toBe("won");
    });

    it("lets update choose a state from the context", () => {
        const context: Context = { log: [], should_win: false };
        const machine = build(context);
        machine.transition("checking");
        machine.update(0.5);
        expect(machine.current).toBe("entering");
        expect(machine.previous).toBe("checking");
    });

    it("accumulates seconds_in_state and resets it on transition", () => {
        const context: Context = { log: [], should_win: false };
        const machine = build(context);
        machine.update(0.25);
        machine.update(0.25);
        expect(machine.seconds_in_state).toBeCloseTo(0.5);
        machine.transition("checking");
        expect(machine.seconds_in_state).toBe(0);
        machine.update(0.1);
        // checking's update returned "entering": the timer belongs to the new state now.
        expect(machine.current).toBe("entering");
        expect(machine.seconds_in_state).toBe(0);
    });

    it("notifies listeners and unsubscribes them", () => {
        const context: Context = { log: [], should_win: false };
        const machine = build(context);
        const seen: string[] = [];
        const unsubscribe = machine.on_transition((from, to) =>
            seen.push(`${from}->${to}`),
        );
        machine.transition("checking");
        machine.transition("won");
        unsubscribe();
        machine.transition("entering");
        expect(seen).toEqual(["entering->checking", "checking->won"]);
    });

    it("rejects an unknown state", () => {
        const context: Context = { log: [], should_win: false };
        const machine = build(context);
        expect(() => machine.transition("lost" as Phase)).toThrow(
            /unknown state/,
        );
        expect(machine.current).toBe("entering");
    });
});
