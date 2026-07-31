import { CustomConfig } from "./CustomConfig.js";
export declare function indexFolder(folderPath: string, pathToUrlResolver: (filePath: string) => string, config: CustomConfig, ignorePatterns?: RegExp[]): AsyncGenerator<import("./process.js").FileInfo, void, unknown>;
export declare function shouldIncludeFile({ filePath, ignorePatterns, includeGlob, excludeGlob, }: {
    filePath: string;
    ignorePatterns?: RegExp[];
    includeGlob?: string[];
    excludeGlob?: string[];
}): boolean;
