import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBaseUrl, parseGitLabRemote } from "../remote";

test("analyse un remote SSH au format SCP avec des sous-groupes", () => {
  assert.deepEqual(
    parseGitLabRemote("git@gitlab.com:farrago-studio/internal/farrago-site/farrago-site-app.git"),
    {
      baseUrl: "https://gitlab.com",
      projectPath: "farrago-studio/internal/farrago-site/farrago-site-app",
    },
  );
});

test("analyse un remote HTTPS", () => {
  assert.deepEqual(parseGitLabRemote("https://gitlab.example.com/group/project.git"), {
    baseUrl: "https://gitlab.example.com",
    projectPath: "group/project",
  });
});

test("analyse un remote ssh://", () => {
  assert.deepEqual(parseGitLabRemote("ssh://git@gitlab.example.com:2222/group/project.git"), {
    baseUrl: "https://gitlab.example.com",
    projectPath: "group/project",
  });
});

test("normalise l'URL GitLab", () => {
  assert.equal(normalizeBaseUrl(" https://gitlab.example.com/// "), "https://gitlab.example.com");
});
