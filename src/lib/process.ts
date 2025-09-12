import crypto from "crypto";
import fs from "fs";
import path from "path";
import matter from "gray-matter";
import replaceAll from 'string.prototype.replaceall';

import { File, Task } from "./schema.js";
import { WikiLink, parseFile } from "./parseFile.js";
import { Root } from "remark-parse/lib/index.js";
import { CustomConfig } from "./CustomConfig.js";

export interface FileInfo extends File {
  tags: string[];
  links: WikiLink[];
  tasks: Task[];
}

// this file is an extraction of the file info parsing from markdowndb.ts without any sql stuff
// TODO: add back (as an option) - providing a "root folder" path for resolve
export async function processFile(
  rootFolder: string,
  filePath: string,
  pathToUrlResolver: (filePath: string) => string,
  filePathsToIndex: string[],
  computedFields: ((fileInfo: FileInfo, ast: Root) => any)[],
  config: CustomConfig,
) {
  // Remove rootFolder from filePath
  const relativePath = path.relative(rootFolder, filePath);
  const relativePathForwardSlash: string = replaceAll(relativePath, '\\', '/');
  // removes path segments for archiving
  const assetRawPath = relativePathForwardSlash.split('/').filter(x => !(x.length >= 2 && x[0] === '[' && x[x.length - 1] === ']')).join('/');
  let [isDedicated, assetLocator, extension] = (await config.handleDedicated(assetRawPath));
  // const assetLocatorComponents = assetLocator.split('/');
  // const assetLocatorBasename = assetLocatorComponents[assetLocatorComponents.length - 1];
  // const assetLocatorParent = assetLocatorComponents.slice(0, assetLocatorComponents.length - 1).join('/') + '/';

  // gets key file info if any e.g. extension (file size??)
  const encodedPath = Buffer.from(relativePathForwardSlash, "utf-8").toString();
  const id = crypto.createHash("sha1").update(encodedPath).digest("hex");

  const fileInfo: FileInfo = {
    _id: id,
    // file_path: filePath,
    // asset_path: assetPath,
    // asset_url_path: pathToUrlResolver(relativePath),
    asset_raw_path: assetRawPath,
    asset_locator: assetLocator,
    asset_type: null,
    asset_store_tag: null,
    origin_file_path: relativePathForwardSlash,
    origin_file_extension: extension,
    metadata: {},
    tags: [],
    links: [],
    tasks: [],
  };
  const fileInfoList = [ fileInfo ];

  // if not a file type we can parse exit here ...
  // if (extension ! in list of supported extensions exit now ...)
  const relPathLower = relativePath.toLowerCase();

  // metadata, tags, links
  const stat = await fs.promises.stat(filePath, {
    bigint: false,
  })
  fileInfo.asset_size = stat.size;

  fileInfo.is_asset_heavy = isDedicated ? false : (stat.size > (32 * 1024));

  if (!fileInfo.is_asset_heavy) {
    const raw = await fs.promises.readFile(filePath, {
      flag: "r",
    });
    fileInfo.asset_raw_bytes = raw;

    let source: string | undefined = undefined;
    const getSourceFunc = () => {
      if (source === undefined) {
        source = raw.toString('utf-8');
      }
      return source;
    }

    // if (await config.isHasFrontMatter(relativePathForwardSlash)) {
    if (isDedicated) {
      const source = getSourceFunc();
      const { data: metadata, content: sourceWithoutMatter } = matter(source);
      fileInfo.asset_raw_bytes = Buffer.from(sourceWithoutMatter, "utf-8")

      // will remove later
      fileInfo._sourceWithoutMatter = sourceWithoutMatter;
      fileInfo.metadata = metadata;
      const assetType = metadata?.type || null;
      fileInfo.asset_type = assetType;
      fileInfo.publish_time_by_metadata = (metadata?.publishTime) ?? (metadata?.publish_time) ?? null;
      if (fileInfo.publish_time_by_metadata) {
        fileInfo.publish_time_by_metadata = new Date(fileInfo.publish_time_by_metadata).getTime()
      }
      if (metadata?.tkLocatorBase && typeof metadata?.tkLocatorBase === 'string') {
        // override
        const overrideParts = assetLocator.split('/')

        if (metadata?.tkLocatorBase.startsWith('-^') && metadata?.tkLocatorBase.length > 2) {
          const stripPrefix = metadata?.tkLocatorBase.substring(2)
          const originBase = overrideParts[overrideParts.length - 1]
          if (originBase.startsWith(stripPrefix)) {
            overrideParts[overrideParts.length - 1] = originBase.substring(stripPrefix.length)
          }
        } else {
          overrideParts[overrideParts.length - 1] = metadata?.tkLocatorBase
        }
        assetLocator = overrideParts.join('/')
        fileInfo.asset_locator = assetLocator
      }
      if (metadata?.tkLocator && typeof metadata?.tkLocator === 'string') {
        // override
        assetLocator = metadata?.tkLocator
        fileInfo.asset_locator = assetLocator
      }
      const tags = metadata?.tags || [];
      fileInfo.tags = tags;
      fileInfo.tasks = metadata?.tasks || [];

      const derivedChildFileInfoList = await config.deriveChildFileInfo(
        fileInfo,
        sourceWithoutMatter,
        metadata,
      );

      for (const derivedChildFileInfo of derivedChildFileInfoList) {
        fileInfoList.push(derivedChildFileInfo);
      }

      if (await config.isExtensionMarkdown(extension)) {
        for (const currFileInfo of [fileInfo, ...derivedChildFileInfoList]) {
          const { ast, links } = parseFile(currFileInfo.metadata || {}, currFileInfo._sourceWithoutMatter, {
            from: relativePath,
            permalinks: filePathsToIndex,
          });
          currFileInfo.links = links;
          for (let index = 0; index < computedFields.length; index++) {
            const customFieldFunction = computedFields[index];
            customFieldFunction(currFileInfo, ast);
          }
          if (config.markdownExtraHandler) {
            await config.markdownExtraHandler(relativePathForwardSlash, getSourceFunc, fileInfo, fileInfoList, { ast, metadata, links, tags });
          }
        }
      }
    }

    for (const handler of config.otherHandlers ?? []) {
      await handler(relativePathForwardSlash, getSourceFunc, fileInfo);
    }
  }

  fileInfoList.forEach(x => {
    delete x._sourceWithoutMatter;
  });

  return fileInfoList;
}
