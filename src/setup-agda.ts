import * as core from '@actions/core';
import * as io from '@actions/io';
// import {readFileSync} from 'fs';
// import {join} from 'path';
// import * as vm from 'vm';
import * as hso from 'setup-haskell/src/opts';
import * as hsi from 'setup-haskell/src/installer';
import {getOpts} from './opts';
import type {Options} from './opts';
import {exec} from '@actions/exec';

(async () => {
  try {
    core.info('Preparing to setup a Agda environment');
    // Setup Haskell with stack enabled
    // const hsopts: hso.Options = {
    //   ghc: {enable: true, raw: '8.6.5', resolved: '8.6.5'},
    //   cabal: {enable: true, raw: 'latest', resolved: 'latest'},
    //   stack: {raw: 'latest', resolved: 'latest', enable: true, setup: true}
    // };
    await hsi.installTool(
      'stack' as hso.Tool,
      'latest',
      process.platform as hso.OS
    );
    await exec('stack', ['setup', '8.6.5']);
    // vm.runInNewContext(
    //   readFileSync(join(__dirname, '..', 'dist', 'setup-haskell.js'), 'utf8'),
    //   {'ghc-version': '8.6.5', 'enable-stack': true, 'stack-version': 'latest'}
    // );

    core.info('Preparing to setup a Agda environment');
    const opts: Options = getOpts();
    const home = `${process.env.HOME}`;
    const cur = `${process.env.GITHUB_WORKSPACE}`;

    // Install Agda and its standard library
    core.addPath(`${home}/.local/bin/`);
    io.mkdirP(`${home}/.agda`);
    await exec(
      `${cur}/scripts/install-agda.sh ${home} ${opts.agda} ${opts.stdlib}`
    );

    // Install libraries
    Object.values(opts.libraries).forEach(async l => {
      core.info(`Library: ${l}`);
      await exec(`${cur}/scripts/install-lib.sh ${home} ${l.user} ${l.repo}`);
    });
  } catch (error) {
    core.setFailed(error.message);
  }
})();
