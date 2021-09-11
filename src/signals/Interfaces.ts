/**
 * The rough interface for a class adhering the observable pattern
 */
export interface Observable<
    LISTENER,
    LISTENER_HANDLE,
    EVENT
    > {
    attach(listener: LISTENER): void;
    dispatch(event: EVENT): void;
    detach(listener: LISTENER_HANDLE): void;
    detach_all(): void;
}