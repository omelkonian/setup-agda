import {getInput} from '@actions/core';
import {getOpts, getDefaults} from '../src/opts';
import * as supported_versions from '../src/versions.json';

const def = getDefaults();
const latestVersions = {
  agda: supported_versions.agda[0],
  stdlib: supported_versions.stdlib[0]
};

const mkName = (s: string): string =>
  `INPUT_${s.replace(/ /g, '_').toUpperCase()}`;

const setupEnv = (o: Record<string, unknown>): void =>
  Object.entries(o).forEach(([k, v]) => v && (process.env[mkName(k)] = `${v}`));

describe('actions/setup-agda', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {...OLD_ENV};
    delete process.env.NODE_ENV;
  });

  afterEach(() => (process.env = OLD_ENV));

  type Tool = 'agda' | 'stdlib';
  const forAll = (fn: (t: Tool) => any) =>
    (['agda', 'stdlib'] as const).forEach(fn);

  it('Parses action.yml to get correct default versions', () => {
    forAll(t => expect(def[t]).toBe(latestVersions[t]));
  });

  it('[meta] Setup Env works', () => {
    setupEnv({input: 'value'});
    expect(getInput('input')).toEqual('value');
  });

  it('getOpts grabs defaults correctly from environment', () => {
    setupEnv({});
    forAll(t => expect(getOpts()[t]).toBe(def[t]));
  });

  it('Versions resolve correctly', () => {
    setupEnv({
      'agda-version': '2.6',
      'stdlib-version': '1'
    });
    const v = {agda: '2.6.4.3', stdlib: '1.7.3'};
    forAll(t => expect(getOpts()[t]).toBe(v[t]));
  });

  it('"latest" Versions resolve correctly', () => {
    setupEnv({
      'agda-version': 'latest',
      'stdlib-version': 'latest'
    });
    forAll(t => expect(getOpts()[t]).toBe(latestVersions[t]));
  });

  type Flag = 'deploy' | 'token';
  const forAllF = (fn: (t: Flag) => any) =>
    (['deploy', 'token'] as const).forEach(fn);

  // ** BUG: core.getInput cannot differentiate between false and not-set
  // it('"token" automatically triggers "deploy"', () => {
  //   setupEnv({token: 'CHANGE_ME'});
  //   const v = {...latestVersions, token: 'CHANGE_ME', deploy: true};
  //   forAllF(t => expect(getOpts()[t]).toBe(v[t]));
  // });

  it('"token" does not automatically trigger "deploy" when deploy is "true"', () => {
    setupEnv({token: 'CHANGE_ME', deploy: 'true'});
    const v = {...latestVersions, token: 'CHANGE_ME', deploy: true};
    forAllF(t => expect(getOpts()[t]).toBe(v[t]));
  });

  it('"token" does not automatically trigger "deploy" when deploy is "false"', () => {
    setupEnv({token: 'CHANGE_ME', deploy: 'false'});
    const v = {...latestVersions, token: 'CHANGE_ME', deploy: false};
    forAllF(t => expect(getOpts()[t]).toBe(v[t]));
  });

  it('"token" does not automatically trigger "deploy" when deploy is true', () => {
    setupEnv({token: 'CHANGE_ME', deploy: true});
    const v = {...latestVersions, token: 'CHANGE_ME', deploy: true};
    forAllF(t => expect(getOpts()[t]).toBe(v[t]));
  });

  it('"token" does not automatically trigger "deploy" when deploy is false', () => {
    setupEnv({token: 'CHANGE_ME', deploy: false});
    const v = {...latestVersions, token: 'CHANGE_ME', deploy: false};
    forAllF(t => expect(getOpts()[t]).toBe(v[t]));
  });
});
