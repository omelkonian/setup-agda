import {join} from 'path';
import * as fs from 'fs';

import * as core from '@actions/core';
import * as io from '@actions/io';
import * as c from '@actions/cache';
import deploy from '@jamesives/github-pages-deploy-action';
import {action} from '@jamesives/github-pages-deploy-action/lib/constants';

import {getOpts, showLibs} from './opts';
import spawnAsync from '@expo/spawn-async';
import {} from '@jamesives/github-pages-deploy-action/lib/constants';

(async () => {
  try {
    core.info('Preparing to setup an Agda environment...');
    const home = process.env.HOME;
    const cur = process.env.GITHUB_WORKSPACE;
    const repo = process.env.GITHUB_REPOSITORY;
    const opts = getOpts();
    const {agda, stdlib, main} = opts;
    core.info(`
    HOME: ${home}
    GITHUB_WORKSPACE: ${cur}
    REPO: ${repo}
    DIRNAME: ${__dirname}
    Options: ${JSON.stringify(opts)}
    `);

    // Constants
    const agdav = `Agda-v${agda}`;
    const stdlibv = `Stdlib-v${stdlib}`;
    const libsv = showLibs(opts.libraries);

    const downloads = join(home, 'downloads/');
    const agdaPath = join(downloads, `agda-${agda}`);
    const stdlibPath = join(downloads, `agda-stdlib-${stdlib}`);

    const libsDir = join(home, '.agda');
    const libsPath = join(libsDir, 'libraries');

    const cabalBin = join(home, '.cabal/bin');
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
      // Global
      `${home}/.cabal/packages`,
      `${home}/.cabal/store`,
      cabalBin,
      `${home}/.agda`,
      downloads,
      // Local
      'dist-newstyle',
      'dist',
      '_build',
      'site'
    ];

    async function sh(cmd: string[], cwd?: string): Promise<void> {
      const {status} = await spawnAsync(cmd.join(' && '), [], {
        shell: true,
        stdio: 'inherit',
        cwd: cwd
      });
      core.info(`Done (${cmd}): Status ${status}`);
    }
    async function downloadAndExtract(
      src: string,
      dest: string,
      lib?: string
    ): Promise<void> {
      try {
        fs.accessSync(dest);
      } catch {
        await sh([`curl -L ${src} -o ${dest}.zip`, `unzip -qq ${dest}.zip`]);
        if (lib) await sh([`echo "${join(dest, lib)}" >> ${libsPath}`]);
      }
      // TODO Use tool-cache and cache libraries/local-builds as well..
    }

    core.info('Loading cache');
    const cacheHit = await c.restoreCache(paths, key, restoreKeys);
    core.info(`Done: ${cacheHit}`);

    await io.mkdirP(downloads);
    await io.mkdirP(libsDir);

    core.info(`Downloading ${agdav}`);
    await downloadAndExtract(
      `https://github.com/agda/agda/archive/v${agda}.zip`,
      agdaPath
    );

    try {
      fs.accessSync(agdaExe);
    } catch {
      core.info(`Installing ${agdav}`);
      await sh([
        `cabal update`,
        `${cabal(2)} alex-3.2.5`,
        `${cabal(2)} happy-1.19.12`
      ]);
      await sh(
        [`mkdir -p doc`, `touch doc/user-manual.pdf`, `${cabal(1)}`],
        agdaPath
      );
    }

    core.info(`Downloading ${stdlibv}`);
    await downloadAndExtract(
      `https://github.com/agda/agda-stdlib/archive/v${stdlib}.zip`,
      stdlibPath,
      'standard-library.agda-lib'
    );

    core.info('Downloading libraries');
    for (const l of Object.values(opts.libraries)) {
      core.info(`Library: ${JSON.stringify(l)}`);
      await downloadAndExtract(
        `https://github.com/${l.user}/${l.repo}/archive/master.zip`,
        join(downloads, `${l.repo}-master`),
        `${l.repo}.agda-lib`
      );
    }

    if (!opts.build) return;

    core.info('Writing css files');
    const htmlDir = 'site';
    const cssDir = join(htmlDir, 'css');
    await io.mkdirP(cssDir);
    const css = join(cssDir, 'Agda.css');

    if (opts.css) {
      await io.mv(join(cur, opts.css), css);
    } else {
      await io.mv(join(__dirname, 'css/'), htmlDir);
    }

    core.info('Building Agda project and generating HTML');
    const mainHtml = main.split('/').join('.');
    await sh([`agda --html --html-dir=${htmlDir} --css=${css} ${main}.agda`]);
    await io.cp(`${htmlDir}/${mainHtml}.html`, `${htmlDir}/index.html`);

    core.info('Saving cache');
    const sc = await c.saveCache(paths, key);
    core.info(`Done: ${sc}`);

    if (!opts.deploy) return;

    core.info('Deploying');
    await deploy({
      ...action,
      branch: opts.deployBranch,
      folder: htmlDir,
      gitHubToken: opts.token,
      repositoryName: repo,
      silent: true,
      workspace: cur,
      preserve: true
    });
  } catch (error) {
    core.setFailed(error.message);
  }
})();
