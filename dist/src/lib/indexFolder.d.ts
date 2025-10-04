import { CustomConfig } from "./CustomConfig.js";
import { FileInfo } from "./process.js";
export declare function indexFolder(folderPath: string, pathToUrlResolver: (filePath: string) => string, config: CustomConfig, ignorePatterns?: RegExp[]): Promise<FileInfo[]>;
export declare function shouldIncludeFile({ filePath, ignorePatterns, includeGlob, excludeGlob, }: {
    filePath: string;
    ignorePatterns?: RegExp[];
    includeGlob?: string[];
    excludeGlob?: string[];
}): boolean;
