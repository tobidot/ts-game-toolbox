export function is_undefined(x: unknown | undefined): x is undefined {
    return typeof x === "undefined";
}

export function is_object(x: unknown | object): x is object {
    return typeof x === "object";
}

export function is_function(x: unknown): x is (...args: any[]) => any {
    return typeof x === "function";
}

export function is_string(x: unknown | string): x is string {
    return typeof x === "string";
}

export function is_number(x: unknown | number): x is number {
    return typeof x === "number";
}
