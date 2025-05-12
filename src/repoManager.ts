import * as vscode from 'vscode';
import axios from 'axios';
import { ServerManager } from './serverManager';

// 仓库配置接口
interface RepoConfig {
    name: string;
    description?: string;
    private: boolean;
    server: string;
}

// 仓库管理类
export class RepoManager {
    private static instance: RepoManager;
    private serverManager: ServerManager;

    private constructor() {
        this.serverManager = ServerManager.getInstance();
    }

    // 单例模式获取实例
    public static getInstance(): RepoManager {
        if (!RepoManager.instance) {
            RepoManager.instance = new RepoManager();
        }
        return RepoManager.instance;
    }

    // 创建新仓库
    public async createRepository(config: RepoConfig): Promise<boolean> {
        try {
            const server = this.serverManager.getCurrentServer();
            if (!server) {
                throw new Error('未选择服务器');
            }

            const response = await axios.post(
                `${server.url}/api/v1/user/repos`,
                {
                    name: config.name,
                    description: config.description || '',
                    private: config.private
                },
                {
                    headers: {
                        'Authorization': `token ${server.token}`
                    }
                }
            );

            if (response.status === 201) {
                vscode.window.showInformationMessage(`仓库 ${config.name} 创建成功`);
                return true;
            }
            return false;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            vscode.window.showErrorMessage(`创建仓库失败: ${errorMessage}`);
            return false;
        }
    }

    // 克隆仓库
    public async cloneRepository(repoUrl: string, targetPath: string): Promise<boolean> {
        try {
            const server = this.serverManager.getCurrentServer();
            if (!server) {
                throw new Error('未选择服务器');
            }

            // 使用VS Code的进度API显示克隆进度
            return await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: `正在克隆仓库...`,
                cancellable: true
            }, async (progress, token) => {
                // 初始化进度
                progress.report({ increment: 0, message: '准备克隆...' });

                // 设置取消操作
                token.onCancellationRequested(() => {
                    vscode.window.showWarningMessage('克隆操作已取消');
                    throw new Error('用户取消了克隆操作');
                });

                // 格式化URL，添加身份验证信息
                let cloneUrl = repoUrl;
                if (cloneUrl.startsWith('http')) {
                    // 如果是HTTP(S)的URL，添加token认证
                    cloneUrl = cloneUrl.replace(/^(https?:\/\/)/, `$1${server.token}:x-oauth-basic@`);
                }
                
                // 使用子进程执行git clone命令
                const { exec } = require('child_process');
                
                return new Promise<boolean>((resolve, reject) => {
                    const repoName = targetPath.split(/[\\\/]/).pop() || '仓库';
                    
                    // 创建子进程
                    const process = exec(`git clone "${cloneUrl}" "${targetPath}"`, 
                        { maxBuffer: 10 * 1024 * 1024 } // 增加缓冲区大小
                    );
                    
                    // 用于模拟进度
                    let progressValue = 0;
                    const progressInterval = setInterval(() => {
                        if (progressValue < 90) {
                            const increment = Math.floor(Math.random() * 5) + 1; // 1-5的随机增量
                            progressValue += increment;
                            progress.report({ 
                                increment, 
                                message: `克隆 ${repoName} 进度: ${progressValue}%` 
                            });
                        }
                    }, 800);
                    
                    // 处理标准输出和错误
                    process.stdout?.on('data', (data: string) => {
                        const message = data.toString().trim();
                        if (message) {
                            const match = message.match(/(\d+)%/); // 尝试从输出中提取百分比
                            if (match && match[1]) {
                                const percent = parseInt(match[1], 10);
                                if (!isNaN(percent) && percent > progressValue) {
                                    const increment = percent - progressValue;
                                    progressValue = percent;
                                    progress.report({ 
                                        increment, 
                                        message: `克隆 ${repoName} 进度: ${percent}%` 
                                    });
                                }
                            }
                        }
                    });
                    
                    process.stderr?.on('data', (data: string) => {
                        const message = data.toString().trim();
                        if (message && message.includes('Receiving objects')) {
                            const match = message.match(/Receiving objects:\s+(\d+)%/);
                            if (match && match[1]) {
                                const percent = parseInt(match[1], 10);
                                if (!isNaN(percent) && percent > progressValue) {
                                    const increment = percent - progressValue;
                                    progressValue = percent;
                                    progress.report({ 
                                        increment, 
                                        message: `接收对象: ${percent}%` 
                                    });
                                }
                            }
                        } else if (message && message.includes('Resolving deltas')) {
                            const match = message.match(/Resolving deltas:\s+(\d+)%/);
                            if (match && match[1]) {
                                const percent = parseInt(match[1], 10);
                                progress.report({ 
                                    message: `解析差异: ${percent}%` 
                                });
                            }
                        }
                    });
                    
                    // 完成回调
                    process.on('close', (code: number) => {
                        clearInterval(progressInterval);
                        
                        if (code === 0) {
                            progress.report({ increment: 100 - progressValue, message: '完成' });
                            
                            // 克隆成功后，询问用户是否打开项目
                            const openOptions = [
                                { label: '在新窗口打开', action: 'new' },
                                { label: '在当前窗口打开', action: 'current' },
                                { label: '不打开', action: 'none' }
                            ];
                            
                            vscode.window.showInformationMessage(
                                `仓库 ${repoName} 克隆成功!`, 
                                ...openOptions.map(opt => opt.label)
                            ).then(chosenOption => {
                                if (chosenOption) {
                                    const action = openOptions.find(opt => opt.label === chosenOption)?.action;
                                    if (action === 'new') {
                                        // 在新窗口打开
                                        vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetPath), true);
                                    } else if (action === 'current') {
                                        // 在当前窗口打开
                                        vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(targetPath), false);
                                    }
                                    // 如果选择"不打开"则不执行任何操作
                                }
                            });
                            
                            resolve(true);
                        } else {
                            vscode.window.showErrorMessage(`克隆仓库失败，退出代码: ${code}`);
                            reject(new Error(`克隆失败，退出代码: ${code}`));
                        }
                    });
                    
                    // 错误处理
                    process.on('error', (error: Error) => {
                        clearInterval(progressInterval);
                        vscode.window.showErrorMessage(`克隆仓库失败: ${error.message}`);
                        reject(error);
                    });
                });
            });
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            vscode.window.showErrorMessage(`克隆仓库失败: ${errorMessage}`);
            return false;
        }
    }

    // 获取仓库列表
    public async listRepositories(): Promise<any[]> {
        try {
            const server = this.serverManager.getCurrentServer();
            if (!server) {
                throw new Error('未选择服务器');
            }

            const response = await axios.get(
                `${server.url}/api/v1/user/repos`,
                {
                    headers: {
                        'Authorization': `token ${server.token}`
                    }
                }
            );

            return response.data;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            vscode.window.showErrorMessage(`获取仓库列表失败: ${errorMessage}`);
            return [];
        }
    }

    // 删除仓库
    public async deleteRepository(owner: string, repo: string): Promise<boolean> {
        try {
            const server = this.serverManager.getCurrentServer();
            if (!server) {
                throw new Error('未选择服务器');
            }

            const response = await axios.delete(
                `${server.url}/api/v1/repos/${owner}/${repo}`,
                {
                    headers: {
                        'Authorization': `token ${server.token}`
                    }
                }
            );

            if (response.status === 204) {
                vscode.window.showInformationMessage(`仓库 ${repo} 删除成功`);
                return true;
            }
            return false;
        } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : '未知错误';
            vscode.window.showErrorMessage(`删除仓库失败: ${errorMessage}`);
            return false;
        }
    }
} 