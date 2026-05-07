export interface IConfigPresenter {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<boolean>;
  readAll(): Promise<Record<string, unknown>>;
}
