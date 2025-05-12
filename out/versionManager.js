"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VersionManager = exports.UpdateType = void 0;
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
// 更新类型枚举
var UpdateType;
(function (UpdateType) {
    UpdateType["MAJOR"] = "major";
    UpdateType["MINOR"] = "minor";
    UpdateType["PATCH"] = "patch";
})(UpdateType = exports.UpdateType || (exports.UpdateType = {}));
// 版本管理类
class VersionManager {
    constructor() {
        // 获取插件根目录
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) {
            throw new Error('未找到工作区');
        }
        this.packageJsonPath = path.join(workspaceFolders[0].uri.fsPath, 'package.json');
    }
    // 单例模式获取实例
    static getInstance() {
        if (!VersionManager.instance) {
            VersionManager.instance = new VersionManager();
        }
        return VersionManager.instance;
    }
    // 获取当前版本号
    getCurrentVersion() {
        try {
            const packageJson = this.readPackageJson();
            return packageJson.version || '0.0.0';
        }
        catch (error) {
            console.error('获取当前版本号失败:', error);
            return '0.0.0';
        }
    }
    // 解析版本号为对象
    parseVersion(version) {
        const parts = version.split('.');
        return {
            major: parseInt(parts[0] || '0', 10),
            minor: parseInt(parts[1] || '0', 10),
            patch: parseInt(parts[2] || '0', 10)
        };
    }
    // 版本号对象转字符串
    stringifyVersion(version) {
        return `${version.major}.${version.minor}.${version.patch}`;
    }
    // 递增版本号
    incrementVersion(type = UpdateType.PATCH) {
        try {
            const packageJson = this.readPackageJson();
            const currentVersion = this.parseVersion(packageJson.version || '0.0.0');
            let newVersion;
            switch (type) {
                case UpdateType.MAJOR:
                    newVersion = {
                        major: currentVersion.major + 1,
                        minor: 0,
                        patch: 0
                    };
                    break;
                case UpdateType.MINOR:
                    newVersion = {
                        major: currentVersion.major,
                        minor: currentVersion.minor + 1,
                        patch: 0
                    };
                    break;
                case UpdateType.PATCH:
                default:
                    newVersion = {
                        major: currentVersion.major,
                        minor: currentVersion.minor,
                        patch: currentVersion.patch + 1
                    };
                    break;
            }
            const newVersionString = this.stringifyVersion(newVersion);
            packageJson.version = newVersionString;
            // 更新 package.json
            this.writePackageJson(packageJson);
            return newVersionString;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            vscode.window.showErrorMessage(`递增版本号失败: ${errorMessage}`);
            return this.getCurrentVersion();
        }
    }
    // 读取 package.json
    readPackageJson() {
        try {
            const content = fs.readFileSync(this.packageJsonPath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            console.error('读取 package.json 失败:', error);
            throw error;
        }
    }
    // 写入 package.json
    writePackageJson(packageJson) {
        try {
            const content = JSON.stringify(packageJson, null, 2);
            fs.writeFileSync(this.packageJsonPath, content, 'utf-8');
        }
        catch (error) {
            console.error('写入 package.json 失败:', error);
            throw error;
        }
    }
    // 创建更新日志（在版本更新时可用）
    async createChangelogEntry(version, message) {
        try {
            const changelogPath = path.join(path.dirname(this.packageJsonPath), 'CHANGELOG.md');
            // 检查更新日志文件是否存在
            let existingContent = '';
            try {
                existingContent = fs.readFileSync(changelogPath, 'utf-8');
            }
            catch (error) {
                // 如果文件不存在，创建新文件
                existingContent = '# 更新日志\n\n';
            }
            // 获取当前日期
            const date = new Date().toISOString().split('T')[0];
            // 如果没有提供消息，则提示用户输入
            let changelog = message;
            if (!changelog) {
                changelog = await vscode.window.showInputBox({
                    prompt: '请输入此版本的更新内容',
                    placeHolder: '例如: 修复了xxx问题，新增了xxx功能'
                }) || '常规更新';
            }
            // 创建新的更新日志条目
            const newEntry = `\n## ${version} (${date})\n\n${changelog}\n`;
            // 在文件开头插入新条目（在标题之后）
            const updatedContent = existingContent.replace(/# 更新日志\n\n/, `# 更新日志\n${newEntry}\n`);
            // 写入文件
            fs.writeFileSync(changelogPath, updatedContent, 'utf-8');
            vscode.window.showInformationMessage(`更新日志已更新到版本 ${version}`);
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            vscode.window.showErrorMessage(`创建更新日志失败: ${errorMessage}`);
        }
    }
}
exports.VersionManager = VersionManager;
//# sourceMappingURL=versionManager.js.map