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
    const paths = [`${home}/.stack`, `${home}/.agda`, `${home}/.local`];
    // , `${cur}/.stack-work`, `${cur}/_build/`];

    async function sh(cmd: string): Promise<void> {
      const res = await spawnAsync(cmd, [], {shell: true, stdio: 'inherit'});
      core.info(`Done (${cmd}): Status ${res.status}, Signal ${res.signal}`);
    }

    core.info('Loading cache');
    const k = await c.restoreCache(paths, key, restoreKeys);
    core.info(`Done: ${k}`);

    core.info(`Installing Agda-v${opts.agda}`);
    const ghc = '8.6.5';
    core.addPath(`${home}/.local/bin/`);
    await sh(`\
curl -L https://github.com/agda/agda/archive/v${opts.agda}.zip -o ${home}/agda-${opts.agda}.zip && \
unzip -qq ${home}/agda-${opts.agda}.zip -d ${home} && \
cd ${home}/agda-${opts.agda} && \
stack install --stack-yaml=stack-${ghc}.yaml \
`);
    fs.accessSync(`${home}/.local/bin/agda`);

    core.info(`Installing stdlib-v${opts.stdlib}`);
    const libsDir = join(home, '.agda');
    fs.mkdirSync(libsDir, {recursive: true});
    await sh(`\
curl -L https://github.com/agda/agda-stdlib/archive/v${opts.stdlib}.zip -o ${home}/agda-stdlib-${opts.stdlib}.zip && \
unzip -qq ${home}/agda-stdlib-${opts.stdlib}.zip -d ${home} && \
echo "${home}/agda-stdlib-${opts.stdlib}/standard-library.agda-lib" >> ${home}/.agda/libraries \
`);
    fs.accessSync(join(libsDir, 'libraries'));

    core.info('Saving cache');
    const sc = await c.saveCache(paths, key);
    core.info(`Done: ${sc}`);

    core.info('Making libraries');
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

    core.info('Making site');
    await sh(`\
agda --html --html-dir=${htmlDir} --css=${css} ${opts.main}.agda && \
cp ${htmlDir}/${opts.main}.html ${htmlDir}/index.html \
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
