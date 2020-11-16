import {spawn} from 'child_process';
import {promisify} from 'util';
import {join} from 'path';

import * as core from '@actions/core';
import * as io from '@actions/io';
import {restoreCache, saveCache} from '@actions/cache';
import deploy from '@jamesives/github-pages-deploy-action';

import {getOpts, Options} from './opts';

// Promise-based shell commands
async function sh(cmd: string): Promise<void> {
  promisify(spawn)('sh', ['-c', cmd], {stdio: 'inherit'});
}

// Caching
interface Cache {
  key: string;
  paths: string[];
}

async function restore(c: Cache): Promise<void> {
  const keyRestored = await restoreCache(c.paths, c.key, [c.key]);
  core.info(`Cache key restored: ${keyRestored}`);
}

async function save(c: Cache): Promise<void> {
  const keySaved = await saveCache(c.paths, c.key);
  core.info(`Cache key saved: ${keySaved}`);
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
    const haskellCache: Cache = {
      key: 'stack-cache',
      paths: [`${home}/.stack`, `${cur}/.stack-work`]
    };
    const agdaCache: Cache = {
      key: `${opts.agda}-${opts.stdlib}`,
      paths: [`${cur}/_build/`]
    };

    // Restore caches
    await restore(haskellCache);
    await restore(agdaCache);

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
    await save(haskellCache);
    await save(agdaCache);

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
