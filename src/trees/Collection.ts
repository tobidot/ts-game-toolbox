export interface CollectionTree<TYPE> {
    [name: string]: TYPE | CollectionTree<TYPE>;
}