export class TreeElementNotFoundException extends Error {
    constructor(message?: string) {
        super(message);
        this.name = TreeElementNotFoundException.name;
        Object.setPrototypeOf(this, TreeElementNotFoundException.prototype);
    }
}