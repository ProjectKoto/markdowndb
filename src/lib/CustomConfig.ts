import { FileInfo } from "./process.js";
import { Root } from "remark-parse/lib/index.js";
import { ZodObject } from "zod";

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
}
