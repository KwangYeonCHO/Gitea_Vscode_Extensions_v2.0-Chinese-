declare module 'simple-git' {
    export interface LogResult {
        all: Array<{
            hash: string;
            date: string;
            message: string;
            refs: string;
            body: string;
            author_name: string;
            author_email: string;
        }>;
        total: number;
        latest: {
            hash: string;
            date: string;
            message: string;
            refs: string;
            body: string;
            author_name: string;
            author_email: string;
        };
    }

    export interface SimpleGit {
        log(options?: string[]): Promise<LogResult>;
        reset(options?: string[]): Promise<void>;
        checkout(options?: string[]): Promise<void>;
        branch(options?: string[]): Promise<void>;
        add(options?: string[]): Promise<void>;
        commit(message: string, options?: string[]): Promise<void>;
        push(options?: string[]): Promise<void>;
        pull(options?: string[]): Promise<void>;
        status(): Promise<{
            files: Array<{
                path: string;
                index: string;
                working_dir: string;
            }>;
        }>;
        init(): Promise<void>;
        clone(url: string, path: string): Promise<void>;
        checkIsRepo(): Promise<boolean>;
    }

    function simpleGit(baseDir?: string): SimpleGit;
    export default simpleGit;
} 