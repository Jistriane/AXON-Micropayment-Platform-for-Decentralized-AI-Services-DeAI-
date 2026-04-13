const isGitHubPagesBuild = process.env.GITHUB_PAGES === "true";
const normalizedBasePath = (process.env.BASE_PATH ?? "").replace(/^\/+|\/+$/g, "");
const basePath = isGitHubPagesBuild && normalizedBasePath ? `/${normalizedBasePath}` : undefined;

const nextConfig = {
  transpilePackages: ["@axon/shared"],
  experimental: {
    typedRoutes: true
  },
  ...(isGitHubPagesBuild
    ? {
        output: "export",
        images: { unoptimized: true },
        basePath,
        assetPrefix: basePath
      }
    : {})
};

export default nextConfig;
