import { File, Task } from "./schema.js";
import { WikiLink } from "./parseFile.js";
import { Root } from "remark-parse/lib/index.js";
import { CustomConfig } from "./CustomConfig.js";
export interface FileInfo extends File {
    referencedTags: string[];
    declaredTags: string[];
    links: WikiLink[];
    tasks: Task[];
}
export declare function processFile(rootFolder: string, filePath: string, pathToUrlResolver: (filePath: string) => string, filePathsToIndex: string[], computedFields: ((fileInfo: FileInfo, ast: Root) => any)[], config: CustomConfig): Promise<FileInfo[]>;
