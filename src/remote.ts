export interface GitLabRemote {
  baseUrl: string;
  projectPath: string;
}

function cleanProjectPath(path: string): string {
  return path.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\.git$/, "");
}

export function parseGitLabRemote(remote: string): GitLabRemote {
  const value = remote.trim();

  const scpMatch = value.match(/^(?:[^@\s]+@)?([^:/\s]+):(.+)$/);
  if (scpMatch && !value.includes("://")) {
    return {
      baseUrl: `https://${scpMatch[1]}`,
      projectPath: cleanProjectPath(scpMatch[2]),
    };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`Unrecognized Git remote: ${value}`);
  }

  if (!["http:", "https:", "ssh:"].includes(url.protocol)) {
    throw new Error(`Unsupported Git protocol: ${url.protocol}`);
  }

  return {
    baseUrl:
      url.protocol === "http:" || url.protocol === "https:"
        ? `${url.protocol}//${url.host}`
        : `https://${url.hostname}`,
    projectPath: cleanProjectPath(decodeURIComponent(url.pathname)),
  };
}

export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}
