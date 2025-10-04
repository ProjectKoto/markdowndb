import { Plugin } from "unified";
import { Root } from "remark-parse/lib";
import { MetaData, Task } from "./schema";
export declare function parseFile(metadata: {
    [key: string]: any;
}, sourceWithoutMatter: string, options?: ParsingOptions): {
    ast: import("mdast").Root;
    links: WikiLink[];
};
export declare function handleDeclaredTags(metadata: {
    [key: string]: any;
}): void;
export declare function processAST(source: string, options?: ParsingOptions): import("mdast").Root;
export interface ParsingOptions {
    from?: string;
    remarkPlugins?: Array<Plugin>;
    extractors?: LinkExtractors;
    permalinks?: string[];
}
export declare const extractTagsFromBody: (ast: Root) => string[];
export interface LinkExtractors {
    [test: string]: (node: any) => WikiLink;
}
export interface WikiLink {
    from: string;
    to: string;
    toRaw: string;
    text: string;
    embed: boolean;
    internal: boolean;
}
export declare const extractWikiLinks: (ast: Root, options?: ParsingOptions) => WikiLink[];
export declare const extractTasks: (ast: Root, metadata: {
    [key: string]: any;
}) => Task[];
export declare function extractAllTaskMetadata(description: string): MetaData;
