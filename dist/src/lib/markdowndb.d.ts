import { Knex } from "knex";
import { MddbFile, MddbTag, MddbLink } from "./schema.js";
import { CustomConfig } from "./CustomConfig.js";
import { FileInfo } from "./process.js";
/**
 * MarkdownDB class for managing a Markdown database.
 */
export declare class MarkdownDB {
    config: Knex.Config;
    db: Knex;
    pendingUpdate: {
        [key: string]: FileInfo;
    };
    /**
     * Constructs a new MarkdownDB instance.
     * @param {Knex.Config} config - Knex configuration object.
     */
    constructor(config: Knex.Config);
    /**
     * Initializes the MarkdownDB instance and database connection.
     * @returns {Promise<MarkdownDB>} - A promise resolving to the initialized MarkdownDB instance.
     */
    init(): Promise<this>;
    /**
     * Indexes the files in a specified folder and updates the database accordingly.
     * @param {Object} options - Options for indexing the folder.
     * @param {string} options.folderPath - The path of the folder to be indexed.
     * @param {RegExp[]} [options.ignorePatterns=[]] - Array of RegExp patterns to ignore during indexing.
     * @param {(filePath: string) => string} [options.pathToUrlResolver=defaultFilePathToUrl] - Function to resolve file paths to URLs.
     * @returns {Promise<void>} - A promise resolving when the indexing is complete.
     */
    indexFolder({ folderPath, ignorePatterns, pathToUrlResolver, customConfig, watch, configFilePath, }: {
        folderPath: string;
        ignorePatterns?: RegExp[];
        pathToUrlResolver?: (filePath: string) => string;
        customConfig?: CustomConfig;
        watch?: boolean;
        configFilePath?: string;
    }): Promise<void>;
    private saveDataToDisk;
    saveDataToDiskIncr(operateTimestamp: number): Promise<void>;
    /**
     * Retrieves a file from the database by its ID.
     * @param {string} id - The ID of the file to retrieve.
     * @returns {Promise<MddbFile | null>} - A promise resolving to the retrieved file or null if not found.
     */
    getFileById(id: string): Promise<MddbFile | null>;
    /**
     * Retrieves a file from the database by its URL.
     * @param {string} url - The URL of the file to retrieve.
     * @returns {Promise<MddbFile | null>} - A promise resolving to the retrieved file or null if not found.
     */
    getFileByUrl(url: string): Promise<MddbFile | null>;
    /**
     * Retrieves files from the database based on the specified query parameters.
     * @param {Object} [query] - Query parameters for filtering files.
     * @param {string} [query.folder] - The folder to filter files by.
     * @param {string[]} [query.filetypes] - Array of file types to filter by.
     * @param {string[]} [query.tags] - Array of tags to filter by.
     * @param {string[]} [query.extensions] - Array of file extensions to filter by.
     * @param {Record<string, string | number | boolean>} [query.frontmatter] - Object representing frontmatter key-value pairs for filtering.
     * @returns {Promise<MddbFile[]>} - A promise resolving to an array of retrieved files.
     */
    getFiles(query?: {
        folder?: string;
        filetypes?: string[];
        tags?: string[];
        extensions?: string[];
        frontmatter?: Record<string, string | number | boolean>;
    }): Promise<MddbFile[]>;
    /**
     * Retrieves all tags from the database.
     * @returns {Promise<MddbTag[]>} - A promise resolving to an array of retrieved tags.
     */
    getTags(): Promise<MddbTag[]>;
    /**
     * Retrieves links associated with a file based on the specified query parameters.
     * @param {Object} [query] - Query parameters for filtering links.
     * @param {string} query.fileId - The ID of the file to retrieve links for.
     * @param {"normal" | "embed"} [query.linkType] - Type of link to filter by (normal or embed).
     * @param {"forward" | "backward"} [query.direction="forward"] - Direction of the link (forward or backward).
     * @returns {Promise<MddbLink[]>} - A promise resolving to an array of retrieved links.
     */
    getLinks(query?: {
        fileId: string;
        linkType?: "normal" | "embed";
        direction?: "forward" | "backward";
    }): Promise<MddbLink[]>;
    /**
     * Destroys the database connection.
     */
    _destroyDb(): void;
}
