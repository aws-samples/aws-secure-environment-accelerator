import * as fs from 'fs';
import * as tempy from 'tempy';

export class TempDirectoryCache {
  private readonly cachePath: string;
  private readonly cache: { [webpackConfigPath: string]: string };

  constructor(cachePath: string) {
    this.cachePath = cachePath;
    this.cache = TempDirectoryCache.loadTempDirectoryCache(cachePath);
  }

  public createTempDirectory(key: string) {
    if (this.cache[key]) {
      return this.cache[key];
    }
    const tempDirectory = tempy.directory();
    this.cache[key] = tempDirectory;
    this.saveCache();
    return this.cache[key];
  }

  protected saveCache() {
    fs.writeFileSync(this.cachePath, JSON.stringify(this.cache));
  }

  private static loadTempDirectoryCache(cachePath: string) {
    if (fs.existsSync(cachePath)) {
      const contents = fs.readFileSync(cachePath);
      return JSON.parse(contents.toString());
    }
    return {};
  }
}
