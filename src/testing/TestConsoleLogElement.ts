export class TestConsoleLogElement {
    private container: HTMLElement;

    constructor() {
        this.container = this.create_element();
        this.hook_into_console_log();
        this.hook_into_console_error();
    }

    public get_element(): HTMLElement {
        return this.container;
    }

    protected hook_into_console_log() {
        const console_log = window.console.log;
        console.log = (...args: any[]) => {
            console_log(...args);
            this.log(...args);
        };
    }

    protected hook_into_console_error() {
        const console_error = window.console.error;
        console.error = (...args: any[]) => {
            const text = args[0].toString();
            console_error(text);
            this.log("%c" + text, "color: red;", ...args);
        };
    }

    protected hook_into_window_error() {
        window.addEventListener('error', this.window_on_error_func);
    }

    protected window_on_error_func: OnErrorEventHandlerNonNull = (
        event: Event | string,
        source?: string,
        lineno?: number,
        colno?: number,
        error?: Error
    ): any => {
        if (error instanceof Error) {
            console.error(error.name + ' : ' + error.message);
        } else {
            console.error(event);
        }
        // const source_file = source?.replace(window.location.origin, '');
        // const error_position = "[" + [lineno, colno].join(':') + "]";
        // console.error([...new Array(4)].map(() => '=').join('') + source_file + error_position);
    }


    protected create_element(): HTMLElement {
        const container = document.createElement('div');
        container.className = "test-console-log";
        return container;
    }

    public log(...args: any[]) {
        const format_or_log = args.shift();
        if (typeof format_or_log === "string") {
            return this.print_format(format_or_log, ...args)
                .then((...rest_args: any[]) => {
                    this.log(...args);
                });
        } else {
            args.forEach((arg: any) => {
                this.print((arg).toString());
            });
        }
    }

    public async print_format(format: string, ...args: any[]) {
        return new Promise((resolve, reject) => {
            let style = '';
            let text = format;
            if (format.indexOf('%c') === 0) {
                style = args[0];
                text = text.substr(2);
            }
            while (text.indexOf('%s') !== -1) {
                const next = args.shift();
                if (next === null) throw Error('argument mismatch');
                text = text.replace('%s', next.toString());
            }
            this.print(text, style)
        });
    }

    public print(text: string, style?: string) {
        const span = document.createElement('span');
        if (style) span.style.cssText = style;
        span.innerText = text;
        this.container.append(span);
    }
}