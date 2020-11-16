import * as core from '@actions/core';
import * as io from '@actions/io';
import {restoreCache, saveCache} from '@actions/cache';
import {getOpts} from './opts';
import type {Options} from './opts';
import {spawn} from 'child_process';
import {promisify} from 'util';

(async () => {
  try {
    core.info('Preparing to setup an Agda environment...');
    const home = `${process.env.HOME}`;
    core.info(`HOME: ${home}`);
    const cur = `${process.env.GITHUB_WORKSPACE}`;
    core.info(`GITHUB_WORKSPACE: ${cur}`);
    const opts: Options = getOpts();
    core.info(`Options are: ${JSON.stringify(opts)}`);

    // Promise-based shell commands
    const sh = async (cmd: string): Promise<void> => {
      promisify(spawn)('sh', ['-c', cmd], {stdio: 'inherit'});
    };

    // Cache parameters
    const paths = [`${home}/.stack`, `${cur}/.stack-work`];
    const key = 'key';
    const restoreKeys = [key];

    // Restore cache
    const keyRestored = await restoreCache(paths, key, restoreKeys);
    core.info(`Cache key restored: ${keyRestored}`);

    // Install Agda and its standard library
    const ghc = '8.6.5';
    core.addPath(`${home}/.local/bin/`);
    await io.mkdirP(`${home}/.agda`);

    core.info('Installing Agda...');
    await sh(`\
    curl -L https://github.com/agda/agda/archive/v${opts.agda}.zip -o ${home}/agda-${opts.agda}.zip && \
    unzip -qq ${home}/agda-${opts.agda}.zip -d ${home} && \
    cd ${home}/agda-${opts.agda} && \
    stack install --stack-yaml=stack-${ghc}.yaml \
    `);

    // Install Agda's stdlib
    core.info("Installing Agda's stdlib...");
    await sh(`\
    curl -L https://github.com/agda/agda-stdlib/archive/v${opts.stdlib}.zip -o ${home}/agda-stdlib-${opts.stdlib}.zip && \
    unzip -qq ${home}/agda-stdlib-${opts.stdlib}.zip -d ${home} && \
    echo "${home}/agda-stdlib-${opts.stdlib}/standard-library.agda-lib" >> ${home}/.agda/libraries \
    `);

    // Install libraries
    core.info('Installing user-supplied libraries...');
    Object.values(opts.libraries).forEach(async l => {
      core.info(`Library: ${JSON.stringify(l)}`);
      await sh(`\
      curl -L https://github.com/${l.user}/${l.repo}/archive/master.zip -o ${home}/${l.repo}-master.zip && \
      unzip -qq ${home}/${l.repo}-master.zip -d ${home} && \
      echo "${home}/${l.repo}-master/${l.repo}.agda-lib" >> ${home}/.agda/libraries
      `);
    });

    // Save cache
    const keySaved = await saveCache(paths, key);
    core.info(`Cache key saved: ${keySaved}`);
  } catch (error) {
    core.setFailed(error.message);
  }
})();
