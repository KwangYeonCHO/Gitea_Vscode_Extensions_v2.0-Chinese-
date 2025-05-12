"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ServerManager = void 0;
const vscode = require("vscode");
const axios_1 = require("axios");
// 服务器管理类
class ServerManager {
    constructor() {
        this.servers = new Map();
        this.currentServer = null;
        // 添加事件发射器，用于服务器变更通知
        this._onServerChanged = new vscode.EventEmitter();
        this.onServerChanged = this._onServerChanged.event;
        this.loadServers();
    }
    // 单例模式获取实例
    static getInstance() {
        if (!ServerManager.instance) {
            ServerManager.instance = new ServerManager();
        }
        return ServerManager.instance;
    }
    // 加载保存的服务器配置
    async loadServers() {
        const config = vscode.workspace.getConfiguration('gitea');
        const savedServers = config.get('servers') || [];
        savedServers.forEach(server => {
            this.servers.set(server.name, server);
            if (server.isDefault) {
                this.currentServer = server.name;
            }
        });
    }
    // 保存服务器配置
    async saveServers() {
        const config = vscode.workspace.getConfiguration('gitea');
        await config.update('servers', Array.from(this.servers.values()), true);
    }
    // 添加新服务器
    async addServer(server) {
        try {
            // 验证服务器连接
            await this.validateServer(server);
            this.servers.set(server.name, server);
            if (this.servers.size === 1) {
                this.currentServer = server.name;
                server.isDefault = true;
            }
            await this.saveServers();
            // 如果是默认服务器或只有一个服务器，则发出服务器变更通知
            if (server.isDefault) {
                this._onServerChanged.fire(server.name);
            }
            return true;
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            vscode.window.showErrorMessage(`添加服务器失败: ${errorMessage}`);
            return false;
        }
    }
    // 验证服务器连接
    async validateServer(server) {
        try {
            const response = await axios_1.default.get(`${server.url}/api/v1/version`, {
                headers: {
                    'Authorization': `token ${server.token}`
                }
            });
            if (response.status !== 200) {
                throw new Error('服务器连接验证失败');
            }
        }
        catch (error) {
            // 错误类型处理
            if (axios_1.default.isAxiosError(error)) {
                throw new Error(`无法连接到服务器: ${error.message}`);
            }
            throw new Error('服务器连接验证失败');
        }
    }
    // 切换当前服务器
    async switchServer(serverName) {
        if (!this.servers.has(serverName)) {
            vscode.window.showErrorMessage(`服务器 ${serverName} 不存在`);
            return false;
        }
        this.currentServer = serverName;
        // 更新默认服务器标记
        for (const [name, server] of this.servers.entries()) {
            server.isDefault = name === serverName;
        }
        await this.saveServers();
        // 发出服务器变更通知
        this._onServerChanged.fire(serverName);
        return true;
    }
    // 获取当前服务器配置
    getCurrentServer() {
        if (!this.currentServer) {
            return null;
        }
        const server = this.servers.get(this.currentServer);
        return server ?? null; // 使用空值合并运算符
    }
    // 获取所有服务器列表
    getAllServers() {
        return Array.from(this.servers.values());
    }
    // 删除服务器
    async removeServer(serverName) {
        if (!this.servers.has(serverName)) {
            return false;
        }
        this.servers.delete(serverName);
        if (this.currentServer === serverName) {
            const firstKey = [...this.servers.keys()][0];
            this.currentServer = this.servers.size > 0 ? firstKey : null;
        }
        await this.saveServers();
        // 发出服务器变更通知
        this._onServerChanged.fire(this.currentServer);
        return true;
    }
}
exports.ServerManager = ServerManager;
//# sourceMappingURL=serverManager.js.map