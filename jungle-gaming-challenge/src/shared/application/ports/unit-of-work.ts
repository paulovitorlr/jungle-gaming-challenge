export const UNIT_OF_WORK = Symbol('UnitOfWork');

export interface UnitOfWork {
  execute<T>(
    work: () => Promise<T>,
  ): Promise<T>;
}