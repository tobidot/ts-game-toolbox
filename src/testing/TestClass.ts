import { TestClassExceptionExpectedExcetpion } from "./exceptions/ExceptionExpectedException";

type Printable = { to_string(): string };
type Class<T> = { new (...args: any): T; name: string };

export abstract class TestClass {
    public abstract get_name(): string;
    public set_up() {
        console.log(this);
    }
    /**
     * Called when this test instance is being replaced/removed (e.g. the
     * dashboard is about to show another test, or run this one again).
     * Tests that start a long-running effect (e.g. a `requestAnimationFrame`
     * loop) should stop it here. This is intentionally NOT called right
     * after the test method returns, since that would immediately cancel
     * any animation the test just scheduled before it ever gets a chance
     * to render a single frame.
     */
    public tear_down() {}
    public set_class_up() {}
    public tear_class_down() {}
    public run_all_test_cases() {
        console.log(">>> Start " + this.get_name());
        this.set_class_up();
        for (const test_name of Object.getOwnPropertyNames(
            (<any>this).__proto__,
        )) {
            const test_statement = (<any>this)[test_name];
            if (
                typeof test_statement === "function" &&
                test_name.indexOf("test") === 0
            ) {
                console.log(
                    "%c > Run " + test_name,
                    "background: blue; color: yellow;",
                );
                this.set_up();
                test_statement.call(this);
                console.log("%c < Done ", "background: blue; color: green;");
            }
        }
        this.tear_class_down();
        console.log("<<< Done " + this.get_name());
    }

    public assert_exception<E extends Error>(
        exception: Class<E>,
        callback: () => void,
    ) {
        try {
            callback();
            throw new TestClassExceptionExpectedExcetpion(
                "Expected an exception from " + String(callback).substr(0, 255),
            );
        } catch (error) {
            if (!(error instanceof exception)) {
                throw error;
            }
            this.success();
        }
    }

    public assert_instance_of<T extends Printable>(
        value: Printable,
        expected: Class<T>,
    ): void {
        if (false === value instanceof expected) {
            throw new Error(
                "Expected " +
                    value.to_string() +
                    " to be of instance " +
                    expected.name,
            );
        }
        this.success();
    }

    public assert_equals<T>(value: T, expected: T): void {
        if (value !== expected) {
            throw new Error(
                "Expected " +
                    String(value) +
                    " to be equal to " +
                    String(expected),
            );
        }
        this.success();
    }

    public assert_not_equals<T>(value: T, expected: T): void {
        if (value === expected) {
            throw new Error(
                "Expected " +
                    String(value) +
                    " to be NOT equal to " +
                    String(expected),
            );
        }
        this.success();
    }

    public assert_true(value: boolean): void {
        if (value === false) {
            throw new Error("Expected " + String(value) + " to be true");
        }
        this.success();
    }

    public assert_false(value: boolean): void {
        if (value === true) {
            throw new Error("Expected " + String(value) + " to be false");
        }
        this.success();
    }

    private success() {
        console.log(".");
    }
}
