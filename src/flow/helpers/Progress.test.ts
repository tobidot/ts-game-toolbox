import { describe, expect, it } from "vitest";
import { Progress } from "./Progress";

describe("Progress", () => {
    it("adds up its children, each weighing one", () => {
        const progress = new Progress(2);
        const first = progress.make_child_progress(1);
        const second = progress.make_child_progress(4);
        first.mark_as_done();
        second.set_self_progress(2);
        expect(progress.get_percent()).toBeCloseTo(0.75);
    });

    it("has nothing to do and is done when its total is 0", () => {
        expect(new Progress(0).get_percent()).toBe(1);
        const parent = new Progress(1);
        parent.make_child_progress(0);
        expect(parent.get_percent()).toBe(1);
    });

    it("grows by one for each task appended while it runs", () => {
        const progress = new Progress(0);
        const heard: number[] = [];
        progress.listen((percent) => heard.push(percent));
        const first = progress.append_child_progress();
        expect(progress.get_percent()).toBe(0);
        first.mark_as_done();
        expect(progress.get_percent()).toBe(1);
        const second = progress.append_child_progress(10);
        expect(progress.get_percent()).toBe(0.5);
        second.set_self_progress(5);
        expect(progress.get_percent()).toBe(0.75);
        expect(heard).toEqual([0, 1, 0.5, 0.75]);
    });

    it("takes an appended task back, and its share with it", () => {
        const progress = new Progress(0);
        const done = progress.append_child_progress();
        const dropped = progress.append_child_progress();
        done.mark_as_done();
        expect(progress.get_percent()).toBe(0.5);
        expect(progress.remove_child_progress(dropped)).toBe(true);
        expect(progress.get_percent()).toBe(1);
        // Not a child (any more): nothing changes.
        expect(progress.remove_child_progress(dropped)).toBe(false);
        expect(progress.get_percent()).toBe(1);
        progress.remove_child_progress(done);
        expect(progress.get_percent()).toBe(1);
    });
});
