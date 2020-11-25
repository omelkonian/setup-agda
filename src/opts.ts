import * as core from '@actions/core';
import {readFileSync} from 'fs';
import {load} from 'js-yaml';
import {join} from 'path';
import * as supported_versions from './versions.json';

export type Version = string;
export type GitUser = string;
export type GitRepo = string;

export interface Library {
  user: string;
  repo: string;
  version: string;
}

export const showLibs = (l: Library[]): string =>
  l.map(l => `${l.user}/${l.repo}#${l.version}`).join('-');

export interface Options {
  agda: Version;
  stdlib: Version;
  libraries: Library[];
  build: boolean;
  main: string;
  deploy: boolean;
  deployBranch: string;
  token: string;
  css: string;
  // TODO: add {ghc: Version, cabal: Version}
}

function mkOpts(opts: Options): Options {
  const {agda, stdlib, deploy, token} = opts;
  return {
    ...opts,
    agda:
      agda === 'latest'
        ? supported_versions.agda[0]
        : supported_versions.agda.find(v => v.startsWith(agda)) ?? agda,
    stdlib:
      stdlib == 'latest'
        ? supported_versions.stdlib[0]
        : supported_versions.stdlib.find(v => v.startsWith(stdlib)) ?? stdlib,
    deploy: token ? true : deploy
  };
}

export function getDefaults(): Options {
  const yml = load(readFileSync(join(__dirname, '..', 'action.yml'), 'utf8'))
    .inputs;
  return mkOpts({
    agda: yml['agda-version'].default,
    stdlib: yml['stdlib-version'].default,
    libraries: parseLibs(yml['libraries'].default),
    build: yml['build'].default,
    main: yml['main'].default,
    deploy: yml['deploy'].default,
    deployBranch: yml['deployBranch'].default,
    token: yml['token'].default,
    css: yml['css'].default
  });
}

function parseLibs(libs: string): Library[] {
  const parseRepo = (l: string): Library => {
    const [usr, rep] = l.split('/');
    const [rep2, ver] = rep.split('#');
    return {
      user: usr,
      repo: rep2,
      version: ver ? ver : 'master'
    };
  };
  const ls = libs.split('\n');
  return ls[0] ? ls.map(parseRepo) : [];
}

const parseBoolean = (s: string): boolean => s == 'true';

export function getOpts(): Options {
  // Parse options
  const def: Options = getDefaults();
  core.debug(`Default options are: ${JSON.stringify(def)}`);
  const opts0: Options = {
    agda: core.getInput('agda-version') || def.agda,
    stdlib: core.getInput('stdlib-version') || def.stdlib,
    libraries: parseLibs(core.getInput('libraries')) || def.libraries,
    build: parseBoolean(core.getInput('build')) || def.build,
    main: core.getInput('main') || def.main,
    deploy: parseBoolean(core.getInput('deploy')) || def.deploy,
    deployBranch: core.getInput('deployBranch') || def.deployBranch,
    token: core.getInput('token'),
    css: core.getInput('css') || def.css
  };
  const opts = mkOpts(opts0);
  core.debug(
    `Options are: ${JSON.stringify(opts0)} ~> ${JSON.stringify(opts)}`
  );

  // Check that options are consistent
  if (opts.deploy && !opts.token)
    throw new Error(
      'The secret token needs to be supplied when `deploy: true.`'
    );

  return opts;
}
