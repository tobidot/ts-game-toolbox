import { describe, expect, it } from "vitest";
import { TimedNotice } from "./TimedNotice";

describe("TimedNotice", () => {
    it("shows nothing at first", () => {
        expect(new TimedNotice().text).toBe(null);
    });

    it("shows its text until the time has run down", () => {
        const notice = new TimedNotice();
        notice.show("Zu wenig Gold", 1);
        notice.update(0.6);
        expect(notice.text).toBe("Zu wenig Gold");
        notice.update(0.6);
        expect(notice.text).toBe(null);
    });

    it("starts over on a new message, and goes at once when cleared", () => {
        const notice = new TimedNotice();
        notice.show("a", 1);
        notice.update(0.9);
        notice.show("b", 1);
        notice.update(0.9);
        expect(notice.text).toBe("b");
        notice.clear();
        expect(notice.text).toBe(null);
    });
});
