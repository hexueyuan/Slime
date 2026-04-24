export interface IGitPresenter {
  tag(name: string, message: string): Promise<boolean>;
  listTags(pattern?: string): Promise<string[]>;
  getCurrentCommit(): Promise<string>;
  rollbackToRef(ref: string): Promise<boolean>;
  addAndCommit(message: string, files?: string[]): Promise<boolean>;
  getChangedFiles(fromRef: string, toRef?: string): Promise<string[]>;
}
