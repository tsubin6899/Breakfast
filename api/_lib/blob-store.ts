import { get, put } from "@vercel/blob";

export type StoredJson<T> = { value: T; etag: string; url: string };

function isMissing(error: unknown) {
  const item = error as { status?: number; statusCode?: number; code?: string; name?: string };
  return item?.status === 404 || item?.statusCode === 404 || item?.code === "not_found" || item?.name === "BlobNotFoundError";
}

export async function readJson<T>(pathname: string): Promise<StoredJson<T> | null> {
  try {
    const result = await get(pathname, { access: "private", useCache: false });
    if (!result || !result.stream) return null;
    const text = await new Response(result.stream).text();
    return { value: JSON.parse(text) as T, etag: result.blob.etag || "", url: result.blob.url };
  } catch (error) {
    if (isMissing(error)) return null;
    throw error;
  }
}

export async function writeJson(pathname: string, value: unknown, options: {
  etag?: string;
  overwrite?: boolean;
} = {}) {
  return put(pathname, JSON.stringify(value), {
    access: "private",
    contentType: "application/json; charset=utf-8",
    addRandomSuffix: false,
    allowOverwrite: options.overwrite === true,
    ...(options.etag ? { ifMatch: options.etag } : {})
  });
}

export async function writeImmutableJson(pathname: string, value: unknown) {
  try {
    return await writeJson(pathname, value);
  } catch (error) {
    const item = error as { status?: number; statusCode?: number; code?: string; name?: string };
    if (item?.status === 409 || item?.statusCode === 409 || item?.name === "BlobAlreadyExistsError") return null;
    throw error;
  }
}
