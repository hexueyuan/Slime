export interface IFilePresenter {
  read(path: string): Promise<string>;
  write(path: string, content: string): Promise<boolean>;
}
