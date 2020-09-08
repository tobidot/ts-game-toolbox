import { TestClass } from "../src/test-helpers/TestClass";
import { QuadTreeTest } from "./trees/QuadTreeTest";

declare global {
    interface Window {
        test: {
            [test_name: string]: () => void
        }
    }
}

export function register_tests() {
    window.test = {};

    const tests: Array<TestClass> = [
        new QuadTreeTest(),
    ];

    const test_button_list = document.getElementById('test-button-list');
    if (!test_button_list) throw new Error("No test-button-list");

    tests.forEach((test: TestClass) => {
        let run_unit_tests = () => {
            test.run_all_test_cases();
        };
        window.test[test.get_name()] = run_unit_tests;

        const list_item = document.createElement('li');
        const button = document.createElement('button');
        button.addEventListener('click', run_unit_tests);
        button.innerText = test.get_name();
        list_item.append(button);
        test_button_list.append(list_item);
    });

    window.test.test_all = () => {
        console.log('Starting Tests ... ');
        for (const test of tests) {
            test.run_all_test_cases();
        }
        console.log(' ... Tests finished');
    };

    window.onerror = (message, source, lineno, colno, error) => {

        if (error instanceof Error) {
            console.error(error.name + ' : ' + error.message);
        } else {
            console.error(message);
        }
    }
};