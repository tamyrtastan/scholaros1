declare module "s3rver" {
  interface Options { port?: number; address?: string; silent?: boolean; directory: string; configureBuckets?: { name: string; configs: unknown[] }[] }
  export default class S3rver {
    constructor(options: Options);
    run(): Promise<unknown>;
    close(): Promise<void>;
  }
}
