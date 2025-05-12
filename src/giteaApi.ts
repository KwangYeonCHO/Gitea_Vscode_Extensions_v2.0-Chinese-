import * as vscode from 'vscode';
import axios from 'axios';

/**
 * Gitea API 接口类
 * 处理与Gitea服务器的所有API通信
 */
export class GiteaAPI {
    private serverUrl: string;
    private token: string;

    constructor(serverUrl: string, token: string) {
        this.serverUrl = serverUrl;
        this.token = token;
    }

    // 获取用户仓库列表
    async getUserRepos(): Promise<any[]> {
        try {
            if (!this.serverUrl) {
                throw new Error('服务器地址未配置');
            }
            if (!this.token) {
                throw new Error('访问令牌未配置');
            }

            // 确保服务器地址以 / 结尾
            const serverUrl = this.serverUrl.endsWith('/') ? this.serverUrl : `${this.serverUrl}/`;
            
            const response = await axios.get(`${serverUrl}api/v1/user/repos`, {
                headers: {
                    'Authorization': `token ${this.token}`
                },
                validateStatus: function (status) {
                    return status >= 200 && status < 300;
                }
            });

            if (!response.data || !Array.isArray(response.data)) {
                throw new Error('返回数据格式不正确');
            }

            return response.data;
        } catch (error: unknown) {
            if (axios.isAxiosError(error)) {
                if (error.response) {
                    // 服务器返回了错误状态码
                    throw new Error(`获取仓库列表失败: ${error.response.status} ${error.response.statusText}`);
                } else if (error.request) {
                    // 请求已发出但没有收到响应
                    throw new Error('无法连接到服务器，请检查服务器地址是否正确');
                } else {
                    // 请求配置出错
                    throw new Error(`请求配置错误: ${error.message}`);
                }
            }
            if (error instanceof Error) {
                throw new Error(`获取仓库列表失败: ${error.message}`);
            }
            throw new Error('获取仓库列表失败: 未知错误');
        }
    }

    // 创建新仓库
    async createRepo(name: string, description: string, isPrivate: boolean = false): Promise<any> {
        try {
            // 确保服务器地址以 / 结尾
            const serverUrl = this.serverUrl.endsWith('/') ? this.serverUrl : `${this.serverUrl}/`;
            
            const response = await axios.post(`${serverUrl}api/v1/user/repos`, {
                name,
                description,
                private: isPrivate
            }, {
                headers: {
                    'Authorization': `token ${this.token}`
                }
            });
            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.response) {
                    const data = error.response.data;
                    // 尝试提取更具体的错误信息
                    const message = data && typeof data === 'object' && 'message' in data 
                        ? data.message 
                        : JSON.stringify(data);
                    
                    // 检查是否是权限问题
                    if (error.response.status === 403 && message.includes('scope')) {
                        throw new Error(`创建仓库失败: ${error.response.status} ${error.response.statusText} - ${message}\n请确保您的访问令牌具有write:user权限`);
                    }
                    
                    throw new Error(`创建仓库失败: ${error.response.status} ${error.response.statusText} - ${message}`);
                } else if (error.request) {
                    throw new Error('无法连接到服务器，请检查服务器地址是否正确');
                } else {
                    throw new Error(`请求配置错误: ${error.message}`);
                }
            }
            throw new Error(`创建仓库失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    // 获取仓库的 Pull Requests
    async getPullRequests(owner: string, repo: string): Promise<any[]> {
        try {
            const response = await axios.get(`${this.serverUrl}/api/v1/repos/${owner}/${repo}/pulls`, {
                headers: {
                    'Authorization': `token ${this.token}`
                }
            });
            return response.data;
        } catch (error) {
            throw new Error('获取 Pull Requests 失败');
        }
    }

    // 创建 Pull Request
    async createPullRequest(owner: string, repo: string, title: string, body: string, head: string, base: string): Promise<any> {
        try {
            const response = await axios.post(`${this.serverUrl}/api/v1/repos/${owner}/${repo}/pulls`, {
                title,
                body,
                head,
                base
            }, {
                headers: {
                    'Authorization': `token ${this.token}`
                }
            });
            return response.data;
        } catch (error) {
            throw new Error('创建 Pull Request 失败');
        }
    }

    // 检查仓库是否存在
    async repoExists(name: string): Promise<boolean> {
        try {
            // 确保服务器地址以 / 结尾
            const serverUrl = this.serverUrl.endsWith('/') ? this.serverUrl : `${this.serverUrl}/`;
            
            // 先获取用户信息以获取用户名
            const userResponse = await axios.get(`${serverUrl}api/v1/user`, {
                headers: {
                    'Authorization': `token ${this.token}`
                }
            });
            
            const username = userResponse.data.username;
            
            // 尝试获取仓库信息，如果成功则表示仓库存在
            const response = await axios.get(`${serverUrl}api/v1/repos/${username}/${name}`, {
                headers: {
                    'Authorization': `token ${this.token}`
                },
                validateStatus: function (status) {
                    // 仓库存在返回200，不存在返回404，所有状态码都视为有效响应
                    return true;
                }
            });
            
            // 如果状态码是200，表示仓库存在
            return response.status === 200;
        } catch (error) {
            // 如果是网络错误或其他异常，视为查询失败，抛出错误
            if (axios.isAxiosError(error)) {
                if (error.response) {
                    // 如果返回404，说明仓库不存在，但这不是错误
                    if (error.response.status === 404) {
                        return false;
                    }
                    throw new Error(`检查仓库是否存在失败: ${error.response.status} ${error.response.statusText}`);
                } else if (error.request) {
                    throw new Error('无法连接到服务器，请检查服务器地址是否正确');
                } else {
                    throw new Error(`请求配置错误: ${error.message}`);
                }
            }
            throw new Error(`检查仓库是否存在失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }

    // 删除仓库
    async deleteRepo(owner: string, repo: string): Promise<void> {
        try {
            // 确保服务器地址以 / 结尾
            const serverUrl = this.serverUrl.endsWith('/') ? this.serverUrl : `${this.serverUrl}/`;
            
            const response = await axios.delete(`${serverUrl}api/v1/repos/${owner}/${repo}`, {
                headers: {
                    'Authorization': `token ${this.token}`
                }
            });

            if (response.status !== 204) {
                throw new Error(`删除仓库失败: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.response) {
                    const data = error.response.data;
                    const message = data && typeof data === 'object' && 'message' in data 
                        ? data.message 
                        : JSON.stringify(data);
                    
                    throw new Error(`删除仓库失败: ${error.response.status} ${error.response.statusText} - ${message}`);
                } else if (error.request) {
                    throw new Error('无法连接到服务器，请检查服务器地址是否正确');
                } else {
                    throw new Error(`请求配置错误: ${error.message}`);
                }
            }
            throw new Error(`删除仓库失败: ${error instanceof Error ? error.message : '未知错误'}`);
        }
    }
} 