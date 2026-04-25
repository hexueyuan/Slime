export interface DirEntry {
  name: string;
  path: string;
  type: "file" | "dir";
}

export interface IFilePresenter {
  read(path: string, offset?: number, limit?: number): Promise<string>;
  write(path: string, content: string): Promise<boolean>;
  edit(path: string, oldText: string, newText: string): Promise<boolean>;
  listDir(path?: string): Promise<DirEntry[]>;
}
