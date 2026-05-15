export interface DirEntry {
  name: string;
  path: string;
  type: "file" | "dir";
}

export interface IFilePresenter {
  read(
    path: string,
    offset?: number,
    limit?: number,
    opts?: { extraTrustedPaths?: string[] },
  ): Promise<string>;
  write(path: string, content: string, opts?: { extraTrustedPaths?: string[] }): Promise<boolean>;
  edit(
    path: string,
    oldText: string,
    newText: string,
    opts?: { extraTrustedPaths?: string[] },
  ): Promise<boolean>;
  listDir(path?: string, opts?: { extraTrustedPaths?: string[] }): Promise<DirEntry[]>;
}
