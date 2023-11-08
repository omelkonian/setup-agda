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

type Tool = 'agda' | 'stdlib';
const forAll = (fn: (t: Tool) => any) =>
  (['agda', 'stdlib'] as const).forEach(fn);

describe('actions/setup-agda', () => {
  const OLD_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = {...OLD_ENV};
    delete process.env.NODE_ENV;
  });

  afterEach(() => (process.env = OLD_ENV));

  it('Parses action.yml to get correct default versions', () => {
    forAll(t => expect(def[t]).toBe(latestVersions[t]));
  });

  it('[meta] Setup Env works', () => {
    setupEnv({input: 'value'});
    const i = getInput('input');
    expect(i).toEqual('value');
  });

  it('getOpts grabs defaults correctly from environment', () => {
    setupEnv({});
    const options = getOpts();
    forAll(t => expect(options[t]).toBe(def[t]));
  });

  it('Versions resolve correctly', () => {
    const v = {agda: '2.6.4', stdlib: '1.7.3'};
    setupEnv({
      'agda-version': '2.6',
      'stdlib-version': '1'
    });
    const options = getOpts();
    forAll(t => expect(options[t]).toBe(v[t]));
  });

  it('"latest" Versions resolve correctly', () => {
    setupEnv({
      'agda-version': 'latest',
      'stdlib-version': 'latest'
    });
    const options = getOpts();
    forAll(t => expect(options[t]).toBe(latestVersions[t]));
  });

  it('"token" automatically triggers "deploy"', () => {
    const v = {...latestVersions, deploy: 'true', deployToken: 'CHANGE_ME'};
    setupEnv({'deploy-token': 'CHANGE_ME'});
    const options = getOpts();
    forAll(t => expect(options[t]).toBe(v[t]));
  });

  it('"deploy" resolves correctly w.r.t. token', () => {
    const v = {...latestVersions, deploy: 'false'};
    setupEnv({'deploy-token': 'CHANGE_ME'});
    const options = getOpts();
    forAll(t => expect(options[t]).toBe(v[t]));
  });
});
