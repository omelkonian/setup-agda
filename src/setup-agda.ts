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

async function main(): Promise<void> {
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

  type Task = Promise<void>;
  const curlUnzip = async (src: string, dest: string): Promise<string | void> =>
    tc.downloadTool(src, dest).then(p => tc.extractZip(p, home));
  const append = async (src: string, dest: string): Task =>
    promisify(fs.appendFile)(src, dest);

  // Restore caches
  async function step0(): Task {
    const keyRestored = await c.restoreCache(paths, key, []);
    core.info(`Cache key restored: ${keyRestored}`);
  }

  // Install Agda and its standard library
  async function step1(): Task {
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
  }

  // Install Agda's stdlib
  async function step2(): Task {
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
  }

  // Install libraries
  async function step3(): Task {
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
  }

  // Build current Agda project
  const htmlDir = 'site';
  async function step4(): Task {
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
  }

  // Save caches
  async function step5(): Task {
    const keySaved = await c.saveCache(paths, key);
    core.info(`Cache key saved: ${keySaved}`);
  }

  // Deploy Github page with Agda HTML code rendered in HTML
  async function step6(): Task {
    if (opts.build && opts.token)
      // && opts.deployOn.split(':') == [opts.agda, opts.stdlib])
      deploy({
        accessToken: opts.token,
        branch: opts.deployBranch,
        folder: htmlDir,
        silent: true,
        workspace: cur
      });
  }

  return step0()
    .then(step1)
    .then(step2)
    .then(step3)
    .then(step4)
    .then(step5)
    .then(step6);
}

main().catch(err => core.setFailed(err.message));
