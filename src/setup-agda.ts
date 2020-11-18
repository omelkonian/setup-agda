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

    // Cache parameters
    const key = `Agda-v${opts.agda}-stdlib-v${opts.stdlib}`;
    const restoreKeys = [
      `Agda-v${opts.agda}-stdlib-v${opts.stdlib}-${showLibs(opts.libraries)}`,
      `Agda-v${opts.agda}-stdlib-v${opts.stdlib}`,
      `Agda-v${opts.agda}`
    ];
    const paths = [
      `${home}/.cabal/packages`,
      `${home}/.cabal/store`,
      `${home}/.cabal/bin`,
      `dist-newstyle`
    ];
    // [`${home}/.stack`, `${home}/.agda`, `${home}/.local`]; // , `${cur}/.stack-work`, `${cur}/_build/`];

    async function sh(cmd: string, cwd?: string): Promise<void> {
      const res = await spawnAsync(cmd, [], {
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
      core.addPath(`${home}/.cabal/bin`); // `${home}/.local/bin/`

      core.info(`Installing alex/happy`);
      await sh(`\
cabal update && \
cabal install --overwrite-policy=always --ghc-options='-O2 +RTS -M6G -RTS' alex-3.2.5 && \
cabal install --overwrite-policy=always --ghc-options='-O2 +RTS -M6G -RTS' happy-1.19.12 && \
`);
      core.info(`Downloading Agda-${opts.agda}`);
      await sh(`\
curl -L https://github.com/agda/agda/archive/v${opts.agda}.zip -o ${home}/agda-${opts.agda}.zip && \
unzip -qq ${home}/agda-${opts.agda}.zip -d ${home} \
`);
      fs.accessSync(`${home}/agda-${opts.agda}`);

      core.info(`Installing Agda-v${opts.agda}`);
      // stack install --yaml= ...
      await sh(
        `\
mkdir -p doc \
touch doc/user-manual.pdf \
cabal install --overwrite-policy=always --ghc-options='-O1 +RTS -M6G -RTS \
`,
        `${home}/agda-${opts.agda}`
      );
      fs.accessSync(`${home}/.cabal/bin/agda`);

      core.info(`Installing stdlib-v${opts.stdlib}`);
      const libsDir = join(home, '.agda');
      fs.mkdirSync(libsDir, {recursive: true});
      await sh(`\
curl -L https://github.com/agda/agda-stdlib/archive/v${opts.stdlib}.zip -o ${home}/agda-stdlib-${opts.stdlib}.zip && \
unzip -qq ${home}/agda-stdlib-${opts.stdlib}.zip -d ${home} && \
echo "${home}/agda-stdlib-${opts.stdlib}/standard-library.agda-lib" >> ${home}/.agda/libraries \
`);
      fs.accessSync(join(libsDir, 'libraries'));
    }

    core.info('Saving cache');
    const sc = await c.saveCache(paths, key);
    core.info(`Done: ${sc}`);

    core.info('Installing libraries');
    for (const l of Object.values(opts.libraries)) {
      core.info(`Library: ${JSON.stringify(l)}`);
      await sh(`\
curl -L https://github.com/${l.user}/${l.repo}/archive/master.zip -o ${home}/${l.repo}-master.zip && \
unzip -qq ${home}/${l.repo}-master.zip -d ${home} && \
echo "${home}/${l.repo}-master/${l.repo}.agda-lib" >> ${home}/.agda/libraries \
`);
      fs.accessSync(`${home}/${l.repo}-master/${l.repo}.agda-lib`);
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
    await sh(`\
agda --html --html-dir=${htmlDir} --css=${css} ${opts.main}.agda && \
cp ${htmlDir}/${mainHtml}.html ${htmlDir}/index.html \
`);
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
