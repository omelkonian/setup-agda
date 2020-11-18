import {join} from 'path';
import * as fs from 'fs';

import * as core from '@actions/core';
import * as io from '@actions/io';
import * as c from '@actions/cache';
import deploy from '@jamesives/github-pages-deploy-action';
import {action} from '@jamesives/github-pages-deploy-action/lib/constants';

import {getOpts, showLibs} from './opts';
import spawnAsync from '@expo/spawn-async';
import {NodeActionInterface} from '@jamesives/github-pages-deploy-action/lib/constants';

(async () => {
  try {
    core.info('Preparing to setup an Agda environment...');
    const home = process.env.HOME;
    const cur = process.env.GITHUB_WORKSPACE;
    const repo = process.env.GITHUB_REPOSITORY;
    const opts = getOpts();
    core.info(`
    HOME: ${home}
    GITHUB_WORKSPACE: ${cur}
    REPO: ${repo}
    DIRNAME: ${__dirname}
    Options: ${JSON.stringify(opts)}
    `);

    // Constants
    const agdav = `agda-v${opts.agda}`;
    const stdlibv = `agda-stdlib-v${opts.stdlib}`;
    const libsv = showLibs(opts.libraries);

    const downloads = join(home, 'downloads/');
    const agdaPath = join(downloads, `agda-${opts.agda}`);
    const stdlibPath = join(downloads, `agda-stdlib-${opts.stdlib}`);

    const libsDir = join(home, '.agda');
    const libsPath = join(libsDir, 'libraries');

    const cabalBin = join(home, '.cabal/bin'); // '~/.local/bin'
    core.addPath(cabalBin);
    const cabal = (opt: 0 | 1 | 2): string =>
      `cabal install --overwrite-policy=always --ghc-options='-O${opt} +RTS -M6G -RTS'`;
    const agdaExe = join(cabalBin, 'agda');

    // Cache parameters
    const keys = [agdav, stdlibv, libsv];
    const key = keys.join('-');
    const restoreKeys = [
      keys.slice(0, 2).join('-') + '-',
      keys.slice(0, 1).join('-') + '-'
    ];
    const paths = [
      `${home}/.cabal/packages`,
      `${home}/.cabal/store`,
      cabalBin,
      `dist-newstyle`,
      `${home}/.agda`,
      downloads
    ]; // TODO cache _build/ etc..

    async function sh(cmd: string[], cwd?: string): Promise<void> {
      const {status} = await spawnAsync(cmd.join(' && '), [], {
        shell: true,
        stdio: 'inherit',
        cwd: cwd
      });
      core.info(`Done (${cmd}): Status ${status}`);
    }

    core.info('Loading cache');
    const cacheHit = await c.restoreCache(paths, key, restoreKeys);
    core.info(`Done: ${cacheHit}`);

    if (!cacheHit) {
      core.info(`Installing alex/happy`);
      await sh([
        `cabal update`,
        `${cabal(2)} alex-3.2.5`,
        `${cabal(2)} happy-1.19.12`
      ]);

      await io.mkdirP(downloads);

      core.info(`Downloading ${agdav}`);
      await sh([
        `curl -L https://github.com/agda/agda/archive/v${opts.agda}.zip -o ${agdaPath}.zip`,
        `unzip -qq ${agdaPath}.zip -d ${downloads}`
      ]);
      fs.accessSync(agdaPath);

      core.info(`Installing ${agdav}`);
      await sh(
        [`mkdir -p doc`, `touch doc/user-manual.pdf`, `${cabal(1)}`],
        agdaPath
      ); // stack install --yaml= ...
      fs.accessSync(agdaExe);

      core.info(`Installing ${stdlibv}`);
      io.mkdirP(libsDir);
      await sh([
        `curl -L https://github.com/agda/agda-stdlib/archive/v${opts.stdlib}.zip -o ${stdlibPath}.zip`,
        `unzip -qq ${stdlibPath}.zip -d ${downloads}`,
        `echo "${stdlibPath}/standard-library.agda-lib" >> ${libsPath}`
      ]);
      fs.accessSync(stdlibPath);

      core.info('Installing libraries');
      for (const l of Object.values(opts.libraries)) {
        core.info(`Library: ${JSON.stringify(l)}`);
        await sh([
          `curl -L https://github.com/${l.user}/${l.repo}/archive/master.zip -o ${downloads}/${l.repo}-master.zip`,
          `unzip -qq ${downloads}/${l.repo}-master.zip -d ${downloads}`,
          `echo "${downloads}/${l.repo}-master/${l.repo}.agda-lib" >> ${libsPath}`
        ]);
        fs.accessSync(`${downloads}/${l.repo}-master`);
      }

      core.info('Saving cache');
      const sc = await c.saveCache(paths, key);
      core.info(`Done: ${sc}`);
    }
    // TODO Use tool-cache and cache libraries/local-builds as well..
    if (!opts.build) return;
    core.info('Writing css file');
    const htmlDir = 'site';
    const cssDir = join(htmlDir, 'css');
    await io.mkdirP(cssDir);
    const css = join(cssDir, 'Agda.css');
    const css0 = opts.css ? `${cur}/${opts.css}` : join(__dirname, 'Agda.css');
    await io.mv(css0, css);

    core.info('Building Agda project and generating HTML');
    const mainHtml = opts.main.split('/').join('.');
    await sh([
      `agda --html --html-dir=${htmlDir} --css=${css} ${opts.main}.agda`
    ]);
    await io.cp(`${htmlDir}/${mainHtml}.html`, `${htmlDir}/index.html`);

    if (!opts.deploy) return;
    core.info('Deploying');
    const deployOpts: NodeActionInterface = {
      branch: opts.deployBranch,
      folder: htmlDir,
      gitHubToken: opts.token,
      repositoryName: repo,
      silent: false,
      workspace: cur
    };
    await deploy({...action, ...deployOpts});
  } catch (error) {
    core.setFailed(error.message);
  }
})();
