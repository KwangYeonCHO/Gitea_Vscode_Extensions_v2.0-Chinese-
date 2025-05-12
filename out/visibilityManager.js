"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisibilityManager = void 0;
const vscode = require("vscode");
const axios_1 = require("axios");
const serverManager_1 = require("./serverManager");
// 可见性管理类
class VisibilityManager {
    constructor() {
        this.serverManager = serverManager_1.ServerManager.getInstance();
    }
    // 单例模式获取实例
    static getInstance() {
        if (!VisibilityManager.instance) {
            VisibilityManager.instance = new VisibilityManager();
        }
        return VisibilityManager.instance;
    }
    // 获取默认可见性设置
    getDefaultVisibility() {
        const config = vscode.workspace.getConfiguration('gitea');
        return config.get('defaultVisibility') || 'private';
    }
    // 设置仓库可见性
    async setRepositoryVisibility(owner, repo, visibility) {
        try {
            const server = this.serverManager.getCurrentServer();
            if (!server) {
                throw new Error('未选择服务器');
            }
            const response = await axios_1.default.patch(`${server.url}/api/v1/repos/${owner}/${repo}`, {
                private: visibility === 'private'
            }, {
                headers: {
                    'Authorization': `token ${server.token}`
                }
            });
            if (response.status === 200) {
                vscode.window.showInformationMessage(`仓库 ${repo} 可见性已更新为 ${visibility === 'private' ? '私有' : '公开'}`);
                return true;
            }
            return false;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            vscode.window.showErrorMessage(`更新仓库可见性失败: ${errorMessage}`);
            return false;
        }
    }
    // 获取仓库当前可见性
    async getRepositoryVisibility(owner, repo) {
        try {
            const server = this.serverManager.getCurrentServer();
            if (!server) {
                throw new Error('未选择服务器');
            }
            const response = await axios_1.default.get(`${server.url}/api/v1/repos/${owner}/${repo}`, {
                headers: {
                    'Authorization': `token ${server.token}`
                }
            });
            if (response.status === 200) {
                return response.data.private ? 'private' : 'public';
            }
            return null;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            vscode.window.showErrorMessage(`获取仓库可见性失败: ${errorMessage}`);
            return null;
        }
    }
    // 显示可见性选择对话框
    async showVisibilityPicker() {
        const items = [
            {
                label: '私有仓库',
                description: '只有您和协作者可以访问',
                value: 'private'
            },
            {
                label: '公开仓库',
                description: '所有人都可以访问',
                value: 'public'
            }
        ];
        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择仓库可见性'
        });
        return selected?.value;
    }
}
exports.VisibilityManager = VisibilityManager;
//# sourceMappingURL=visibilityManager.js.map