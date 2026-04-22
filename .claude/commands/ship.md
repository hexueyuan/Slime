一键提交并推送代码到远端。

执行以下步骤：
1. 运行 `git status` 查看当前变更
2. 运行 `git diff --staged` 和 `git diff` 查看具体变更内容
3. 将所有变更添加到暂存区（排除 .env 等敏感文件）
4. 根据变更内容生成符合 Conventional Commits 规范的提交信息
5. 提交变更
6. 推送到远端

注意：
- 提交信息格式：`type(scope): subject`
- 提交信息必须是单行，不要使用 HEREDOC 或多行格式
- 如果没有变更则不执行任何操作
- 推送前确认当前分支有远程跟踪分支

$ARGUMENTS
