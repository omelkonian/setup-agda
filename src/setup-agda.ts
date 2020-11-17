import {join} from 'path';
import {promisify} from 'util';
import * as fs from 'fs';

import * as core from '@actions/core';
import * as io from '@actions/io';
import * as c from '@actions/cache';
import * as tc from '@actions/tool-cache';
import {exec} from '@actions/exec';
import deploy from '@jamesives/github-pages-deploy-action';

import {getOpts, showLibs} from './opts';

(async () => {
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
  const key = `Agda-v${opts.agda}-stdlib-v${opts.stdlib}-${showLibs(
    opts.libraries
  )}`;
  const paths = [`${home}/.stack`, `${cur}/.stack-work`, `${cur}/_build/`];

  const curlUnzip = async (src: string, dest: string): Promise<string | void> =>
    tc.downloadTool(src, dest).then(p => tc.extractZip(p, home));
  const append = async (src: string, dest: string): Promise<void> =>
    promisify(fs.appendFile)(src, dest);

  // Restore caches
  await c.restoreCache(paths, key, []);

  // Install Agda and its standard library
  core.addPath(`${home}/.local/bin/`);
  core.group(`Installing Agda-v${opts.agda}`, async () => {
    const ghc = '8.6.5';
    await io.mkdirP(`${home}/.agda`);
    await curlUnzip(
      `https://github.com/agda/agda/archive/v${opts.agda}.zip`,
      `${home}/agda-${opts.agda}.zip`
    );
    await exec('stack', [
      `--work-dir ${home}/agda-${opts.agda}`,
      `install --stack-yaml=stack-${ghc}.yaml`
    ]);
  });

  // Install Agda's stdlib
  core.group(`Installing agda/stdlib-v${opts.stdlib}`, async () => {
    await curlUnzip(
      `https://github.com/agda/agda-stdlib/archive/v${opts.stdlib}.zip`,
      `${home}/agda-${opts.stdlib}.zip`
    );
    await append(
      `${home}/.agda/libraries`,
      `${home}/agda-stdlib-${opts.stdlib}/standard-library.agda-lib`
    );
  });

  // Install libraries
  core.group('Installing user-supplied libraries...', async () => {
    for (const l of Object.values(opts.libraries)) {
      core.info(`Library: ${JSON.stringify(l)}`);
      await curlUnzip(
        `https://github.com/${l.user}/${l.repo}/archive/master.zip`,
        `${home}/${l.repo}-master.zip`
      );
      await append(
        `${home}/.agda/libraries`,
        `${home}/${l.repo}-master/${l.repo}.agda-lib`
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
  await c.saveCache(paths, key);

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
})().catch(err => core.setFailed(err.message));
