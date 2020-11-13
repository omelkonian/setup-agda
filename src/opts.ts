import * as core from '@actions/core';
import {readFileSync} from 'fs';
import {load} from 'js-yaml';
import {join} from 'path';
import * as supported_versions from './versions.json';

export type Version = string;
export type GitUser = string;
export type GitRepo = string;
export type Library = [GitUser, GitRepo];

export type Tool = 'agda' | 'stdlib';

export interface Options {
  agda: Version;
  stdlib: Version;
  libraries: Library[];
}

function mkOpts(opts: Options): Options {
  const pagda = opts.agda;
  const pstdlib = opts.stdlib;
  return {
    agda:
      pagda === 'latest'
        ? supported_versions.agda[0]
        : supported_versions.agda.find(v => v.startsWith(pagda)) ?? pagda,
    stdlib:
      pstdlib == 'latest'
        ? supported_versions.stdlib[0]
        : supported_versions.stdlib.find(v => v.startsWith(pstdlib)) ?? pstdlib,
    libraries: opts.libraries
  };
}

export function getDefaults(): Options {
  const yml = load(readFileSync(join(__dirname, '..', 'action.yml'), 'utf8'))
    .inputs;
  return mkOpts({
    agda: yml['agda-version'].default,
    stdlib: yml['stdlib-version'].default,
    libraries: yml['libraries'].default
  });
}

export function getOpts(): Options {
  const def: Options = getDefaults();
  const opts: Options = {
    agda: core.getInput('agda-version') || def.agda,
    stdlib: core.getInput('stdlib-version') || def.stdlib,
    libraries:
      ((core.getInput('libraries') as unknown) as Library[]) || def.libraries
  };
  const opts2 = mkOpts(opts);
  core.debug(
    `Options are: ${JSON.stringify(opts)} ~> ${JSON.stringify(opts2)}`
  );
  return opts2;
}
