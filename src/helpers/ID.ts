/**
 * Marks the object as having an ID.
 */
export interface WithID {
    id: ID;
}

/**
 * A unique identifier.
 */
export class ID {
    public static NEXT_ID = 1;

    public id: number;

    public constructor() {
        this.id = ID.NEXT_ID++;
    }

    public toString() {
        return "#" + this.id.toString();
    }
}
