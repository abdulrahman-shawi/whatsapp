export function metaGraphUrl(path: string): string {
  const version = process.env.META_GRAPH_VERSION?.trim() || "v21.0";
  return `https://graph.facebook.com/${version}/${path.replace(/^\/+/, "")}`;
}
