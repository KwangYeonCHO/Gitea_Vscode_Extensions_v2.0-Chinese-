import * as vscode from 'vscode';
import axios from 'axios';
import { ServerManager } from './serverManager';

// 仓库可见性类型
export type VisibilityType = 'private' | 'public';

// 可见性管理类
export class VisibilityManager {
    private static instance: VisibilityManager;
    private serverManager: ServerManager;

    private constructor() {
        this.serverManager = ServerManager.getInstance();
    }

    // 单例模式获取实例
    public static getInstance(): VisibilityManager {
        if (!VisibilityManager.instance) {
            VisibilityManager.instance = new VisibilityManager();
        }
        return VisibilityManager.instance;
    }

    // 获取默认可见性设置
    public getDefaultVisibility(): VisibilityType {
        const config = vscode.workspace.getConfiguration('gitea');
        return config.get<VisibilityType>('defaultVisibility') || 'private';
    }

    // 设置仓库可见性
    public async setRepositoryVisibility(
        owner: string,
        repo: string,
        visibility: VisibilityType
    ): Promise<boolean> {
        try {
            const server = this.serverManager.getCurrentServer();
            if (!server) {
                throw new Error('未选择服务器');
            }

            const response = await axios.patch(
                `${server.url}/api/v1/repos/${owner}/${repo}`,
                {
                    private: visibility === 'private'
                },
                {
                    headers: {
                        'Authorization': `token ${server.token}`
                    }
                }
            );

            if (response.status === 200) {
                vscode.window.showInformationMessage(
                    `仓库 ${repo} 可见性已更新为 ${visibility === 'private' ? '私有' : '公开'}`
                );
                return true;
            }
            return false;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            vscode.window.showErrorMessage(`更新仓库可见性失败: ${errorMessage}`);
            return false;
        }
    }

    // 获取仓库当前可见性
    public async getRepositoryVisibility(owner: string, repo: string): Promise<VisibilityType | null> {
        try {
            const server = this.serverManager.getCurrentServer();
            if (!server) {
                throw new Error('未选择服务器');
            }

            const response = await axios.get(
                `${server.url}/api/v1/repos/${owner}/${repo}`,
                {
                    headers: {
                        'Authorization': `token ${server.token}`
                    }
                }
            );

            if (response.status === 200) {
                return response.data.private ? 'private' : 'public';
            }
            return null;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            vscode.window.showErrorMessage(`获取仓库可见性失败: ${errorMessage}`);
            return null;
        }
    }

    // 显示可见性选择对话框
    public async showVisibilityPicker(): Promise<VisibilityType | undefined> {
        const items = [
            {
                label: '私有仓库',
                description: '只有您和协作者可以访问',
                value: 'private' as VisibilityType
            },
            {
                label: '公开仓库',
                description: '所有人都可以访问',
                value: 'public' as VisibilityType
            }
        ];

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择仓库可见性'
        });

        return selected?.value;
    }
} 