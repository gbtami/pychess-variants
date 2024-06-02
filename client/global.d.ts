export {}

// temporary workaround for typescript bug: https://github.com/microsoft/TypeScript/issues/48829
declare global {
  interface Array<T> {
    findLastIndex(
      predicate: (value: T, index: number, obj: T[]) => unknown,
      thisArg?: any
    ): number
  }
}