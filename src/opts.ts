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

export const showLibs = (ls: Library[]): string =>
  ls.map(l => `${l.user}/${l.repo}#${l.version}`).join('-');

export interface Options {
  agda: Version;
  stdlib: Version;
  libraries: Library[];
  build: boolean;
  dir: string;
  main: string;
  cache: boolean;
  deploy: boolean;
  deployBranch: string;
  token: string;
  css: string;
  rts: string;
  ribbon: boolean;
  ribbonMsg: string;
  ribbonColor: string;
  measureTypechecking: boolean;
  // TODO: add {ghc: Version, cabal: Version}
}

function resolveLatestVersions(opts: Options): Options {
  const {agda, stdlib} = opts;
  return {
    ...opts,
    agda:
      agda === 'latest'
        ? supported_versions.agda[0]
        : (supported_versions.agda.find(v => v.startsWith(agda)) ?? agda),
    stdlib:
      stdlib == 'latest'
        ? supported_versions.stdlib[0]
        : (supported_versions.stdlib.find(v => v.startsWith(stdlib)) ?? stdlib)
  };
}

function get(opt: string): string {
  const yml = load(
    readFileSync(join(__dirname, '..', 'action.yml'), 'utf8')
  ).inputs;
  const o = core.getInput(opt, {required: yml[opt].required});
  return !o ? yml[opt].default : o;
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

export function getOpts(): Options {
  // Parse options
  const parseBoolean = (s: string): boolean => s == 'true';
  const opts0: Options = {
    agda: get('agda-version'),
    stdlib: get('stdlib-version'),
    libraries: parseLibs(get('libraries')),
    build: parseBoolean(get('build')),
    dir: get('dir'),
    main: get('main'),
    cache: parseBoolean(get('cache')),
    deploy: parseBoolean(get('deploy')),
    deployBranch: get('deploy-branch'),
    token: get('token'),
    css: get('css'),
    rts: get('rts'),
    ribbon: parseBoolean(get('ribbon')),
    ribbonMsg: get('ribbon-msg'),
    ribbonColor: get('ribbon-color'),
    measureTypechecking: parseBoolean(get('measure-typechecking'))
  };
  const opts = resolveLatestVersions(opts0);
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
