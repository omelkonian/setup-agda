import spawnAsync from '@expo/spawn-async';
import {join} from 'path';

import * as core from '@actions/core';
import * as io from '@actions/io';
import * as c from '@actions/cache';
import deploy from '@jamesives/github-pages-deploy-action';

import {getOpts, Options} from './opts';

// Promise-based shell commands
async function sh(cmd: string): Promise<void> {
  await spawnAsync('sh', ['-c', cmd], {stdio: 'inherit'});
}

(async () => {
  try {
    core.info('Preparing to setup an Agda environment...');
    const home = `${process.env.HOME}`;
    core.info(`HOME: ${home}`);
    const cur = `${process.env.GITHUB_WORKSPACE}`;
    core.info(`GITHUB_WORKSPACE: ${cur}`);
    const opts: Options = getOpts();
    core.info(`Options are: ${JSON.stringify(opts)}`);

    // Cache parameters
    const key = `${opts.agda}-${opts.stdlib}`;
    const paths = [`${home}/.stack`, `${cur}/.stack-work`, `${cur}/_build/`];

    // Restore caches
    const keyRestored = await c.restoreCache(paths, key, []);
    core.info(`Cache key restored: ${keyRestored}`);

    // Install Agda and its standard library
    const ghc = '8.6.5';
    core.addPath(`${home}/.local/bin/`);
    await io.mkdirP(`${home}/.agda`);

    core.info(`Installing Agda-v${opts.agda}`);
    await sh(`\
    curl -L https://github.com/agda/agda/archive/v${opts.agda}.zip -o ${home}/agda-${opts.agda}.zip && \
    unzip -qq ${home}/agda-${opts.agda}.zip -d ${home} && \
    cd ${home}/agda-${opts.agda} && \
    stack install --stack-yaml=stack-${ghc}.yaml \
    `);

    // Install Agda's stdlib
    core.info(`Installing agda/stdlib-v${opts.stdlib}`);
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

    // Build current Agda project
    const htmlDir = 'site';
    if (opts.build) {
      const agdaCss = opts.css
        ? `../${opts.css}`
        : join(__dirname, '..', 'Agda.css');
      core.info(
        `Building Agda project with main file: ${opts.main} and css file: ${agdaCss}`
      );
      await io.mkdirP(`${cur}/${htmlDir}/css`);
      await sh(`\
      agda --html --html-dir=${htmlDir} --css=${agdaCss} ${opts.main}.agda && \
      cp ${htmlDir}/${opts.main}.html ${htmlDir}/index.html\
      `);
    }

    // Save caches
    const keySaved = await c.saveCache(paths, key);
    core.info(`Cache key saved: ${keySaved}`);

    // Deploy Github page with Agda HTML code rendered in HTML
    if (opts.token && opts.deployOn.split(':') == [opts.agda, opts.stdlib])
      deploy({
        accessToken: opts.token,
        branch: opts.deployBranch,
        folder: htmlDir,
        silent: true,
        workspace: cur
      });
  } catch (error) {
    core.setFailed(error.message);
  }
})();
