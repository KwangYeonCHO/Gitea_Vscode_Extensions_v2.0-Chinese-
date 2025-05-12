import * as vscode from 'vscode';
import axios from 'axios';
import simpleGit from 'simple-git';
import { exec } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { GiteaAPI } from './giteaApi';
import { showGitLog, resetGitChanges } from './commands/gitCommands';
import { ServerManager } from './serverManager';
import { RepoManager } from './repoManager';
import { VisibilityManager, VisibilityType } from './visibilityManager';

// Git 操作类
class GitOperations {
    private git: any;
    private isGitRepo: boolean = false;

    constructor() {
        // 初始化时不创建git实例，将在需要时创建
        this.git = null;
    }

    /**
     * 初始化Git实例
     * 使用当前打开的工作区作为工作目录
     * @returns 是否成功初始化
     */
    private async initialize(): Promise<boolean> {
        try {
            // 检查是否有打开的工作区
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('请先打开一个项目文件夹！');
                return false;
            }

            // 使用第一个工作区文件夹作为Git仓库路径
            const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;

            // 使用指定的工作目录初始化Git实例
            this.git = simpleGit(workspaceFolder);

            // 验证当前目录是否是Git仓库
            const isRepo = await this.git.checkIsRepo();
            if (!isRepo) {
                vscode.window.showErrorMessage(`当前文件夹 "${workspaceFolder}" 不是一个有效的Git仓库！`);
                return false;
            }

            this.isGitRepo = true;
            return true;
        } catch (error) {
            console.error('Git初始化失败:', error);
            vscode.window.showErrorMessage(`Git初始化失败: ${error instanceof Error ? error.message : '未知错误'}`);
            return false;
        }
    }

    /**
     * 初始化Git仓库
     * 在当前工作区执行git init
     * @returns 是否成功初始化仓库
     */
    async initRepo(): Promise<boolean> {
        try {
            // 检查是否有打开的工作区
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('请先打开一个项目文件夹！');
                return false;
            }

            // 使用第一个工作区文件夹作为Git仓库路径
            const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;

            // 使用指定的工作目录初始化Git实例
            const tempGit = simpleGit(workspaceFolder);

            // 检查是否已经是Git仓库
            const isRepo = await tempGit.checkIsRepo();
            if (isRepo) {
                vscode.window.showInformationMessage(`当前文件夹 "${workspaceFolder}" 已经是一个Git仓库！`);
                this.git = tempGit;
                this.isGitRepo = true;
                return true;
            }

            // 初始化仓库
            await tempGit.init();

            // 验证初始化成功
            const isRepoAfterInit = await tempGit.checkIsRepo();
            if (!isRepoAfterInit) {
                throw new Error('初始化仓库后验证失败');
            }

            // 更新实例状态
            this.git = tempGit;
            this.isGitRepo = true;

            return true;
        } catch (error) {
            console.error('初始化Git仓库失败:', error);
            vscode.window.showErrorMessage(`初始化Git仓库失败: ${error instanceof Error ? error.message : '未知错误'}`);
            return false;
        }
    }

    // 获取当前分支
    async getCurrentBranch(): Promise<string> {
        try {
            if (!this.isGitRepo && !(await this.initialize())) {
                throw new Error('无法初始化Git仓库');
            }

            const branch = await this.git.branch();
            return branch.current;
        } catch (error) {
            console.error('获取当前分支失败:', error);
            throw new Error(`获取当前分支失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    // 获取所有分支
    async getAllBranches(): Promise<string[]> {
        try {
            if (!this.isGitRepo && !(await this.initialize())) {
                throw new Error('无法初始化Git仓库');
            }

            const branches = await this.git.branch();
            return Object.keys(branches.branches);
        } catch (error) {
            console.error('获取分支列表失败:', error);
            throw new Error(`获取分支列表失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    // 创建新分支
    async createBranch(branchName: string): Promise<void> {
        try {
            if (!this.isGitRepo && !(await this.initialize())) {
                throw new Error('无法初始化Git仓库');
            }

            await this.git.checkoutBranch(branchName, 'HEAD');
        } catch (error) {
            console.error('创建分支失败:', error);
            throw new Error(`创建分支失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    // 切换分支
    async switchBranch(branchName: string): Promise<void> {
        try {
            if (!this.isGitRepo && !(await this.initialize())) {
                throw new Error('无法初始化Git仓库');
            }

            await this.git.checkout(branchName);
        } catch (error) {
            console.error('切换分支失败:', error);
            throw new Error(`切换分支失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    // 获取仓库状态
    async getStatus(): Promise<any> {
        try {
            if (!this.isGitRepo && !(await this.initialize())) {
                throw new Error('无法初始化Git仓库');
            }

            return await this.git.status();
        } catch (error) {
            console.error('获取仓库状态失败:', error);
            throw new Error(`获取仓库状态失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    // 克隆仓库
    async clone(url: string, path: string): Promise<void> {
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
                const tempGit = simpleGit();
                
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
                } catch (error) {
                    clearInterval(progressInterval);
                    throw error;
                }
            });
        } catch (error) {
            console.error('克隆仓库失败:', error);
            throw new Error(`克隆仓库失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    // 推送更改
    async push(): Promise<void> {
        try {
            if (!this.isGitRepo && !(await this.initialize())) {
                throw new Error('无法初始化Git仓库');
            }

            // 获取当前分支
            const currentBranch = await this.getCurrentBranch();

            try {
                // 首先尝试普通推送
                await this.git.push();
            } catch (error) {
                // 如果推送失败且错误信息包含"no upstream branch"
                if (error instanceof Error && error.message.includes('no upstream branch')) {
                    // 设置上游分支并推送
                    await this.git.push(['--set-upstream', 'origin', currentBranch]);
                } else {
                    // 如果是其他错误，则重新抛出
                    throw error;
                }
            }
        } catch (error) {
            console.error('推送更改失败:', error);
            throw new Error(`推送更改失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    // 拉取更改
    async pull(): Promise<void> {
        try {
            if (!this.isGitRepo && !(await this.initialize())) {
                throw new Error('无法初始化Git仓库');
            }

            await this.git.pull();
        } catch (error) {
            console.error('拉取更改失败:', error);
            throw new Error(`拉取更改失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    // 添加文件
    async add(files: string): Promise<void> {
        try {
            if (!this.isGitRepo && !(await this.initialize())) {
                throw new Error('无法初始化Git仓库');
            }

            await this.git.add(files);
        } catch (error) {
            console.error('添加文件失败:', error);
            throw new Error(`添加文件失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    // 提交更改
    async commit(message: string): Promise<void> {
        try {
            if (!this.isGitRepo && !(await this.initialize())) {
                throw new Error('无法初始化Git仓库');
            }

            await this.git.commit(message);
        } catch (error) {
            console.error('提交更改失败:', error);
            throw new Error(`提交更改失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    // 获取远程仓库信息
    async getRemoteInfo(): Promise<{ owner: string, repo: string }> {
        try {
            if (!this.isGitRepo && !(await this.initialize())) {
                throw new Error('无法初始化Git仓库');
            }

            const remoteUrl = await this.git.remote(['get-url', 'origin']);
            const [owner, repo] = remoteUrl
                .split('/')
                .slice(-2)
                .map((s: string) => s.replace('.git', ''));
            return { owner, repo };
        } catch (error) {
            console.error('获取远程仓库信息失败:', error);
            throw new Error(`获取远程仓库信息失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    // 添加远程仓库
    async addRemote(name: string, url: string): Promise<void> {
        try {
            if (!this.isGitRepo && !(await this.initialize())) {
                throw new Error('无法初始化Git仓库');
            }

            // 检查远程仓库是否已存在
            try {
                const existingUrl = await this.git.remote(['get-url', name]);
                if (existingUrl) {
                    // 如果远程仓库已存在，询问是否更新
                    const update = await vscode.window.showWarningMessage(
                        `远程仓库 ${name} 已存在，URL为: ${existingUrl}\n是否更新为新的URL: ${url}？`,
                        { modal: true },
                        '更新',
                        '取消'
                    );

                    if (update === '更新') {
                        // 删除现有的远程仓库
                        await this.git.remote(['remove', name]);
                        // 添加新的远程仓库
                        await this.git.addRemote(name, url);
                        vscode.window.showInformationMessage(`远程仓库 ${name} 已更新！`);
                    } else {
                        throw new Error('操作已取消');
                    }
                }
            } catch (error) {
                // 如果远程仓库不存在，直接添加
                await this.git.addRemote(name, url);
                vscode.window.showInformationMessage(`远程仓库 ${name} 添加成功！`);
            }
        } catch (error) {
            console.error('添加远程仓库失败:', error);
            throw new Error(`添加远程仓库失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    // 设置上游分支
    async setUpstreamBranch(branchName: string, remoteName: string = 'origin'): Promise<void> {
        try {
            if (!this.isGitRepo && !(await this.initialize())) {
                throw new Error('无法初始化Git仓库');
            }

            // 验证分支名称
            if (!branchName || branchName.trim() === '') {
                // 如果分支名称为空，尝试获取当前分支
                const currentBranch = await this.getCurrentBranch();
                if (!currentBranch || currentBranch.trim() === '') {
                    throw new Error('无法获取有效的分支名称');
                }
                branchName = currentBranch;
            }

            // 验证远程仓库是否存在
            try {
                await this.git.remote(['get-url', remoteName]);
            } catch (error) {
                throw new Error(`远程仓库 ${remoteName} 不存在`);
            }

            // 设置上游分支
            await this.git.push(['--set-upstream', remoteName, branchName]);
            vscode.window.showInformationMessage(`已成功设置分支 ${branchName} 的上游分支为 ${remoteName}/${branchName}`);
        } catch (error) {
            console.error('设置上游分支失败:', error);
            throw new Error(`设置上游分支失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }
}

// 使用 exec 克隆仓库
async function cloneWithExec(url: string, path: string) {
    return vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "正在克隆仓库...",
        cancellable: true
    }, async (progress, token) => {
        // 初始化进度
        progress.report({ increment: 0, message: '准备克隆...' });

        // 设置取消处理
        let cancelled = false;
        token.onCancellationRequested(() => {
            cancelled = true;
            vscode.window.showWarningMessage('克隆操作已取消');
        });

        return new Promise<void>((resolve, reject) => {
            const { exec } = require('child_process');
            const repoName = path.split(/[\\\/]/).pop() || '仓库';
            
            // 创建子进程
            const process = exec(`git clone "${url}" "${path}"`, 
                { maxBuffer: 10 * 1024 * 1024 } // 增加缓冲区大小
            );
            
            // 用于模拟进度
            let progressValue = 0;
            const progressInterval = setInterval(() => {
                if (cancelled) {
                    clearInterval(progressInterval);
                    return;
                }
                
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
                if (cancelled) return;
                
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
                if (cancelled) return;
                
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
                
                if (code === 0 && !cancelled) {
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
                                vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(path), true);
                            } else if (action === 'current') {
                                // 在当前窗口打开
                                vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(path), false);
                            }
                            // 如果选择"不打开"则不执行任何操作
                        }
                    });
                    
                    resolve();
                } else if (!cancelled) {
                    vscode.window.showErrorMessage(`克隆失败: 退出代码 ${code}`);
                    reject(new Error(`克隆失败: 退出代码 ${code}`));
                } else {
                    reject(new Error('用户取消了克隆操作'));
                }
            });
            
            // 错误处理
            process.on('error', (error: Error) => {
                clearInterval(progressInterval);
                if (!cancelled) {
                    vscode.window.showErrorMessage(`克隆失败: ${error.message}`);
                    reject(error);
                }
            });
        });
    });
}

// 使用 exec 添加远程仓库
async function addRemoteWithExec(name: string, url: string, cwd: string) {
    return new Promise<void>((resolve, reject) => {
        const cmd = `git remote add ${name} "${url}"`;
        exec(cmd, { cwd }, (error, stdout, stderr) => {
            if (error) {
                vscode.window.showErrorMessage(`添加远程仓库失败: ${error.message}`);
                reject(error);
                return;
            }
            vscode.window.showInformationMessage(`远程仓库 ${name} 添加成功！`);
            resolve();
        });
    });
}

/**
 * 获取CSS样式内容
 * @param context 扩展上下文
 * @returns CSS样式内容
 */
function getStylesheetContent(context: vscode.ExtensionContext): string {
    const stylePath = path.join(context.extensionPath, 'resources', 'styles.css');
    try {
        const content = fs.readFileSync(stylePath, 'utf-8');
        console.log('成功加载样式文件');
        return content;
    } catch (error) {
        console.error('无法加载样式文件:', error);
        return '';
    }
}

/**
 * 创建WebView HTML内容
 * @param title 标题
 * @param content 内容
 * @returns HTML字符串
 */
function createWebViewContent(title: string, content: string): string {
    const packageJson = require('../package.json');
    const version = packageJson.version;

    return `
        <!DOCTYPE html>
        <html lang="zh-CN">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${title}</title>
            <style>
                body {
                    font-family: 'Segoe UI', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', Arial, sans-serif;
                    background: #f6f8fa;
                    color: #222;
                    margin: 0;
                    padding: 0;
                }
                .container {
                    max-width: 700px;
                    margin: 32px auto 0 auto;
                    padding: 0 16px;
                }
                h2 {
                    color: #4e7a1a;
                    border-bottom: 2px solid #4e7a1a;
                    padding-bottom: 8px;
                    margin-top: 0;
                    letter-spacing: 1px;
                }
                .card {
                    background: #fff;
                    border-radius: 14px;
                    box-shadow: 0 4px 24px 0 rgba(96,153,38,0.10);
                    padding: 24px 28px;
                    margin-bottom: 28px;
                    border: 1px solid #e0e4e8;
                    transition: box-shadow 0.2s;
                }
                .card:hover {
                    box-shadow: 0 8px 32px 0 rgba(96,153,38,0.16);
                }
                .item-list {
                    list-style-type: none;
                    padding: 0;
                    margin: 0;
                }
                .item-list li {
                    padding: 12px 18px;
                    margin-bottom: 8px;
                    border-radius: 8px;
                    background: #f2f6ed;
                    display: flex;
                    align-items: center;
                    transition: background 0.2s;
                }
                .item-list li:hover {
                    background: #e6f0d6;
                }
                .badge {
                    display: inline-block;
                    padding: 3px 12px;
                    border-radius: 14px;
                    font-size: 13px;
                    font-weight: bold;
                    margin-left: 12px;
                }
                .badge-success {
                    background: #609926;
                    color: #fff;
                }
                .badge-warning {
                    background: #f7c948;
                    color: #222;
                }
                .badge-error {
                    background: #e4572e;
                    color: #fff;
                }
                .status-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 0;
                    border-bottom: 1px solid #e0e4e8;
                }
                .status-label {
                    font-weight: bold;
                }
                .status-value {
                    color: #4e7a1a;
                }
                .current-branch {
                    font-weight: bold;
                    color: #609926;
                }
                .pr-item {
                    border-left: 4px solid #609926;
                    padding: 16px 18px;
                    margin-bottom: 12px;
                    border-radius: 0 10px 10px 0;
                    background: #f8faf5;
                    box-shadow: 0 1px 4px 0 rgba(96,153,38,0.04);
                }
                .pr-title {
                    font-weight: bold;
                    margin-bottom: 4px;
                }
                .pr-meta {
                    font-size: 0.95em;
                    color: #888;
                }
                .status-dot {
                    display: inline-block;
                    width: 12px;
                    height: 12px;
                    border-radius: 50%;
                    margin-right: 10px;
                }
                .status-dot.modified {
                    background: #f7c948;
                }
                .status-dot.added {
                    background: #609926;
                }
                .status-dot.deleted {
                    background: #e4572e;
                }
                .status-dot.renamed {
                    background: #4e7a1a;
                }
                .footer {
                    margin-top: 32px;
                    padding-top: 14px;
                    border-top: 2px solid #e0e4e8;
                    font-size: 1em;
                    text-align: center;
                    color: #888;
                    letter-spacing: 1px;
                }
                a {
                    color: #609926;
                    text-decoration: none;
                    transition: color 0.2s;
                }
                a:hover {
                    text-decoration: underline;
                    color: #4e7a1a;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h2>${title}</h2>
                <div class="card">
                    ${content}
                </div>
                <div class="footer">
                    Gitea Connector v${version}
                </div>
            </div>
        </body>
        </html>
    `;
}

// 修改创建WebView的方法
function createWebView(title: string, content: string): vscode.WebviewPanel {
    const panel = vscode.window.createWebviewPanel(
        'giteaWebView',
        title,
        vscode.ViewColumn.One,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    panel.webview.html = createWebViewContent(title, content);
    return panel;
}

// 仓库列表美化：主标题为repo名，副标题为owner
class Repository extends vscode.TreeItem {
    constructor(
        public readonly label: string, // repo名
        public readonly description: string, // owner名
        public readonly visibility: string,
        public readonly repoData: any
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.tooltip = `${this.label} (${this.visibility})`;
        this.description = this.description;
        this.contextValue = 'repository';
        this.id = repoData.full_name;
        
        // 为私有仓库使用红色图标，公开仓库使用蓝色图标
        const iconColor = this.visibility === 'private' ? 'charts.red' : 'charts.blue';
        this.iconPath = new vscode.ThemeIcon('repo', new vscode.ThemeColor(iconColor));
        
        // 添加删除命令
        this.command = {
            command: '_mygit.showTooltip',
            title: 'Show Repository Info',
            arguments: [this.label, this.visibility]
        };
    }
}

// 命令中心分组标题（不可点击）
class CommandGroup extends vscode.TreeItem {
    constructor(
        public readonly label: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.contextValue = 'commandGroup';
        this.iconPath = undefined;
    }
}

// 命令项（可点击，带描述和彩色图标）
class CommandItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly commandId: string,
        public readonly icon: string,
        public readonly iconColor: string,
        public readonly description?: string,
        public readonly tooltipText?: string
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.command = {
            command: commandId,
            title: label
        };
        this.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(iconColor));
        this.description = description;
        this.contextValue = 'commandItem';
        if (tooltipText) {
            this.tooltip = tooltipText;
        }
    }
}

// 命令中心分组与命令美化
class GiteaCommandsProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): vscode.TreeItem[] {
        if (!element) {
            // 一级：分组标题
            return [
                new CommandGroup('仓库管理'),
                new CommandGroup('Git操作'),
                new CommandGroup('分支管理'),
                new CommandGroup('PR管理'),
                new CommandGroup('历史与重置')
            ];
        }
        // 二级：分组下的命令
        switch (element.label) {
            case '仓库管理':
                return [
                    new CommandItem('连接服务器', 'mygit.connect', 'plug', 'charts.blue', '配置Gitea服务器连接', 'Connect to a Gitea server'),
                    new CommandItem('创建仓库', 'mygit.createRepo', 'repo-create', 'charts.green', '创建新的远程Gitea仓库', 'Create a new Gitea repository'),
                    new CommandItem('克隆仓库', 'mygit.cloneRepo', 'cloud-download', 'charts.blue', '克隆远程仓库到本地', 'Clone a remote repository to local'),
                    new CommandItem('初始化仓库', 'mygit.initRepo', 'repo', 'charts.yellow', '在当前目录初始化Git仓库', 'Initialize a Git repository in current folder')
                ];
            case 'Git操作':
                return [
                    new CommandItem('推送更改', 'mygit.push', 'arrow-up', 'charts.green', '提交本地更改到远程', 'Push local changes to remote'),
                    new CommandItem('拉取更改', 'mygit.pull', 'arrow-down', 'charts.blue', '拉取远程更改到本地', 'Pull changes from remote'),
                    new CommandItem('提交更改', 'mygit.commit', 'check', 'charts.yellow', '提交本地更改', 'Commit local changes'),
                    new CommandItem('仓库状态', 'mygit.showStatus', 'info', 'charts.purple', '查看仓库当前状态', 'Show current repository status')
                ];
            case '分支管理':
                return [
                    new CommandItem('列出分支', 'mygit.listBranches', 'git-branch', 'charts.blue', '查看所有分支', 'List all branches'),
                    new CommandItem('创建分支', 'mygit.createBranch', 'add', 'charts.green', '创建新的分支', 'Create a new branch'),
                    new CommandItem('切换分支', 'mygit.switchBranch', 'git-branch', 'charts.yellow', '切换到其他分支', 'Switch to another branch')
                ];
            case 'PR管理':
                return [
                    new CommandItem('创建PR', 'mygit.createPR', 'git-pull-request', 'charts.green', '创建新的Pull Request', 'Create a new Pull Request'),
                    new CommandItem('列出PR', 'mygit.listPRs', 'list-unordered', 'charts.blue', '查看当前仓库所有PR', 'List all Pull Requests')
                ];
            case '历史与重置':
                return [
                    new CommandItem('查看提交历史', 'mygit.showLog', 'history', 'charts.blue', '查看Git提交历史日志', 'Show Git commit history'),
                    new CommandItem('重置更改', 'mygit.reset', 'refresh', 'charts.orange', '重置Git更改', 'Reset Git changes')
                ];
            default:
                return [];
        }
    }
}

class GiteaRepositoriesProvider implements vscode.TreeDataProvider<Repository> {
    private _onDidChangeTreeData: vscode.EventEmitter<Repository | undefined | null | void> = new vscode.EventEmitter<Repository | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<Repository | undefined | null | void> = this._onDidChangeTreeData.event;
    
    private serverManager: ServerManager;
    private disposables: vscode.Disposable[] = [];

    constructor() { 
        this.serverManager = ServerManager.getInstance();
        
        // 订阅服务器变更事件
        this.disposables.push(
            this.serverManager.onServerChanged(() => {
                // 当服务器变更时刷新仓库列表
                this.refresh();
                // 延迟再次刷新以确保UI更新
                setTimeout(() => this.refresh(), 500);
            })
        );
    }

    // 销毁时清理订阅
    dispose() {
        this.disposables.forEach(d => d.dispose());
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: Repository): vscode.TreeItem {
        // 添加删除按钮
        const treeItem = element;
        
        // 添加自定义按钮
        treeItem.tooltip = `${element.label} (${element.visibility})
单击克隆图标可克隆此仓库
单击删除图标可删除此仓库`;
        
        return treeItem;
    }

    async getChildren(element?: Repository): Promise<Repository[]> {
        if (element) {
            return [];
        }

        // 从服务器管理器获取当前服务器信息
        const currentServer = this.serverManager.getCurrentServer();
        
        // 如果没有配置服务器或未选择服务器，返回空列表
        if (!currentServer) {
            return [];
        }

        try {
            const gitea = new GiteaAPI(currentServer.url, currentServer.token);
            const repos = await gitea.getUserRepos();

            return repos.map(repo => {
                const repoData = {
                    full_name: repo.full_name,
                    name: repo.name,
                    owner: repo.owner?.login || repo.full_name.split('/')[0],
                    description: repo.description || '',
                    private: repo.private || false,
                    clone_url: repo.clone_url,
                    html_url: repo.html_url
                };

                return new Repository(
                    repo.full_name,
                    repo.description || '',
                    repo.private ? 'private' : 'public',
                    repoData
                );
            });
        } catch (error) {
            console.error('获取仓库列表失败:', error);
            return [];
        }
    }
}

// 服务器项
class ServerItem extends vscode.TreeItem {
    constructor(
        public readonly label: string,
        public readonly isDefault: boolean,
        public readonly serverData: any
    ) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.tooltip = `${this.label} (${serverData.url})`;
        this.description = this.isDefault ? '当前服务器' : serverData.url;
        this.contextValue = 'serverItem';
        this.iconPath = new vscode.ThemeIcon(this.isDefault ? 'server-environment' : 'server',
            new vscode.ThemeColor(this.isDefault ? 'charts.green' : 'charts.blue'));
    }
}

// 服务器管理视图
class GiteaServersProvider implements vscode.TreeDataProvider<ServerItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<ServerItem | undefined | null | void> = new vscode.EventEmitter<ServerItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<ServerItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private serverManager: ServerManager;

    constructor() {
        this.serverManager = ServerManager.getInstance();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    getTreeItem(element: ServerItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: ServerItem): Promise<ServerItem[]> {
        if (element) {
            return [];
        }

        const servers = this.serverManager.getAllServers();
        const currentServer = this.serverManager.getCurrentServer();

        return servers.map(server => {
            return new ServerItem(
                server.name,
                server.isDefault || false,
                {
                    name: server.name,
                    url: server.url
                }
            );
        });
    }
}

// 扩展激活函数
export async function activate(context: vscode.ExtensionContext) {
    const gitOps = new GitOperations();

    // 获取样式内容
    const stylesheetContent = getStylesheetContent(context);
    if (!stylesheetContent) {
        console.error('警告: 样式文件加载失败，界面可能无法正常显示');
    }

    // 创建视图提供者
    const giteaRepositoriesProvider = new GiteaRepositoriesProvider();
    // 保存到全局变量中用于释放资源
    global.giteaRepositoriesProvider = giteaRepositoriesProvider;
    
    const giteaCommandsProvider = new GiteaCommandsProvider();
    const giteaServersProvider = new GiteaServersProvider();

    // 注册视图
    const reposTreeView = vscode.window.createTreeView('giteaExplorer', {
        treeDataProvider: giteaRepositoriesProvider,
        showCollapseAll: true
    });

    const commandsTreeView = vscode.window.createTreeView('giteaCommands', {
        treeDataProvider: giteaCommandsProvider
    });

    const serversTreeView = vscode.window.createTreeView('giteaServers', {
        treeDataProvider: giteaServersProvider
    });

    // 注册刷新仓库列表命令
    let refreshCommand = vscode.commands.registerCommand('mygit.refreshRepos', () => {
        giteaRepositoriesProvider.refresh();
    });

    // 注册刷新服务器列表命令
    let refreshServersCommand = vscode.commands.registerCommand('mygit.refreshServers', () => {
        giteaServersProvider.refresh();
    });

    // 初始化管理器实例
    const serverManager = ServerManager.getInstance();
    const repoManager = RepoManager.getInstance();
    const visibilityManager = VisibilityManager.getInstance();

    // 注册命令
    let connectCommand = vscode.commands.registerCommand('mygit.connect', async () => {
        const serverName = await vscode.window.showInputBox({
            prompt: '输入服务器名称',
            placeHolder: '例如: MyGitea'
        });

        if (!serverName) {
            return;
        }

        const serverUrl = await vscode.window.showInputBox({
            prompt: '输入服务器地址',
            placeHolder: '例如: https://gitea.example.com'
        });

        if (!serverUrl) {
            return;
        }

        const token = await vscode.window.showInputBox({
            prompt: '输入访问令牌',
            password: true
        });

        if (!token) {
            return;
        }

        const result = await serverManager.addServer({
            name: serverName,
            url: serverUrl,
            token: token
        });
        
        if (result) {
            vscode.window.showInformationMessage(`服务器 ${serverName} 连接成功`);
            // 刷新服务器列表
            giteaServersProvider.refresh();
            // 刷新仓库列表
            giteaRepositoriesProvider.refresh();
            // 延迟刷新仓库列表以确保UI更新
            setTimeout(() => {
                giteaRepositoriesProvider.refresh();
            }, 500);
        }
    });

    let createRepoCommand = vscode.commands.registerCommand('mygit.createRepo', async () => {
        const repoName = await vscode.window.showInputBox({
            prompt: '输入仓库名称',
            placeHolder: '例如: my-project'
        });

        if (!repoName) {
            return;
        }

        const description = await vscode.window.showInputBox({
            prompt: '输入仓库描述（可选）',
            placeHolder: '例如: 我的项目描述'
        });

        const visibility = await visibilityManager.showVisibilityPicker();
        if (!visibility) {
            return;
        }

        await repoManager.createRepository({
            name: repoName,
            description: description,
            private: visibility === 'private',
            server: serverManager.getCurrentServer()?.name || ''
        });
    });

    let cloneRepoCommand = vscode.commands.registerCommand('mygit.cloneRepo', async (repoDataOrTreeItem?: any) => {
        // 如果是从仓库项上下文菜单或图标按钮调用，直接使用该仓库数据
        if (repoDataOrTreeItem?.repoData) {
            const repoData = repoDataOrTreeItem.repoData;
            
            // 使用目录选择对话框代替输入框
            const folderUri = await vscode.window.showOpenDialog({
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: '选择本地存放目录'
            });

            if (!folderUri || folderUri.length === 0) {
                return;  // 用户取消了操作
            }

            // 获取父目录
            const parentDir = folderUri[0].fsPath;
            // 获取仓库名称并创建完整目标路径
            const repoName = repoData.name || repoData.full_name.split('/').pop() || 'repo';
            const targetPath = path.join(parentDir, repoName);

            await repoManager.cloneRepository(repoData.clone_url, targetPath);
            return;
        }
        
        // 如果是从命令面板调用，显示仓库列表让用户选择
        const repos = await repoManager.listRepositories();
        const items = repos.map(repo => ({
            label: repo.name,
            description: repo.description,
            detail: repo.private ? '私有仓库' : '公开仓库',
            value: repo.clone_url
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: '选择要克隆的仓库'
        });

        if (!selected) {
            return;
        }

        // 使用目录选择对话框代替输入框
        const folderUri = await vscode.window.showOpenDialog({
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: '选择本地存放目录'
        });

        if (!folderUri || folderUri.length === 0) {
            return;  // 用户取消了操作
        }

        // 获取父目录
        const parentDir = folderUri[0].fsPath;
        // 尝试从 URL 中提取仓库名
        const urlParts = selected.value.split('/');
        const repoName = urlParts[urlParts.length - 1].replace('.git', '') || 'repo';
        const targetPath = path.join(parentDir, repoName);

        await repoManager.cloneRepository(selected.value, targetPath);
    });

    let switchServerCommand = vscode.commands.registerCommand('mygit.switchServer', async (serverItem?: ServerItem) => {
        let serverName: string | undefined;

        // 如果是从服务器项上下文菜单调用
        if (serverItem && serverItem.serverData && serverItem.serverData.name) {
            serverName = serverItem.serverData.name;
        } else {
            // 否则显示选择列表
            const servers = serverManager.getAllServers();
            const items = servers.map(server => ({
                label: server.name,
                description: server.url,
                detail: server.isDefault ? '当前服务器' : undefined,
                value: server.name
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: '选择要切换的服务器'
            });

            if (selected) {
                serverName = selected.value;
            }
        }

        if (serverName) {
            const result = await serverManager.switchServer(serverName);
            if (result) {
                vscode.window.showInformationMessage(`已切换到服务器: ${serverName}`);
                // 先刷新服务器列表
                giteaServersProvider.refresh();
                // 确保在切换服务器后立即刷新仓库列表
                giteaRepositoriesProvider.refresh();
                // 等待一小段时间后再次刷新确保UI更新
                setTimeout(() => {
                    giteaRepositoriesProvider.refresh();
                }, 500);
            }
        }
    });

    let pushCommand = vscode.commands.registerCommand('mygit.push', async () => {
        try {
            // 创建进度条
            await vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "正在推送代码...",
                cancellable: false
            }, async (progress) => {
                // 更新进度信息
                progress.report({ message: "准备推送..." });
                
                // 获取当前分支信息
                const currentBranch = await gitOps.getCurrentBranch();
                progress.report({ message: `正在推送到分支: ${currentBranch}` });
                
                // 执行推送
                await gitOps.push();
                
                // 推送完成
                progress.report({ message: "推送完成" });
            });
            
            vscode.window.showInformationMessage('代码推送成功！');
        } catch (error) {
            vscode.window.showErrorMessage(`代码推送失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    });

    let pullCommand = vscode.commands.registerCommand('mygit.pull', async () => {
        try {
            await gitOps.pull();
            vscode.window.showInformationMessage('代码拉取成功！');
        } catch (error) {
            vscode.window.showErrorMessage(`代码拉取失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    });

    let commitCommand = vscode.commands.registerCommand('mygit.commit', async () => {
        const message = await vscode.window.showInputBox({
            prompt: '请输入提交信息',
            placeHolder: 'Commit message'
        });

        if (!message) {
            return;
        }

        try {
            await gitOps.add('.');
            await gitOps.commit(message);
            vscode.window.showInformationMessage('代码提交成功！');
        } catch (error) {
            vscode.window.showErrorMessage(`代码提交失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    });

    let listBranchesCommand = vscode.commands.registerCommand('mygit.listBranches', async () => {
        try {
            const branches = await gitOps.getAllBranches();
            const currentBranch = await gitOps.getCurrentBranch();

            // 构建分支列表HTML
            let branchListHtml = '<ul class="item-list">';
            branches.forEach(branch => {
                const isCurrent = branch === currentBranch;
                branchListHtml += `
                    <li class="${isCurrent ? 'current-branch' : ''}">
                        <span class="branch-icon"></span>
                        ${branch}
                        ${isCurrent ? '<span class="badge badge-success">当前</span>' : ''}
                    </li>
                `;
            });
            branchListHtml += '</ul>';

            createWebView('分支列表', branchListHtml);
        } catch (error) {
            vscode.window.showErrorMessage(`获取分支列表失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    });

    let createBranchCommand = vscode.commands.registerCommand('mygit.createBranch', async () => {
        const branchName = await vscode.window.showInputBox({
            prompt: '请输入新分支名称',
            placeHolder: 'feature/new-branch'
        });

        if (!branchName) {
            return;
        }

        try {
            await gitOps.createBranch(branchName);
            vscode.window.showInformationMessage(`分支 ${branchName} 创建成功！`);
        } catch (error) {
            vscode.window.showErrorMessage(`创建分支失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    });

    let switchBranchCommand = vscode.commands.registerCommand('mygit.switchBranch', async () => {
        try {
            const branches = await gitOps.getAllBranches();
            const branchName = await vscode.window.showQuickPick(branches, {
                placeHolder: '选择要切换的分支'
            });

            if (!branchName) {
                return;
            }

            await gitOps.switchBranch(branchName);
            vscode.window.showInformationMessage(`已切换到分支 ${branchName}`);
        } catch (error) {
            vscode.window.showErrorMessage(`切换分支失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    });

    let createPRCommand = vscode.commands.registerCommand('mygit.createPR', async () => {
        const config = vscode.workspace.getConfiguration('gitea');
        const serverUrl = config.get('serverUrl');
        const token = config.get('token');

        if (!serverUrl || !token) {
            vscode.window.showErrorMessage('请先配置 Gitea 服务器连接信息！');
            return;
        }

        const title = await vscode.window.showInputBox({
            prompt: '请输入 Pull Request 标题',
            placeHolder: 'PR title'
        });

        if (!title) {
            return;
        }

        const body = await vscode.window.showInputBox({
            prompt: '请输入 Pull Request 描述',
            placeHolder: 'PR description'
        });

        try {
            const currentBranch = await gitOps.getCurrentBranch();
            const baseBranch = await vscode.window.showInputBox({
                prompt: '请输入目标分支',
                placeHolder: 'main',
                value: 'main'
            });

            if (!baseBranch) {
                return;
            }

            const gitea = new GiteaAPI(serverUrl as string, token as string);
            const { owner, repo } = await gitOps.getRemoteInfo();
            const pr = await gitea.createPullRequest(owner, repo, title, body || '', currentBranch, baseBranch);
            vscode.window.showInformationMessage(`Pull Request 创建成功！`);
        } catch (error) {
            vscode.window.showErrorMessage(`创建 Pull Request 失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    });

    let listPRsCommand = vscode.commands.registerCommand('mygit.listPRs', async () => {
        const config = vscode.workspace.getConfiguration('gitea');
        const serverUrl = config.get('serverUrl');
        const token = config.get('token');

        if (!serverUrl || !token) {
            vscode.window.showErrorMessage('请先配置 Gitea 服务器连接信息！');
            return;
        }

        const gitea = new GiteaAPI(serverUrl as string, token as string);
        try {
            const { owner, repo } = await gitOps.getRemoteInfo();
            const prs = await gitea.getPullRequests(owner, repo);

            // 构建PR列表HTML
            let prListHtml = '';
            if (prs.length === 0) {
                prListHtml = '<p>当前仓库没有Pull Requests</p>';
            } else {
                prListHtml = '<div class="pr-list">';
                prs.forEach((pr: any) => {
                    const statusClass = pr.state === 'open' ? 'badge-success' : 'badge-error';
                    prListHtml += `
                        <div class="pr-item">
                            <div class="pr-title">
                                #${pr.number} ${pr.title}
                                <span class="badge ${statusClass}">${pr.state}</span>
                            </div>
                            <div class="pr-meta">
                                由 ${pr.user.login} 创建于 ${new Date(pr.created_at).toLocaleString()}
                            </div>
                        </div>
                    `;
                });
                prListHtml += '</div>';
            }

            createWebView('Pull Requests', prListHtml);
        } catch (error) {
            vscode.window.showErrorMessage(`获取 Pull Requests 失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    });

    let showStatusCommand = vscode.commands.registerCommand('mygit.showStatus', async () => {
        try {
            const status = await gitOps.getStatus();

            // 构建状态HTML
            let statusHtml = '<div class="status-container">';

            // 当前分支
            statusHtml += `
                <div class="status-item">
                    <span class="status-label">当前分支:</span>
                    <span class="status-value current-branch">${status.current}</span>
                </div>
            `;

            // 修改文件
            statusHtml += `
                <div class="status-item">
                    <span class="status-label">修改文件:</span>
                    <span class="status-value">
                        <span class="status-dot modified"></span>${status.modified.length}
                    </span>
                </div>
            `;

            // 新增文件
            statusHtml += `
                <div class="status-item">
                    <span class="status-label">新增文件:</span>
                    <span class="status-value">
                        <span class="status-dot added"></span>${status.created.length}
                    </span>
                </div>
            `;

            // 删除文件
            statusHtml += `
                <div class="status-item">
                    <span class="status-label">删除文件:</span>
                    <span class="status-value">
                        <span class="status-dot deleted"></span>${status.deleted.length}
                    </span>
                </div>
            `;

            // 未跟踪文件
            statusHtml += `
                <div class="status-item">
                    <span class="status-label">未跟踪文件:</span>
                    <span class="status-value">
                        <span class="status-dot"></span>${status.not_added.length}
                    </span>
                </div>
            `;

            // 重命名文件
            statusHtml += `
                <div class="status-item">
                    <span class="status-label">重命名文件:</span>
                    <span class="status-value">
                        <span class="status-dot renamed"></span>${status.renamed.length}
                    </span>
                </div>
            `;

            // 总体是否干净
            const isClean = status.files.length === 0;
            statusHtml += `
                <div class="status-item">
                    <span class="status-label">仓库状态:</span>
                    <span class="status-value">
                        <span class="badge ${isClean ? 'badge-success' : 'badge-warning'}">
                            ${isClean ? '干净' : '有未提交更改'}
                        </span>
                    </span>
                </div>
            `;

            statusHtml += '</div>';

            createWebView('仓库状态', statusHtml);
        } catch (error) {
            vscode.window.showErrorMessage(`获取仓库状态失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    });

    let initRepoCommand = vscode.commands.registerCommand('mygit.initRepo', async () => {
        try {
            // 检查是否有打开的工作区
            if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('请先打开一个项目文件夹！');
                return;
            }

            const workspaceFolder = vscode.workspace.workspaceFolders[0].uri.fsPath;

            // 获取项目名称（文件夹名）
            const folderName = workspaceFolder.split(/[\\\/]/).pop() || '';

            // 确认是否初始化仓库
            const answer = await vscode.window.showWarningMessage(
                `是否将当前文件夹 "${workspaceFolder}" 初始化为Git仓库？`,
                { modal: true, detail: '这将在当前文件夹中创建Git仓库' },
                { title: '是', isCloseAffordance: false }
            );

            if (answer === undefined) {
                return;
            }

            // 初始化仓库
            const success = await gitOps.initRepo();
            if (success) {
                vscode.window.showInformationMessage('Git仓库初始化成功！');

                // 询问是否创建并关联远程仓库
                const addRemote = await vscode.window.showInformationMessage(
                    '是否创建并关联远程Gitea仓库？',
                    '创建并关联',
                    '手动关联',
                    '稍后再说'
                );

                if (addRemote === '创建并关联') {
                    // 检查Gitea配置
                    const server = serverManager.getCurrentServer();
                    if (!server) {
                        const configNow = await vscode.window.showErrorMessage(
                            '未配置Gitea服务器连接信息，是否现在配置？',
                            '配置',
                            '取消'
                        );

                        if (configNow === '配置') {
                            await vscode.commands.executeCommand('mygit.connect');
                            // 配置完后重新获取
                            const newServer = serverManager.getCurrentServer();

                            if (!newServer) {
                                vscode.window.showErrorMessage('仍未完成Gitea服务器配置，无法创建远程仓库');
                                return;
                            }
                        } else {
                            return;
                        }
                    }

                    try {
                        // 创建仓库描述
                        const description = await vscode.window.showInputBox({
                            prompt: '请输入仓库描述（可选）',
                            placeHolder: '项目描述信息'
                        }) || `${folderName} - 由Gitea Connector自动创建`;

                        // 选择仓库可见性
                        const visibility = await visibilityManager.showVisibilityPicker();
                        if (!visibility) {
                            vscode.window.showInformationMessage('已取消创建远程仓库');
                            return;
                        }

                        // 创建远程仓库
                        const repoResult = await repoManager.createRepository({
                            name: folderName,
                            description: description,
                            private: visibility === 'private',
                            server: serverManager.getCurrentServer()?.name || ''
                        });

                        if (!repoResult) {
                            vscode.window.showErrorMessage('创建远程仓库失败');
                            return;
                        }

                        // 获取仓库URL
                        const repos = await repoManager.listRepositories();
                        const newRepo = repos.find(repo => repo.name === folderName);

                        if (!newRepo) {
                            vscode.window.showErrorMessage('无法获取新创建的仓库信息');
                            return;
                        }

                        // 关联远程仓库
                        try {
                            await gitOps.addRemote('origin', newRepo.clone_url);
                            vscode.window.showInformationMessage('已成功关联远程仓库！');

                            // 设置上游分支
                            try {
                                const currentBranch = await gitOps.getCurrentBranch();
                                if (!currentBranch) {
                                    // 如果没有当前分支，创建并切换到 master 分支
                                    await gitOps.createBranch('master');
                                    await gitOps.switchBranch('master');
                                    await gitOps.setUpstreamBranch('master');
                                } else {
                                    await gitOps.setUpstreamBranch(currentBranch);
                                }
                                vscode.window.showInformationMessage('已设置上游分支！');
                            } catch (error) {
                                console.error('设置上游分支失败:', error);
                                vscode.window.showWarningMessage(`设置上游分支失败: ${error instanceof Error ? error.message : '未知错误'}`);
                            }
                        } catch (error) {
                            if (error instanceof Error && error.message.includes('操作已取消')) {
                                vscode.window.showInformationMessage('已取消更新远程仓库');
                            } else {
                                throw error;
                            }
                        }

                        // 刷新仓库列表
                        vscode.commands.executeCommand('mygit.refreshRepos');

                    } catch (error) {
                        vscode.window.showErrorMessage(`创建或关联远程仓库失败: ${error instanceof Error ? error.message : '未知错误'}`);
                        // 提示用户手动关联
                        const manualConnect = await vscode.window.showInformationMessage(
                            '是否尝试手动关联远程仓库？',
                            '手动关联',
                            '取消'
                        );

                        if (manualConnect === '手动关联') {
                            await vscode.commands.executeCommand('mygit.addRemote');
                        }
                    }
                } else if (addRemote === '手动关联') {
                    await vscode.commands.executeCommand('mygit.addRemote');
                    // 在手动关联后也尝试设置上游分支
                    try {
                        const currentBranch = await gitOps.getCurrentBranch();
                        await gitOps.setUpstreamBranch(currentBranch);
                        vscode.window.showInformationMessage('已设置上游分支！');
                    } catch (error) {
                        vscode.window.showWarningMessage(`设置上游分支失败: ${error instanceof Error ? error.message : '未知错误'}`);
                    }
                }
            }
        } catch (error) {
            vscode.window.showErrorMessage(`初始化Git仓库失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    });

    // 为删除仓库按钮设置红色图标
    const deleteRepoIcon = new vscode.ThemeIcon('trash', new vscode.ThemeColor('charts.red'));
    
    // 注册删除仓库命令
    let deleteRepoCommand = vscode.commands.registerCommand('mygit.deleteRepo', async (repoDataOrTreeItem?: any) => {
        try {
            // 兼容 context menu（TreeItem）和主项点击（repoData）
            let repoData = repoDataOrTreeItem?.repoData || repoDataOrTreeItem;
            // 调试输出
            console.log('删除仓库命令被调用，参数:', JSON.stringify(repoData, null, 2));

            const config = vscode.workspace.getConfiguration('gitea');
            const serverUrl = config.get('serverUrl');
            const token = config.get('token');

            if (!serverUrl || !token) {
                vscode.window.showErrorMessage('请先配置 Gitea 服务器连接信息！');
                return;
            }

            let selectedRepo = repoData;
            // 验证仓库数据
            if (!selectedRepo) {
                vscode.window.showErrorMessage('未选择仓库！');
                return;
            }
            if (!selectedRepo.full_name) {
                vscode.window.showErrorMessage('仓库信息不完整，缺少必要字段！');
                return;
            }
            // 显示确认对话框
            const confirm = await vscode.window.showWarningMessage(
                `确定要删除仓库 "${selectedRepo.full_name}" 吗？此操作不可恢复！`,
                { modal: true, detail: '此操作不可撤销' },
                { title: '删除', isCloseAffordance: false }
            );
            if (confirm === undefined) {
                return;
            }
            // 再次确认
            const finalConfirm = await vscode.window.showWarningMessage(
                `请再次确认是否删除仓库 "${selectedRepo.full_name}"？`,
                { modal: true, detail: '此操作将永久删除此仓库及其所有内容' },
                { title: '确认删除', isCloseAffordance: false }
            );
            if (finalConfirm === undefined) {
                return;
            }
            // 执行删除操作
            const gitea = new GiteaAPI(serverUrl as string, token as string);
            const parts = selectedRepo.full_name.split('/');
            if (parts.length !== 2) {
                vscode.window.showErrorMessage(`无效的仓库名称格式: ${selectedRepo.full_name}`);
                return;
            }
            const [owner, repo] = parts;
            if (!owner || !repo) {
                vscode.window.showErrorMessage('无法解析仓库信息！');
                return;
            }
            await gitea.deleteRepo(owner, repo);
            vscode.window.showInformationMessage(`仓库 "${selectedRepo.full_name}" 已成功删除！`);
            // 刷新仓库列表
            vscode.commands.executeCommand('mygit.refreshRepos');
        } catch (error) {
            vscode.window.showErrorMessage(`删除仓库失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    });

    // 注册查看Git日志命令
    let showLogDisposable = vscode.commands.registerCommand('mygit.showLog', () => {
        showGitLog(context);
    });

    // 注册重置Git更改命令
    let resetDisposable = vscode.commands.registerCommand('mygit.reset', () => {
        resetGitChanges(context);
    });

    let manageServersCommand = vscode.commands.registerCommand('mygit.manageServers', async () => {
        const action = await vscode.window.showQuickPick([
            { label: '添加新服务器', value: 'add' },
            { label: '删除服务器', value: 'delete' }
        ], {
            placeHolder: '选择服务器管理操作'
        });

        if (!action) {
            return;
        }

        if (action.value === 'add') {
            await vscode.commands.executeCommand('mygit.connect');
            giteaServersProvider.refresh();
            // 添加服务器后刷新仓库列表
            giteaRepositoriesProvider.refresh();
        } else if (action.value === 'delete') {
            const servers = serverManager.getAllServers();
            if (servers.length === 0) {
                vscode.window.showInformationMessage('当前没有配置任何服务器');
                return;
            }

            const serverToDelete = await vscode.window.showQuickPick(
                servers.map(server => ({
                    label: server.name,
                    description: server.url,
                    detail: server.isDefault ? '当前服务器' : undefined,
                    value: server.name
                })), {
                placeHolder: '选择要删除的服务器'
            }
            );

            if (!serverToDelete) {
                return;
            }

            const confirmed = await vscode.window.showWarningMessage(
                `确定要删除服务器 "${serverToDelete.label}" 吗？`,
                { modal: true },
                '删除',
                '取消'
            );

            if (confirmed === '删除') {
                await serverManager.removeServer(serverToDelete.value);
                giteaServersProvider.refresh();
                // 确保在删除服务器后刷新仓库列表
                giteaRepositoriesProvider.refresh();
                // 等待一小段时间后再次刷新确保UI更新
                setTimeout(() => {
                    giteaRepositoriesProvider.refresh();
                }, 500);
                vscode.window.showInformationMessage(`服务器 "${serverToDelete.label}" 已删除`);
            }
        }
    });

    // 注册仓库提示命令
    let showTooltipCommand = vscode.commands.registerCommand('_mygit.showTooltip', (repoName: string, visibility: string) => {
        // 仅显示提示，不执行任何操作
        // 这个命令允许我们在Repository类中设置command属性，而不会影响删除按钮的功能
    });

    // 添加到订阅列表
    context.subscriptions.push(
        reposTreeView,
        commandsTreeView,
        serversTreeView,
        refreshCommand,
        refreshServersCommand,
        connectCommand,
        createRepoCommand,
        cloneRepoCommand,
        switchServerCommand,
        pushCommand,
        pullCommand,
        commitCommand,
        listBranchesCommand,
        createBranchCommand,
        switchBranchCommand,
        createPRCommand,
        listPRsCommand,
        showStatusCommand,
        initRepoCommand,
        deleteRepoCommand,
        showLogDisposable,
        resetDisposable,
        manageServersCommand,
        showTooltipCommand
    );
}

// 扩展停用函数
export function deactivate() { 
    // 释放资源
    if (global.giteaRepositoriesProvider) {
        global.giteaRepositoriesProvider.dispose();
    }
}

// 添加全局声明
declare global {
    var giteaRepositoriesProvider: GiteaRepositoriesProvider | undefined;
} 