import * as vscode from 'vscode';
import { GitExtension } from '../git/gitExtension';

/**
 * 显示Git提交历史日志
 * @param context VSCode扩展上下文
 */
export async function showGitLog(context: vscode.ExtensionContext) {
    try {
        const git = new GitExtension();
        const log = await git.getLog();
        
        // 创建输出面板
        const outputChannel = vscode.window.createOutputChannel('Git Log');
        outputChannel.show();
        
        // 格式化并显示日志
        log.forEach(commit => {
            outputChannel.appendLine(`提交: ${commit.hash}`);
            outputChannel.appendLine(`作者: ${commit.author}`);
            outputChannel.appendLine(`日期: ${commit.date}`);
            outputChannel.appendLine(`信息: ${commit.message}`);
            outputChannel.appendLine('----------------------------------------');
        });
    } catch (error) {
        vscode.window.showErrorMessage(`获取Git日志失败: ${error instanceof Error ? error.message : String(error)}`);
    }
}

/**
 * 重置Git更改（支持选择历史commit）
 * @param context VSCode扩展上下文
 * @version 0.1.27
 * 更新内容：支持选择历史commit进行reset
 */
export async function resetGitChanges(context: vscode.ExtensionContext) {
    try {
        const git = new GitExtension();
        // 1. 获取最近20条提交历史
        const log = await git.getLog();
        if (!log || log.length === 0) {
            vscode.window.showWarningMessage('未找到任何提交历史，无法重置！');
            return;
        }
        // 2. 让用户选择要重置到的commit
        const pickItems = log.slice(0, 20).map(commit => ({
            label: `${commit.hash.substring(0, 7)} ${commit.message}`,
            description: `${commit.author} ${commit.date}`,
            commitHash: commit.hash
        }));
        const selected = await vscode.window.showQuickPick(pickItems, {
            placeHolder: '请选择要重置到的历史提交（commit）'
        });
        if (!selected) {
            return;
        }
        // 3. 选择重置类型
        const resetType = await vscode.window.showQuickPick([
            { label: '软重置 (保留更改)', description: '--soft' },
            { label: '混合重置 (保留工作区)', description: '--mixed' },
            { label: '硬重置 (丢弃所有更改)', description: '--hard' }
        ], {
            placeHolder: '选择重置类型'
        });
        if (!resetType) {
            return;
        }
        // 4. 最终确认
        const confirm = await vscode.window.showWarningMessage(
            `确定要将仓库重置到 ${selected.label} (${resetType.label}) 吗？此操作不可撤销。`,
            { modal: true },
            '确定',
            '取消'
        );
        if (confirm !== '确定') {
            return;
        }
        // 5. 执行reset
        await git.resetToCommit(selected.commitHash, resetType.description);
        vscode.window.showInformationMessage(`已成功重置到 ${selected.label}`);
    } catch (error) {
        vscode.window.showErrorMessage(`重置失败: ${error instanceof Error ? error.message : String(error)}`);
    }
} 