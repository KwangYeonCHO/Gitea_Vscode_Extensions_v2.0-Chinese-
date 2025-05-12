"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PackageManager = void 0;
const vscode = require("vscode");
const cp = require("child_process");
const versionManager_1 = require("./versionManager");
// 打包管理类
class PackageManager {
    constructor() {
        this.versionManager = versionManager_1.VersionManager.getInstance();
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('未找到工作区');
        }
        this.extensionRootPath = workspaceFolders[0].uri.fsPath;
        this.outputChannel = vscode.window.createOutputChannel('Gitea Connector 打包');
    }
    // 单例模式获取实例
    static getInstance() {
        if (!PackageManager.instance) {
            PackageManager.instance = new PackageManager();
        }
        return PackageManager.instance;
    }
    // 执行命令行指令
    async executeCommand(command, cwd = this.extensionRootPath) {
        return new Promise((resolve, reject) => {
            this.outputChannel.appendLine(`执行命令: ${command}`);
            const process = cp.exec(command, { cwd }, (error, stdout, stderr) => {
                if (error) {
                    this.outputChannel.appendLine(`错误: ${error.message}`);
                    this.outputChannel.appendLine(stderr);
                    reject(new Error(stderr || error.message));
                    return;
                }
                resolve(stdout);
            });
            // 实时输出命令执行日志
            if (process.stdout) {
                process.stdout.on('data', (data) => {
                    this.outputChannel.append(data.toString());
                });
            }
            if (process.stderr) {
                process.stderr.on('data', (data) => {
                    this.outputChannel.append(data.toString());
                });
            }
        });
    }
    // 编译扩展
    async compileExtension() {
        try {
            this.outputChannel.clear();
            this.outputChannel.show();
            this.outputChannel.appendLine('开始编译扩展...');
            // 执行 npm run compile 命令
            await this.executeCommand('npm run compile');
            this.outputChannel.appendLine('编译完成！');
            return true;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            this.outputChannel.appendLine(`编译失败: ${errorMessage}`);
            vscode.window.showErrorMessage(`编译扩展失败: ${errorMessage}`);
            return false;
        }
    }
    // 打包扩展
    async packageExtension() {
        try {
            this.outputChannel.show();
            this.outputChannel.appendLine('开始打包扩展...');
            // 先编译
            const compileResult = await this.compileExtension();
            if (!compileResult) {
                throw new Error('编译失败，无法继续打包');
            }
            // 打包 VSIX
            const currentVersion = this.versionManager.getCurrentVersion();
            this.outputChannel.appendLine(`当前版本: ${currentVersion}`);
            this.outputChannel.appendLine('打包 VSIX...');
            // 使用 vsce 打包
            await this.executeCommand('npx vsce package');
            this.outputChannel.appendLine(`打包完成！版本: ${currentVersion}`);
            vscode.window.showInformationMessage(`扩展打包成功！版本: ${currentVersion}`);
            return true;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            this.outputChannel.appendLine(`打包失败: ${errorMessage}`);
            vscode.window.showErrorMessage(`打包扩展失败: ${errorMessage}`);
            return false;
        }
    }
    // 版本递增并打包
    async incrementAndPackage(updateType = versionManager_1.UpdateType.PATCH) {
        try {
            // 递增版本号
            const oldVersion = this.versionManager.getCurrentVersion();
            const newVersion = this.versionManager.incrementVersion(updateType);
            this.outputChannel.clear();
            this.outputChannel.show();
            this.outputChannel.appendLine(`版本已更新: ${oldVersion} → ${newVersion}`);
            // 创建更新日志
            await this.versionManager.createChangelogEntry(newVersion);
            // 执行打包
            return await this.packageExtension();
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            vscode.window.showErrorMessage(`版本递增并打包失败: ${errorMessage}`);
            return false;
        }
    }
}
exports.PackageManager = PackageManager;
//# sourceMappingURL=packageManager.js.map