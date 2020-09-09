import { TestClass } from ".";
import { TestConsoleLogElement } from "./TestConsoleLogElement";

interface TestDashboardElements {
    dashboard: HTMLElement,
    button_list: HTMLElement,
    console_log: TestConsoleLogElement;
}

export class TestDashboard {
    private tests: Array<TestClass> = [];
    private elements: TestDashboardElements;

    constructor() {
        this.elements = this.create_dashboard_elements();
    }

    public get_element(): HTMLElement {
        return this.elements.dashboard;
    }

    protected create_dashboard_elements(): TestDashboardElements {

        const dashboard = document.createElement('div');
        dashboard.className = 'test-dashboard';

        const button_list = document.createElement('ul');
        button_list.className = "test-dashboard__button-list";

        const button_start_all = this.create_element_button('Run all tests', this.start_all_tests_func);
        button_list.append(button_start_all);
        this.tests.forEach((test: TestClass) => {
            const button = this.create_element_for_test_button(test);
            button_list.append(button);
        });

        const console_log = new TestConsoleLogElement();

        dashboard.append(button_list);
        dashboard.append(console_log.get_element());

        this.elements = {
            dashboard,
            button_list,
            console_log,
        };

        return this.elements;
    }

    protected create_element_for_test_button(test: TestClass): HTMLElement {
        return this.create_element_button(test.get_name(), () => {
            test.run_all_test_cases();
        });
    }

    protected create_element_button(text: string, on_click: () => void): HTMLElement {
        let list_item = document.createElement('li');
        let button = document.createElement('button');
        button.innerText = text;
        button.addEventListener('click', on_click);
        list_item.append(button);
        return list_item;
    }

    public add_test(test: TestClass): this {
        this.tests.push(test);
        if (this.elements) {
            this.elements.button_list.append(this.create_element_for_test_button(test));
        }
        return this;
    }

    public start_all_tests_func = () => {
        console.log('Starting Tests ... ');
        for (const test of this.tests) {
            test.run_all_test_cases();
        }
        console.log(' ... Tests finished');
    }
}