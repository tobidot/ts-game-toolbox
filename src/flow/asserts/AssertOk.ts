export function assert_ok(variable: any, message: string = 'Assertion Failed!'): asserts variable {
    if (!variable) {
        throw new Error(message);
    }
}