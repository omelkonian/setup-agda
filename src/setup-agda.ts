import * as core from '@actions/core';
import * as io from '@actions/io';
import {getOpts} from './opts';
import type {Options} from './opts';
import {exec} from '@actions/exec';

(async () => {
  try {
    core.info(
      'Preparing to setup a Agda environment (after Haskell has been setup)'
    );
    const home = `${process.env.HOME}`;
    core.info(`HOME: ${home}`);
    const cur = `${process.env.GITHUB_WORKSPACE}`;
    core.info(`GITHUB_WORKSPACE: ${cur}`);
    const opts: Options = getOpts();
    core.info(`Options are: ${JSON.stringify(opts)}`);

    // Install Agda and its standard library
    core.addPath(`${home}/.local/bin/`);
    await io.mkdirP(`${home}/.agda`);
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
