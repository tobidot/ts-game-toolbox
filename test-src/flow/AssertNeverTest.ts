import { assert_never } from "../../src/flow/asserts/AssertNever";
import { TestClass } from "../../src/testing/TestClass";

enum Foo {
    A,
    B,
    C,
}

export class AssertNeverTest extends TestClass {
    public get_name(): string {
        return "AssertNever Visual Demo";
    }

    public test_demo_logic() {
        console.log(
            "This test demonstrates compile-time exhaustiveness checking.",
        );
        console.log(
            "See src/flow/asserts/AssertNever.test.ts for non-interactive unit tests.",
        );

        const foo = [Foo.A, Foo.B, Foo.C][Math.trunc(Math.random() * 3)];
        let handled = false;
        switch (foo) {
            case Foo.A:
                console.log("Handled A");
                handled = true;
                break;
            case Foo.B:
                console.log("Handled B");
                handled = true;
                break;
            case Foo.C:
                console.log("Handled C");
                handled = true;
                break;
            default:
                assert_never(foo);
        }
        this.assert_true(handled);
    }
}
