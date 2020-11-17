import {join} from 'path';
import * as fs from 'fs';

import * as core from '@actions/core';
import * as io from '@actions/io';
import * as c from '@actions/cache';
import * as tc from '@actions/tool-cache';
import {exec} from '@actions/exec';
import deploy from '@jamesives/github-pages-deploy-action';

import {getOpts} from './opts';

(async () => {
  try {
    core.info('Preparing to setup an Agda environment...');
    const home = `${process.env.HOME}`;
    const cur = `${process.env.GITHUB_WORKSPACE}`;
    const opts = getOpts();
    core.info(`
    HOME: ${home}
    GITHUB_WORKSPACE: ${cur}
    Options: ${JSON.stringify(opts)}
    `);

    // Cache parameters
    const key = `${opts.agda}-${opts.stdlib}`;
    const paths = [`${home}/.stack`, `${cur}/.stack-work`, `${cur}/_build/`];

    // Restore caches
    const keyRestored = await c.restoreCache(paths, key, []);
    core.info(`Cache key restored: ${keyRestored}`);

    // Install Agda and its standard library
    core.group(`Installing Agda-v${opts.agda}`, async () => {
      const ghc = '8.6.5';
      core.addPath(`${home}/.local/bin/`);
      await io.mkdirP(`${home}/.agda`);
      await tc
        .downloadTool(
          `https://github.com/agda/agda/archive/v${opts.agda}.zip`,
          `${home}/agda-${opts.agda}.zip`
        )
        .then(p => tc.extractZip(p, `${home}`));
      await exec('cd');
      await exec('stack', [
        `--work-dir ${home}/agda-${opts.agda}`,
        `install --stack-yaml=stack-${ghc}.yaml`
      ]);
    });

    // Install Agda's stdlib
    core.group(`Installing agda/stdlib-v${opts.stdlib}`, async () => {
      await tc
        .downloadTool(
          `https://github.com/agda/agda-stdlib/archive/v${opts.stdlib}.zip`,
          `${home}/agda-${opts.stdlib}.zip`
        )
        .then(p => tc.extractZip(p, `${home}`));
      fs.appendFile(
        `${home}/.agda/libraries`,
        `${home}/agda-stdlib-${opts.stdlib}/standard-library.agda-lib`,
        err => {
          throw err;
        }
      );
    });

    // Install libraries
    core.group('Installing user-supplied libraries...', async () => {
      for (const l of Object.values(opts.libraries)) {
        core.info(`Library: ${JSON.stringify(l)}`);
        await tc
          .downloadTool(
            `https://github.com/${l.user}/${l.repo}/archive/master.zip`,
            `${home}/${l.repo}-master.zip`
          )
          .then(p => tc.extractZip(p, `${home}`));
        fs.appendFile(
          `${home}/.agda/libraries`,
          `${home}/${l.repo}-master/${l.repo}.agda-lib`,
          err => {
            throw err;
          }
        );
      }
    });

    // Build current Agda project
    const htmlDir = 'site';
    const agdaCss = opts.css
      ? `../${opts.css}`
      : join(__dirname, '..', 'Agda.css');
    if (opts.build)
      core.group(
        `Building Agda project with main file: ${opts.main} and css file: ${agdaCss}`,
        async () => {
          await io.mkdirP(`${cur}/${htmlDir}/css`);
          await exec('agda', [
            `--html --html-dir=${htmlDir}`,
            `--css=${agdaCss}`,
            `${opts.main}.agda`
          ]);
          await io.cp(`${htmlDir}/${opts.main}.html`, `${htmlDir}/index.html`);
        }
      );

    // Save caches
    const keySaved = await c.saveCache(paths, key);
    core.info(`Cache key saved: ${keySaved}`);

    // Deploy Github page with Agda HTML code rendered in HTML
    if (opts.build && opts.token)
      // && opts.deployOn.split(':') == [opts.agda, opts.stdlib])
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
