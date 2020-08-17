export type Intersect<A, B> = Pick<A, Extract<keyof A, keyof B>>;
