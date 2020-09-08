export function stream_console_log_to_container(container_id: string) {
    const element = document.getElementById(container_id);
    if (!element) throw new Error('No log-container found ' + container_id);
    const container_element = element;

    const console_log = window.console.log;
    console.log = (...args: any[]) => {
        console_log(...args);
        container_log(...args);
    };
    const console_error = window.console.error;
    console.error = (...args: any[]) => {
        const text = args[0].toString();
        console_error(text);
        container_log("%c" + text, "color: red;", ...args);
    };

    function container_log(...args: any[]) {
        const format_or_log = args.shift();
        if (typeof format_or_log === "string") {
            return container_print_format(format_or_log, ...args)
                .then((...rest_args: any[]) => {
                    container_log(...args);
                });
        } else {
            args.forEach((arg: any) => {
                container_print((arg).toString());
            });
        }
    }

    async function container_print_format(format: string, ...args: any[]) {
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
            container_print(text, style)
        });
    }

    function container_print(text: string, style?: string) {
        const span = document.createElement('span');
        if (style) span.style.cssText = style;
        span.innerText = text;
        container_element.append(span);
    }

}