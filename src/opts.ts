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
}

export interface Options {
  agda: Version;
  stdlib: Version;
  libraries: Library[];
  build: boolean;
  main: string;
  deployOn: string;
  deployBranch: string;
  token: string;
  css: string;
}

function mkOpts(opts: Options): Options {
  const pagda = opts.agda;
  const pstdlib = opts.stdlib;
  return {
    ...opts,
    agda:
      pagda === 'latest'
        ? supported_versions.agda[0]
        : supported_versions.agda.find(v => v.startsWith(pagda)) ?? pagda,
    stdlib:
      pstdlib == 'latest'
        ? supported_versions.stdlib[0]
        : supported_versions.stdlib.find(v => v.startsWith(pstdlib)) ?? pstdlib
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
    deployOn: yml['deployOn'].default,
    deployBranch: yml['deployBranch'].default,
    token: yml['token'].default,
    css: yml['css'].default
  });
}

function parseLibs(libs: string): Library[] {
  const parseRepo = (l: string): Library => {
    const [usr, rep] = l.split(':');
    return {user: usr, repo: rep};
  };
  const ls = libs.split(',');
  return ls[0] ? ls.map(parseRepo) : [];
}

const parseBoolean = (s: string): boolean => s == 'true';

export function getOpts(): Options {
  const def: Options = getDefaults();
  core.debug(`Default options are: ${JSON.stringify(def)}`);
  const opts: Options = {
    agda: core.getInput('agda-version') || def.agda,
    stdlib: core.getInput('stdlib-version') || def.stdlib,
    libraries: parseLibs(core.getInput('libraries')) || def.libraries,
    build: parseBoolean(core.getInput('build')) || def.build,
    main: core.getInput('main') || def.main,
    deployOn: core.getInput('deployOn') || def.deployOn,
    deployBranch: core.getInput('deployBranch') || def.deployBranch,
    token: core.getInput('token'),
    css: core.getInput('css') || def.css
  };
  const opts2 = mkOpts(opts);
  core.debug(
    `Options are: ${JSON.stringify(opts)} ~> ${JSON.stringify(opts2)}`
  );
  return opts2;
}
