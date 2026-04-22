export interface IGitPresenter {
  tag(name: string, message: string): Promise<boolean>;
}
