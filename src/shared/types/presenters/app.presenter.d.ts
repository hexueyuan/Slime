export interface IAppPresenter {
  getVersion(): string;
  resetAllData(): Promise<{ success: boolean; error?: string }>;
  selectLocalZip(): Promise<string | null>;
  applyLocalZip(zipPath: string): Promise<{ success: boolean; error?: string }>;
}
