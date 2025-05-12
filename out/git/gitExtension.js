"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitExtension = void 0;
const vscode = require("vscode");
const simple_git_1 = require("simple-git");
/**
 * Git操作扩展类
 */
class GitExtension {
    constructor() {
        // 获取当前工作区路径
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('没有打开的工作区');
        }
        const workspacePath = workspaceFolders[0].uri.fsPath;
        this.git = (0, simple_git_1.default)(workspacePath);
    }
    /**
     * 获取Git提交历史
     * @returns 提交历史记录
     */
    async getLog() {
        try {
            const logResult = await this.git.log();
            return logResult.all.map(commit => ({
                hash: commit.hash,
                author: commit.author_name,
                date: new Date(commit.date).toLocaleString(),
                message: commit.message
            }));
        }
        catch (error) {
            throw new Error(`获取Git日志失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * 重置Git更改
     * @param resetType 重置类型 (--soft, --mixed, --hard)
     */
    async reset(resetType) {
        try {
            await this.git.reset([resetType]);
        }
        catch (error) {
            throw new Error(`Git重置失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
    /**
     * 重置到指定commit
     * @param commitHash 目标commit哈希
     * @param resetType 重置类型（--soft, --mixed, --hard）
     * @version 0.1.27
     */
    async resetToCommit(commitHash, resetType) {
        try {
            // 组装reset命令参数
            await this.git.reset([resetType, commitHash]);
        }
        catch (error) {
            throw new Error(`Git重置到指定commit失败: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
exports.GitExtension = GitExtension;
//# sourceMappingURL=gitExtension.js.map