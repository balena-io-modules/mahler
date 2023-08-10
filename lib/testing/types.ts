/**
 * Our very simple representation of a DAG
 * for testing
 */
type DAG<T> = Array<T | DAG<T>>;

/**
 * A "simplified" plan.
 *
 * It is an object representation
 * of a plan that's easier to print and compare.
 */
export type SimplePlan = DAG<string>;
