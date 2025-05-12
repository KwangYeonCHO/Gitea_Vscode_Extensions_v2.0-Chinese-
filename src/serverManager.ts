import * as vscode from 'vscode';
import axios from 'axios';

// 服务器配置接口
interface ServerConfig {
    name: string;
    url: string;
    token: string;
    isDefault?: boolean;
}

// 服务器管理类
export class ServerManager {
    private static instance: ServerManager;
    private servers: Map<string, ServerConfig> = new Map();
    private currentServer: string | null = null;
    
    // 添加事件发射器，用于服务器变更通知
    private _onServerChanged: vscode.EventEmitter<string | null> = new vscode.EventEmitter<string | null>();
    public readonly onServerChanged: vscode.Event<string | null> = this._onServerChanged.event;

    private constructor() {
        this.loadServers();
    }

    // 单例模式获取实例
    public static getInstance(): ServerManager {
        if (!ServerManager.instance) {
            ServerManager.instance = new ServerManager();
        }
        return ServerManager.instance;
    }

    // 加载保存的服务器配置
    private async loadServers() {
        const config = vscode.workspace.getConfiguration('gitea');
        const savedServers = config.get<ServerConfig[]>('servers') || [];

        savedServers.forEach(server => {
            this.servers.set(server.name, server);
            if (server.isDefault) {
                this.currentServer = server.name;
            }
        });
    }

    // 保存服务器配置
    private async saveServers() {
        const config = vscode.workspace.getConfiguration('gitea');
        await config.update('servers', Array.from(this.servers.values()), true);
    }

    // 添加新服务器
    public async addServer(server: ServerConfig): Promise<boolean> {
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
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            vscode.window.showErrorMessage(`添加服务器失败: ${errorMessage}`);
            return false;
        }
    }

    // 验证服务器连接
    private async validateServer(server: ServerConfig): Promise<void> {
        try {
            const response = await axios.get(`${server.url}/api/v1/version`, {
                headers: {
                    'Authorization': `token ${server.token}`
                }
            });
            if (response.status !== 200) {
                throw new Error('服务器连接验证失败');
            }
        } catch (error: unknown) {
            // 错误类型处理
            if (axios.isAxiosError(error)) {
                throw new Error(`无法连接到服务器: ${error.message}`);
            }
            throw new Error('服务器连接验证失败');
        }
    }

    // 切换当前服务器
    public async switchServer(serverName: string): Promise<boolean> {
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
    public getCurrentServer(): ServerConfig | null {
        if (!this.currentServer) {
            return null;
        }
        const server = this.servers.get(this.currentServer);
        return server ?? null; // 使用空值合并运算符
    }

    // 获取所有服务器列表
    public getAllServers(): ServerConfig[] {
        return Array.from(this.servers.values());
    }

    // 删除服务器
    public async removeServer(serverName: string): Promise<boolean> {
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