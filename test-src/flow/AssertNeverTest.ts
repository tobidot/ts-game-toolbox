import { assets } from "../../src/assets";
import { assert_never } from "../../src/flow/asserts/AssertNever";
import { TestClass } from "../../src/testing/TestClass";

enum Foo {
    A, B, C
}

export class AssertNeverTest extends TestClass {
    public get_name(): string {
        throw new Error("AssertNever Test");
    }

    public test_with_switch_statement(): void {
        let foo = [Foo.A, Foo.B, Foo.C][Math.trunc(Math.random() * 3)];
        switch (foo) {
            case Foo.A: return this.assert_true(true);
            case Foo.B: return this.assert_true(true);
            case Foo.C: return this.assert_true(true);
        }
        return assert_never(foo);
    }

    // Does not work, bacause typescript does not narrow down numbers
    //
    // public test_with_if_statement() {
    //     let x = Math.random();
    //     if (x < 0.5) return;
    //     if (x > 0.4) return;
    //     return assert_never(x);
    // }

    public test_with_if_statement() {
        let foo = [Foo.A, Foo.B, Foo.C][Math.trunc(Math.random() * 3)];
        if (foo === Foo.A) return this.assert_true(true);
        if (foo === Foo.B) return this.assert_true(true);
        if (foo === Foo.C) return this.assert_true(true);
        return assert_never(foo);
    }

    public test_with_string_narrowing() {
        let foo = ["A", "B", "C"][Math.trunc(Math.random() * 3)] as "A" | "B" | "C";
        if (foo === "A") return this.assert_true(true);
        if (foo === "B") return this.assert_true(true);
        if (foo === "C") return this.assert_true(true);
        return assert_never(foo);
    }
}