import { FileInfo } from "./process.js";
import { Root } from "remark-parse/lib/index.js";
import { Node } from "unist-util-select/lib/types.js";
import { ZodObject } from "zod";
import { WikiLink } from "./parseFile.js";

type ComputedFields = ((fileInfo: FileInfo, ast: Root) => any)[];
type Schemas = { [index: string]: ZodObject<any> };

export interface CustomConfig {
  computedFields?: ComputedFields;
  schemas?: Schemas;
  include?: string[];
  exclude?: string[];
  handleDedicated: (assetRawPath: string) => Promise<[isDedicated: boolean, assetLocator: string, extension: string]>;
  deriveChildFileInfo: (fileInfo: FileInfo, sourceWithoutMatter: string, metadata: { [key: string]: any }) => Promise<FileInfo[]>;
  isExtensionMarkdown: (extension: string) => Promise<boolean>;
  markdownExtraHandler: ((relativePathForwardSlash: string, getSourceFunc: () => string, fileInfo: FileInfo, fileInfoList: FileInfo[], otherInfo: { ast: Node, metadata: { [key: string]: any }, links: WikiLink[], tags: any[] }) => Promise<void>) | undefined
  otherHandlers: ((relativePathForwardSlash: string, getSourceFunc: () => string, fileInfo: FileInfo) => Promise<void>)[] | undefined
}
