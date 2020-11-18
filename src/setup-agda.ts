import {join} from 'path';
import * as fs from 'fs';

import * as core from '@actions/core';
import * as io from '@actions/io';
import * as c from '@actions/cache';
import deploy from '@jamesives/github-pages-deploy-action';

import {getOpts, showLibs} from './opts';
import spawnAsync from '@expo/spawn-async';

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
    const cabalInstall =
      "cabal install --overwrite-policy=always --ghc-options='-O2 +RTS -M6G -RTS'";
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
      downloads
    ]; // [`${home}/.stack`, `${home}/.agda`, `${home}/.local`]; // , `${cur}/.stack-work`, `${cur}/_build/`];

    async function sh(cmd: string[], cwd?: string): Promise<void> {
      const res = await spawnAsync(cmd.join(' && '), [], {
        shell: true,
        stdio: 'inherit',
        cwd: cwd
      });
      core.info(`Done (${cmd}): Status ${res.status}, Signal ${res.signal}`);
    }

    core.info('Loading cache');
    const cacheHit = await c.restoreCache(paths, key, restoreKeys);
    core.info(`Done: ${cacheHit}`);

    if (!cacheHit) {
      core.info(`Installing alex/happy`);
      await sh([
        `cabal update`,
        `${cabalInstall} alex-3.2.5`,
        `${cabalInstall} happy-1.19.12`
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
        [`mkdir -p doc`, `touch doc/user-manual.pdf`, `${cabalInstall}`],
        agdaPath
      ); // stack install --yaml= ...
      fs.accessSync(agdaExe);

      core.info(`Installing ${stdlibv}`);
      fs.mkdirSync(libsDir, {recursive: true});
      await sh([
        `curl -L https://github.com/agda/agda-stdlib/archive/v${opts.stdlib}.zip -o ${stdlibPath}.zip`,
        `unzip -qq ${stdlibPath}.zip -d ${downloads}`,
        `echo "${stdlibPath}/standard-library.agda-lib" >> ${libsPath}`
      ]);
      fs.accessSync(libsPath);

      core.info('Saving cache');
      const sc = await c.saveCache(paths, key);
      core.info(`Done: ${sc}`);
    } else {
      // Make sure the cache has everything we need
      fs.accessSync(agdaPath);
      fs.accessSync(agdaExe);
      fs.accessSync(libsPath);
    }

    // Use tool-cache and cache libraries/local-builds as well..
    core.info('Installing libraries');
    for (const l of Object.values(opts.libraries)) {
      core.info(`Library: ${JSON.stringify(l)}`);
      await sh([
        `curl -L https://github.com/${l.user}/${l.repo}/archive/master.zip -o ${downloads}/${l.repo}-master.zip`,
        `unzip -qq ${downloads}/${l.repo}-master.zip -d ${downloads}`,
        `echo "${downloads}/${l.repo}-master/${l.repo}.agda-lib" >> ${libsPath}`
      ]);
    }

    if (!opts.build) return;

    core.info('Writing css file');
    const htmlDir = 'site';
    const cssDir = join(htmlDir, 'css');
    fs.mkdirSync(cssDir, {recursive: true});
    const css = join(cssDir, 'Agda.css');
    const css0 = opts.css ? `${cur}/${opts.css}` : join(__dirname, 'Agda.css');
    await io.mv(css0, css);
    fs.accessSync(css);

    core.info('Building Agda project and generating HTML');
    const mainHtml = opts.main.split('/').join('.');
    await sh([
      `agda --html --html-dir=${htmlDir} --css=${css} ${opts.main}.agda`,
      `cp ${htmlDir}/${mainHtml}.html ${htmlDir}/index.html`
    ]);
    fs.accessSync(`${htmlDir}/index.html`);

    if (!opts.token) return;
    core.info('Deploying');
    await deploy({
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
