import { TestClassExceptionExpectedExcetpion } from "./exceptions/ExceptionExpectedException";

type Printable<T> = { toString(): string };
type Class<T> = { new(...args: any): T, name: string };
type Named<T> = { name: string };

export abstract class TestClass {
    public abstract get_name(): string;
    public set_up() { console.log(this); }
    public tear_down() { }
    public set_class_up() { }
    public tear_class_down() { }
    public run_all_test_cases() {
        const test = this;
        console.log(">>> Start " + test.get_name());
        this.set_class_up();
        for (const test_name of Object.getOwnPropertyNames((<any>test).__proto__)) {
            const test_statement = (<any>test)[test_name];
            if (typeof test_statement === "function" && test_name.indexOf('test') === 0) {
                console.log('%c > Run ' + test_name, 'background: blue; color: yellow;');
                test.set_up();
                test_statement.call(test);
                test.tear_down();
                console.log('%c < Done ', 'background: blue; color: green;');
            }
        }
        this.tear_class_down();
        console.log("<<< Done " + test.get_name());
    }

    public assert_exception<E extends Error>(exception: Class<E>, callback: () => void) {
        try {
            callback();
            throw new TestClassExceptionExpectedExcetpion('Expected an exception from ' + String(callback).substr(0, 255));
        } catch (error) {
            if (!(error instanceof exception)) throw error;
            this.success();
        }
    }

    public assert_instance_of<T extends Printable<T>>(value: Printable<T>, expected: Class<T>): void {
        if (false === value instanceof expected) {
            throw new Error('Expected ' + value?.toString() + ' to be of instance ' + expected.name);
        }
        this.success();
    }

    public assert_equals<T>(value: T, expected: T): void {
        if (value !== expected) {
            throw new Error('Expected ' + String(value) + ' to be equal to ' + String(expected));
        }
        this.success();
    }

    public assert_not_equals<T>(value: T, expected: T): void {
        if (value === expected) {
            throw new Error('Expected ' + String(value) + ' to be NOT equal to ' + String(expected));
        }
        this.success();
    }

    public assert_true<T>(value: boolean): void {
        if (value === false) {
            throw new Error('Expected ' + String(value) + ' to be true');
        }
        this.success();
    }

    public assert_false<T>(value: boolean): void {
        if (value === true) {
            throw new Error('Expected ' + String(value) + ' to be false');
        }
        this.success();
    }

    private success() {
        console.log('.');
    }
}