"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GitOperations = void 0;
const vscode = require("vscode");
const simple_git_1 = require("simple-git");
/**
 * Git操作类
 * 封装所有Git相关操作
 */
class GitOperations {
    constructor() {
        this.isGitRepo = false;
        // 初始化时不创建git实例，将在需要时创建
        this.git = null;
    }
    /**
     * 初始化Git实例
     * 使用当前打开的工作区作为工作目录
     * @returns 是否成功初始化
     */
    async initialize() {
        try {
            // 检查是否有打开的工作区
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('请先打开一个项目文件夹！');
                return false;
            }
            // 使用第一个工作区文件夹作为Git仓库路径
            const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;
            // 使用指定的工作目录初始化Git实例
            this.git = (0, simple_git_1.default)(workspaceFolder);
            // 验证当前目录是否是Git仓库
            const isRepo = await this.git.checkIsRepo();
            if (!isRepo) {
                vscode.window.showErrorMessage(`当前文件夹 "${workspaceFolder}" 不是一个有效的Git仓库！`);
                return false;
            }
            this.isGitRepo = true;
            return true;
        }
        catch (error) {
            console.error('Git初始化失败:', error);
            vscode.window.showErrorMessage(`Git初始化失败: ${error instanceof Error ? error.message : '未知错误'}`);
            return false;
        }
    }
    /**
     * 克隆远程仓库
     * @param url 仓库URL
     * @param path 目标路径
     * @returns 承诺对象
     */
    async clone(url, path) {
        try {
            // 使用VSCode的进度API显示克隆进度
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `正在克隆仓库...`,
                cancellable: true
            }, async (progress, token) => {
                // 初始化进度
                progress.report({ increment: 0, message: '准备克隆...' });
                // 克隆操作使用临时的Git实例
                const tempGit = (0, simple_git_1.default)();
                // 模拟进度更新
                let progressValue = 0;
                const progressInterval = setInterval(() => {
                    if (progressValue < 90) {
                        const increment = Math.floor(Math.random() * 5) + 1; // 1-5的随机增量
                        progressValue += increment;
                        progress.report({
                            increment,
                            message: `克隆进度: ${progressValue}%`
                        });
                    }
                }, 800);
                // 设置取消处理
                token.onCancellationRequested(() => {
                    clearInterval(progressInterval);
                    vscode.window.showWarningMessage('克隆操作已取消');
                    throw new Error('用户取消了克隆操作');
                });
                try {
                    // 执行克隆
                    await tempGit.clone(url, path);
                    clearInterval(progressInterval);
                    progress.report({ increment: 100 - progressValue, message: '完成' });
                    // 克隆成功后，询问用户是否打开项目
                    const repoName = path.split(/[\\\/]/).pop() || '项目';
                    const openOptions = [
                        { label: '在新窗口打开', action: 'new' },
                        { label: '在当前窗口打开', action: 'current' },
                        { label: '不打开', action: 'none' }
                    ];
                    const chosenOption = await vscode.window.showInformationMessage(`仓库 ${repoName} 克隆成功!`, ...openOptions.map(opt => opt.label));
                    if (chosenOption) {
                        const action = openOptions.find(opt => opt.label === chosenOption)?.action;
                        if (action === 'new') {
                            // 在新窗口打开
                            vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(path), true);
                        }
                        else if (action === 'current') {
                            // 在当前窗口打开
                            vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(path), false);
                        }
                        // 如果选择"不打开"则不执行任何操作
                    }
                }
                catch (error) {
                    clearInterval(progressInterval);
                    throw error;
                }
            });
        }
        catch (error) {
            console.error('克隆仓库失败:', error);
            throw new Error(`克隆仓库失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }
}
exports.GitOperations = GitOperations;
//# sourceMappingURL=GitOperations.js.map