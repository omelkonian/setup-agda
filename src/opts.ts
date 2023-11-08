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
  main: string;
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
        : supported_versions.agda.find(v => v.startsWith(agda)) ?? agda,
    stdlib:
      stdlib == 'latest'
        ? supported_versions.stdlib[0]
        : supported_versions.stdlib.find(v => v.startsWith(stdlib)) ?? stdlib
  };
}

export function getDefaults(): Options {
  const yml = load(
    readFileSync(join(__dirname, '..', 'action.yml'), 'utf8')
  ).inputs;
  return resolveLatestVersions({
    agda: yml['agda-version'].default,
    stdlib: yml['stdlib-version'].default,
    libraries: parseLibs(yml['libraries'].default),
    build: yml['build'].default,
    main: yml['main'].default,
    deploy: yml['deploy'].default,
    deployBranch: yml['deploy-branch'].default,
    token: yml['token'].default,
    css: yml['css'].default,
    rts: yml['rts'].default,
    ribbon: yml['ribbon'].default,
    ribbonMsg: yml['ribbon-msg'].default,
    ribbonColor: yml['ribbon-color'].default,
    measureTypechecking: yml['measure-typechecking'].default
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
  const get = core.getInput;
  const opts0: Options = {
    agda: get('agda-version') || def.agda,
    stdlib: get('stdlib-version') || def.stdlib,
    libraries: parseLibs(get('libraries')) || def.libraries,
    build: parseBoolean(get('build')) || def.build,
    main: get('main') || def.main,
    deploy:
      get('deploy') !== 'true'
        ? false
        : get('token')
        ? true
        : parseBoolean(get('deploy')) || def.deploy,
    deployBranch: get('deploy-branch') || def.deployBranch,
    token: get('token'),
    css: get('css') || def.css,
    rts: get('rts') || def.rts,
    ribbon: parseBoolean(get('ribbon')) || def.ribbon,
    ribbonMsg: get('ribbon-msg') || def.ribbonMsg,
    ribbonColor: get('ribbon-color') || def.ribbonColor,
    measureTypechecking:
      parseBoolean(get('measure-typechecking')) || def.measureTypechecking
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
