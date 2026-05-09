import { describe, it, expect } from "vitest";
import { assert_never } from "./AssertNever";

enum Foo {
    A,
    B,
    C,
}

describe("assert_never", () => {
    it("should work with switch statement narrowing", () => {
        const foo = Foo.A as Foo;
        let result = "";
        switch (foo) {
            case Foo.A:
                result = "A";
                break;
            case Foo.B:
                result = "B";
                break;
            case Foo.C:
                result = "C";
                break;
            default:
                assert_never(foo);
        }
        expect(result).toBe("A");
    });

    it("should work with if statement narrowing", () => {
        const foo = Foo.B as Foo;
        let result = "";
        if (foo === Foo.A) result = "A";
        else if (foo === Foo.B) result = "B";
        else if (foo === Foo.C) result = "C";
        else assert_never(foo);

        expect(result).toBe("B");
    });

    it("should work with string narrowing", () => {
        const foo = "C" as "A" | "B" | "C";
        let result = "";
        if (foo === "A") result = "A";
        else if (foo === "B") result = "B";
        else if (foo === "C") result = "C";
        else assert_never(foo);

        expect(result).toBe("C");
    });
});
