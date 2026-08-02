import path from "path";
import process from "process";
import knex, { Knex } from "knex";

import { MddbFile, MddbTag, MddbLink, MddbFileTag, MddbTask, Table, File } from "./schema.js";
import { indexFolder, shouldIncludeFile } from "./indexFolder.js";
import {
  resetDatabaseTables,
  mapFileToInsert,
  mapFileTagsToInsert,
  getUniqueValues,
  getUniqueProperties,
  asyncGenIntoBatches,
} from "./databaseUtils.js";
import fs from "fs";
import { CustomConfig } from "./CustomConfig.js";
import { FileInfo, processFile } from "./process.js";
import chokidar from "chokidar";
import { recursiveWalkDir } from "./recursiveWalkDir.js";
import { loadConfig } from "./loadConfig.js";
import debounce from 'debounce';
import replaceAll from 'string.prototype.replaceall';

const defaultFilePathToUrl = (filePath: string) => {
  let url = filePath
    .replace(/\.(mdx|md)/, "")
    .replace(/\\/g, "/") // replace windows backslash with forward slash
    .replace(/(\/)?index$/, ""); // remove index from the end of the permalink
  url = url.length > 0 ? url : "/"; // for home page
  return encodeURI(url);
};

const resolveLinkToUrlPath = (link: string, sourceFilePath?: string) => {
  if (!sourceFilePath) {
    return link;
  }
  // needed to make path.resolve work correctly
  // becuase we store urls without leading slash
  const sourcePath = "/" + sourceFilePath;
  const dir = path.dirname(sourcePath);
  const resolved = path.resolve(dir, link);
  // remove leading slash
  return resolved.slice(1);
};

/**
 * MarkdownDB class for managing a Markdown database.
 */
export class MarkdownDB {
  config: Knex.Config;
  db: Knex;
  pendingUpdate: {[key: string]: File};

  /**
   * Constructs a new MarkdownDB instance.
   * @param {Knex.Config} config - Knex configuration object.
   */
  constructor(config: Knex.Config) {
    this.config = config;
  }

  /**
   * Initializes the MarkdownDB instance and database connection.
   * @returns {Promise<MarkdownDB>} - A promise resolving to the initialized MarkdownDB instance.
   */
  async init() {
    this.db = knex({ ...this.config, useNullAsDefault: true });
    this.pendingUpdate = {};
    return this;
  }

  /**
   * Indexes the files in a specified folder and updates the database accordingly.
   * @param {Object} options - Options for indexing the folder.
   * @param {string} options.folderPath - The path of the folder to be indexed.
   * @param {RegExp[]} [options.ignorePatterns=[]] - Array of RegExp patterns to ignore during indexing.
   * @param {(filePath: string) => string} [options.pathToUrlResolver=defaultFilePathToUrl] - Function to resolve file paths to URLs.
   * @returns {Promise<void>} - A promise resolving when the indexing is complete.
   */
  async indexFolder({
    folderPath,
    // TODO support glob patterns
    ignorePatterns = [],
    pathToUrlResolver = defaultFilePathToUrl,
    customConfig,
    watch = false,
    configFilePath,
  }: {
    folderPath: string;
    ignorePatterns?: RegExp[];
    pathToUrlResolver?: (filePath: string) => string;
    customConfig?: CustomConfig;
    watch?: boolean;
    configFilePath?: string;
  }) {
    const config = customConfig || (await loadConfig(configFilePath)) as CustomConfig || {};
    const firstIndexTimestamp = Date.now();
    const fileObjectsAsyncGenerator = indexFolder(
      folderPath,
      pathToUrlResolver,
      config,
      ignorePatterns
    );
    const fileObjectsInBatchAsyncGenerator = asyncGenIntoBatches(
      customConfig?.fileInfoBatchSize ?? 50,
      fileObjectsAsyncGenerator,
    );
    await this.resetDataOnDiskForFullWrite();
    for await (const fileObjectsBatch of fileObjectsInBatchAsyncGenerator) {
      await this.saveDataToDisk(fileObjectsBatch, firstIndexTimestamp);
    }
    if (config !== undefined) {
      if (config.onInitialIndexingEnd !== undefined) {
        await config.onInitialIndexingEnd();
      }
    }

    if (watch) {
      const watcher = chokidar.watch(folderPath, {
        ignoreInitial: true,
        awaitWriteFinish: true,
        atomic: true,
      });

      // const filePathsToIndex = xxx async gen recursiveWalkDir(folderPath);
      const computedFields = config.computedFields || [];
      const incrIndexFuncToDebounce = async () => {
        await this.saveDataToDiskIncr(firstIndexTimestamp);
        if (config !== undefined) {
          if (config.onIncrementalIndexingEnd !== undefined) {
            await config.onIncrementalIndexingEnd();
          }
        }
      };
      const incrIndexFuncDebounced = debounce(incrIndexFuncToDebounce, 1000);

      let fileEventHandler = undefined as ((event: string, filePath: string) => Promise<void>) | undefined;
      let fileEventHandlerNoRetry = undefined as ((event: string, filePath: string) => Promise<void>) | undefined;

      const fileEventHandlerBuilder = (shouldScheduleRetryOnErr: boolean) => async (event: string, filePath: string) => {
        try {
          const eventTimestamp = Date.now();
          if (
            !shouldIncludeFile({
              filePath,
              ignorePatterns,
              includeGlob: config.include,
              excludeGlob: config.exclude,
            })
          ) {
            return;
          }

          const relativePath = path.relative(folderPath, filePath);
          const relativePathForwardSlash = replaceAll(relativePath, '\\', '/');

          if (event === "unlink") {
            const filesToDel = (await this.db(Table.Files)
              .where((builder) => {
                builder.where('origin_file_path', relativePathForwardSlash);
              })
              .select('files.*')
              .groupBy('_id')
            ).map(f => new MddbFile(f));
            for (const f of filesToDel) {
              f.is_deleted_by_hoard = true;
              this.pendingUpdate[f.asset_raw_path] = f;
              // deleted (parent + children) files should have "now" timestamp, not their own modified time
              f.update_time_by_hoard = eventTimestamp;
            }

            console.log(`File ${filePath} has been removed`);
            incrIndexFuncDebounced();
            return;
          }

          const newParsedFileObjsOfCurrOrig: FileInfo[] = [];
          for await (const f of
            processFile(
              folderPath,
              filePath,
              pathToUrlResolver,
              computedFields,
              config,
            )
          ) {
            newParsedFileObjsOfCurrOrig.push(f);
          }

          const latestFilesOfCurrOrigMap = {} as Record<string, (MddbFile | FileInfo)[] | undefined>;

          {
            const existingFilesOfSameOriginFile = (await this.db(Table.Files)
                .where((builder) => {
                  // only handle current origin file's parsed file and its children
                  builder.where('origin_file_path', relativePathForwardSlash);
                })
                .select('files.*')
                .groupBy('_id')
              ).map(f => new MddbFile(f));

            existingFilesOfSameOriginFile.forEach(f => {
              // will remove is_deleted_by_hoard flag later,
              // if it should be prevserved
              f.is_deleted_by_hoard = true;
            });

            
            existingFilesOfSameOriginFile.forEach(f => {
              // most of time it is 1:1, just in case, build it as a list
              let fList = latestFilesOfCurrOrigMap[f.asset_raw_path];
              if (fList === undefined) {
                fList = [];
                latestFilesOfCurrOrigMap[f.asset_raw_path] = fList;
              }
              fList.push(f);
            });

            // after latestFilesOfCurrOrigMap is built, existingFilesOfSameOriginFile should be disposed.
            // latestFilesOfCurrOrigMap should be treated as
            // the container of the latest files.
          }

          for (const newParsedFileObj of newParsedFileObjsOfCurrOrig) {
            const existingFileMatchingAssetRawPathList = latestFilesOfCurrOrigMap[newParsedFileObj.asset_raw_path];
            
            if (existingFileMatchingAssetRawPathList) {
              for (let i = 0; i < existingFileMatchingAssetRawPathList.length; i++) {
                let ef = existingFileMatchingAssetRawPathList[i];
                // so that is_deleted_by_hoard is removed after replace
                ef = newParsedFileObj;
                existingFileMatchingAssetRawPathList[i] = ef;
                newParsedFileObj.isAlreadyExist = true;
              }
            }
          }

          Object.entries(latestFilesOfCurrOrigMap).forEach(([assetRawPath, latestFileList]) => {
            if (!latestFileList) {
              return;
            }
            latestFileList.forEach(lf => {
              if (lf.is_deleted_by_hoard) {
                // deleted part of (parent + children) files should have "now" timestamp, not their own modified time
                lf.update_time_by_hoard = eventTimestamp;
              }

              // this correctly handles both delete & update
              this.pendingUpdate[lf.asset_raw_path] = lf;
            });
          });

         
            
          for (const newParsedFileObj of newParsedFileObjsOfCurrOrig) {
            if (newParsedFileObj.isAlreadyExist) {
              // 
            } else {
              this.pendingUpdate[newParsedFileObj.asset_raw_path] = newParsedFileObj;

              // new / moved files should have "now" timestamp, not their own modified time
              newParsedFileObj.update_time_by_hoard = eventTimestamp;
            }
            delete newParsedFileObj.isAlreadyExist;
          }

          console.log(
            `File ${filePath} has been ${event === "add" ? "added" : "updated"}`
          );
          incrIndexFuncDebounced();
        } catch (e) {
          console.error(`mddb handleFileEvent error, shouldScheduleRetryOnErr=${shouldScheduleRetryOnErr}`, e);
          if (shouldScheduleRetryOnErr) {
            setTimeout(async () => {
              fileEventHandlerNoRetry!(event, filePath);
            }, 1600)
          }
        }
      };

      fileEventHandler = fileEventHandlerBuilder(true);
      fileEventHandlerNoRetry = fileEventHandlerBuilder(false);

      watcher
        .on("add", (filePath) => fileEventHandler!("add", filePath))
        .on("change", (filePath) => fileEventHandler!("change", filePath))
        .on("unlink", (filePath) => fileEventHandler!("unlink", filePath))
        // .on("all", () => this.saveDataToDisk(fileObjects))
        .on("error", (error) => console.error(`Watcher error: ${error}`));
    }
  }

  private async resetDataOnDiskForFullWrite() {
    await resetDatabaseTables(this.db);
    // const properties = getUniqueProperties(fileObjects);
    MddbFile.deleteTable(this.db);
    await MddbFile.createTable(this.db, []);
  }

  private async saveDataToDisk(fileObjects: (FileInfo | File)[], operateTimestamp: number) {
    const filesToDelThenInsert = fileObjects.map(f => mapFileToInsert(f, operateTimestamp));
    const uniqueTags = getUniqueValues(
      fileObjects.flatMap((file) => {
        if (file.referencedTags && file.declaredTags) {
          return [...file.referencedTags, ...file.declaredTags];
        } else {
          return [];
        }
      })
    );
    const tagsToDelThenInsert = uniqueTags.map((tag) => ({ name: tag }));
    // const linksToDelThenInsert = fileObjects
    //   .flatMap((fileObject) => {
    //     return mapLinksToInsert(filesToInsert, fileObject);
    //   })
    //   .filter(isLinkToDefined);
    const fileTagsToDelThenInsert = fileObjects.flatMap(mapFileTagsToInsert);

    // const tasksToDelThenInsert = fileObjects.flatMap(mapTasksToInsert);

    // 20260802: tk: 
    // writeJsonToFile((process.env.PROCENV_HOARD_MARKDOWNDB_FILES_JSON_PATH || ".markdowndb/files.json"), fileObjects);
    await MddbFile.batchDelIfExistThenInsert(this.db, filesToDelThenInsert);
    await MddbTag.batchDelIfExistThenInsert(this.db, tagsToDelThenInsert);
    await MddbFileTag.batchDelIfExistThenInsert(this.db, fileTagsToDelThenInsert);
    // await MddbLink.batchInsert(this.db, getUniqueValues(linksToInsert));
    // await MddbTask.batchInsert(this.db, tasksToInsert);
  }
  async saveDataToDiskIncr(operateTimestamp: number) {
    const currPendingUpdate = this.pendingUpdate
    this.pendingUpdate = {}
    await this.saveDataToDisk(Object.values(currPendingUpdate), operateTimestamp);
  }

  /**
   * Retrieves a file from the database by its ID.
   * @param {string} id - The ID of the file to retrieve.
   * @returns {Promise<MddbFile | null>} - A promise resolving to the retrieved file or null if not found.
   */
  async getFileById(id: string): Promise<MddbFile | null> {
    const file = await this.db.from("files").where("_id", id).first();
    return new MddbFile(file);
  }

  /**
   * Retrieves a file from the database by its URL.
   * @param {string} url - The URL of the file to retrieve.
   * @returns {Promise<MddbFile | null>} - A promise resolving to the retrieved file or null if not found.
   */
  async getFileByUrl(url: string): Promise<MddbFile | null> {
    const file = await this.db
      .from("files")
      .where("url_path", encodeURI(url))
      .first();
    return new MddbFile(file);
  }

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
  async getFiles(query?: {
    folder?: string;
    filetypes?: string[];
    tags?: string[];
    extensions?: string[];
    frontmatter?: Record<string, string | number | boolean>;
  }): Promise<MddbFile[]> {
    const { filetypes, tags, extensions, folder, frontmatter } = query || {};

    const files = await this.db
      // TODO join only if tags are specified ?
      .leftJoin("file_tags", "files._id", "file_tags.file")
      .where((builder) => {
        // TODO temporary solution before we have a proper way to filter files by and assign file types
        if (folder) {
          builder.whereLike("url_path", `${folder}/%`);
        }
        if (tags) {
          builder.whereIn("tag", tags);
        }

        if (extensions) {
          builder.whereIn("extension", extensions);
        }

        if (filetypes) {
          builder.whereIn("filetype", filetypes);
        }

        if (frontmatter) {
          Object.entries(frontmatter).forEach(([key, value]) => {
            if (typeof value === "string" || typeof value === "number") {
              builder.whereRaw(`json_extract(metadata, '$.${key}') = ?`, [
                value,
              ]);
            } else if (typeof value === "boolean") {
              if (value) {
                builder.whereRaw(`json_extract(metadata, '$.${key}') = ?`, [
                  true,
                ]);
              } else {
                builder.where(function () {
                  this.whereRaw(`json_extract(metadata, '$.${key}') = ?`, [
                    false,
                  ]).orWhereRaw(`json_extract(metadata, '$.${key}') IS NULL`);
                });
              }
            }
            // To check if the provided value exists in an array inside the JSON
            else {
              builder.whereRaw(`json_extract(metadata, '$.${key}') LIKE ?`, [
                `%${value}%`,
              ]);
            }
          });
        }
      })
      .select("files.*")
      .from("files")
      .groupBy("_id");

    return files.map((file) => new MddbFile(file));
  }

  /**
   * Retrieves all tags from the database.
   * @returns {Promise<MddbTag[]>} - A promise resolving to an array of retrieved tags.
   */
  async getTags(): Promise<MddbTag[]> {
    const tags = await this.db("tags").select();
    return tags.map((tag) => new MddbTag(tag));
  }

  /**
   * Retrieves links associated with a file based on the specified query parameters.
   * @param {Object} [query] - Query parameters for filtering links.
   * @param {string} query.fileId - The ID of the file to retrieve links for.
   * @param {"normal" | "embed"} [query.linkType] - Type of link to filter by (normal or embed).
   * @param {"forward" | "backward"} [query.direction="forward"] - Direction of the link (forward or backward).
   * @returns {Promise<MddbLink[]>} - A promise resolving to an array of retrieved links.
   */
  async getLinks(query?: {
    fileId: string;
    linkType?: "normal" | "embed";
    direction?: "forward" | "backward";
  }): Promise<MddbLink[]> {
    const { fileId, direction = "forward", linkType } = query || {};
    const joinKey = direction === "forward" ? "from" : "to";
    const where = {
      [joinKey]: fileId,
    };
    if (linkType) {
      where["link_type"] = linkType;
    }
    const dbLinks = await this.db
      .select("links.*")
      .from("links")
      .rightJoin("files", `links.${joinKey}`, "=", "files._id")
      .where(where);

    const links = dbLinks.map((link) => new MddbLink(link));
    return links;
  }

  /**
   * Destroys the database connection.
   */
  _destroyDb() {
    this.db.destroy();
  }
}

function writeJsonToFile(filePath: string, jsonData: any[]) {
  try {
    const directory = path.dirname(filePath);
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    const jsonString = JSON.stringify(jsonData, null, 2);
    fs.writeFileSync(filePath, jsonString);
  } catch (error: any) {
    console.error(`Error writing data to ${filePath}: ${error}`);
  }
}
