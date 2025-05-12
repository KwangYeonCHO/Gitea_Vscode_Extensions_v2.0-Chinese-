"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GiteaCommandsProvider = exports.GiteaRepositoriesProvider = exports.CommandGroupTreeItem = exports.CommandTreeItem = exports.RepositoryTreeItem = void 0;
const vscode = require("vscode");
const giteaApi_1 = require("./giteaApi");
/**
 * 仓库树节点类
 * 表示Gitea Explorer视图中的一个节点
 */
class RepositoryTreeItem extends vscode.TreeItem {
    constructor(label, repoData, collapsibleState) {
        super(label, collapsibleState);
        this.label = label;
        this.repoData = repoData;
        this.collapsibleState = collapsibleState;
        this.tooltip = `${repoData.description || '无描述'}\n\n所有者: ${repoData.owner.login}\n仓库URL: ${repoData.clone_url}`;
        this.description = repoData.owner.login;
        this.contextValue = 'repository';
        // 使用自定义主题图标
        this.iconPath = new vscode.ThemeIcon('repo', new vscode.ThemeColor('gitDecoration.addedResourceForeground'));
        // 为节点添加克隆命令
        this.command = {
            command: 'mygit.clone',
            title: '克隆仓库',
            arguments: [this.repoData]
        };
    }
}
exports.RepositoryTreeItem = RepositoryTreeItem;
/**
 * 命令按钮树节点类
 * 表示命令中心视图中的一个按钮节点
 */
class CommandTreeItem extends vscode.TreeItem {
    constructor(label, commandId, icon, description, color) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.label = label;
        this.commandId = commandId;
        this.icon = icon;
        this.description = description;
        this.color = color;
        this.tooltip = description || label;
        this.description = description;
        this.contextValue = 'command';
        // 使用带颜色的主题图标
        if (color) {
            this.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
        }
        else {
            this.iconPath = new vscode.ThemeIcon(icon);
        }
        // 为节点添加命令
        this.command = {
            command: commandId,
            title: label
        };
    }
}
exports.CommandTreeItem = CommandTreeItem;
/**
 * 命令分组树节点类
 * 表示命令中心视图中的一个分组节点
 */
class CommandGroupTreeItem extends vscode.TreeItem {
    constructor(label, commands, icon = 'folder', color = 'foreground') {
        super(label, vscode.TreeItemCollapsibleState.Expanded);
        this.label = label;
        this.commands = commands;
        this.icon = icon;
        this.color = color;
        this.tooltip = label;
        this.contextValue = 'commandGroup';
        this.iconPath = new vscode.ThemeIcon(icon, new vscode.ThemeColor(color));
        this.collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
    }
}
exports.CommandGroupTreeItem = CommandGroupTreeItem;
/**
 * 仓库树数据提供者
 * 为Gitea Explorer视图提供数据
 */
class GiteaRepositoriesProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
        this.loadConfiguration();
    }
    /**
     * 加载配置
     * 创建GiteaAPI实例
     */
    loadConfiguration() {
        const config = vscode.workspace.getConfiguration('gitea');
        const serverUrl = config.get('serverUrl');
        const token = config.get('token');
        if (serverUrl && token) {
            this.giteaApi = new giteaApi_1.GiteaAPI(serverUrl, token);
        }
        else {
            this.giteaApi = undefined;
        }
    }
    /**
     * 刷新视图
     */
    refresh() {
        this.loadConfiguration();
        this._onDidChangeTreeData.fire();
    }
    /**
     * 获取树节点
     * @param element 树节点
     */
    getTreeItem(element) {
        return element;
    }
    /**
     * 获取子节点
     * @param element 父节点
     */
    async getChildren(element) {
        // 如果尚未配置，则显示空列表
        if (!this.giteaApi) {
            return Promise.resolve([]);
        }
        // 获取仓库列表
        try {
            const repos = await this.giteaApi.getUserRepos();
            if (!repos || repos.length === 0) {
                vscode.window.showInformationMessage('没有找到仓库');
                return [];
            }
            // 将仓库数据转换为树节点
            return repos.map((repo) => new RepositoryTreeItem(repo.name, repo, vscode.TreeItemCollapsibleState.None));
        }
        catch (error) {
            vscode.window.showErrorMessage(`无法获取仓库列表: ${error instanceof Error ? error.message : '未知错误'}`);
            return [];
        }
    }
}
exports.GiteaRepositoriesProvider = GiteaRepositoriesProvider;
/**
 * 命令中心树数据提供者
 * 为命令中心视图提供数据
 */
class GiteaCommandsProvider {
    constructor() {
        this._onDidChangeTreeData = new vscode.EventEmitter();
        this.onDidChangeTreeData = this._onDidChangeTreeData.event;
    }
    /**
     * 刷新视图
     */
    refresh() {
        this._onDidChangeTreeData.fire();
    }
    /**
     * 获取树节点
     * @param element 树节点
     */
    getTreeItem(element) {
        return element;
    }
    /**
     * 获取子节点
     * @param element 父节点
     */
    getChildren(element) {
        if (element instanceof CommandGroupTreeItem) {
            // 如果是分组节点，返回该分组的命令
            return element.commands;
        }
        // 顶层节点，返回分组
        // 仓库管理组
        const repoManagement = new CommandGroupTreeItem('仓库管理', [
            new CommandTreeItem('连接服务器', 'mygit.connect', 'plug', '配置Gitea服务器连接', 'charts.blue'),
            new CommandTreeItem('创建仓库', 'mygit.create', 'repo-create', '创建新的远程Gitea仓库', 'charts.green'),
            new CommandTreeItem('克隆仓库', 'mygit.clone', 'cloud-download', '克隆远程仓库到本地', 'charts.purple'),
            new CommandTreeItem('初始化仓库', 'mygit.initRepo', 'repo', '在当前目录初始化Git仓库', 'gitDecoration.addedResourceForeground'),
        ], 'repo', 'gitDecoration.modifiedResourceForeground');
        // Git操作组
        const gitOperations = new CommandGroupTreeItem('Git操作', [
            new CommandTreeItem('提交更改', 'mygit.commit', 'check', '提交本地更改', 'gitDecoration.addedResourceForeground'),
            new CommandTreeItem('推送更改', 'mygit.push', 'arrow-up', '推送本地更改到远程', 'charts.orange'),
            new CommandTreeItem('拉取更改', 'mygit.pull', 'arrow-down', '拉取远程更改', 'charts.blue'),
            new CommandTreeItem('仓库状态', 'mygit.showStatus', 'info', '查看仓库当前状态', 'charts.yellow'),
        ], 'git-commit', 'gitDecoration.addedResourceForeground');
        // 分支管理组
        const branchManagement = new CommandGroupTreeItem('分支管理', [
            new CommandTreeItem('列出分支', 'mygit.listBranches', 'git-branch', '查看所有分支', 'charts.purple'),
            new CommandTreeItem('创建分支', 'mygit.createBranch', 'add', '创建新分支', 'gitDecoration.addedResourceForeground'),
            new CommandTreeItem('切换分支', 'mygit.switchBranch', 'git-branch', '切换到其他分支', 'charts.green'),
        ], 'git-branch', 'gitDecoration.untrackedResourceForeground');
        // PR管理组
        const prManagement = new CommandGroupTreeItem('PR管理', [
            new CommandTreeItem('创建PR', 'mygit.createPR', 'git-pull-request', '创建新的Pull Request', 'charts.red'),
            new CommandTreeItem('列出PR', 'mygit.listPRs', 'list-unordered', '查看当前仓库所有PR', 'charts.purple'),
        ], 'git-pull-request', 'gitDecoration.conflictingResourceForeground');
        // 返回所有分组
        return [repoManagement, gitOperations, branchManagement, prManagement];
    }
}
exports.GiteaCommandsProvider = GiteaCommandsProvider;
//# sourceMappingURL=giteaExplorer.js.map