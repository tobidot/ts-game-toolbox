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
    public static next_id = 1;

    public id: number;

    public constructor() {
        this.id = ID.next_id++;
    }

    public toString() {
        return '#' + this.id.toString();
    }
}