import {basename, join} from 'path';
import * as fs from 'fs';
import spawnAsync from '@expo/spawn-async';

import * as core from '@actions/core';
import * as io from '@actions/io';
import * as c from '@actions/cache';
import * as glob from '@actions/glob';
import * as tc from '@actions/tool-cache';
import deploy from '@jamesives/github-pages-deploy-action';
import {action} from '@jamesives/github-pages-deploy-action/lib/constants';

import {getOpts, showLibs} from './opts';

(async () => {
  try {
    core.info('Preparing to setup an Agda environment...');
    const home = process.env.HOME;
    const cur = process.env.GITHUB_WORKSPACE;
    const repo = process.env.GITHUB_REPOSITORY;
    const curBranch =
      process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME;
    const opts = getOpts();
    const {agda, stdlib, dir, main, libraries} = opts;
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
    const libsv = showLibs(libraries);

    const downloads = join(home, 'downloads');

    const libsDir = join(home, '.agda');
    const libsPath = join(libsDir, 'libraries');

    const cabalBin = join(home, '.cabal/bin');
    core.addPath(cabalBin);
    const cabal = (opt: 0 | 1 | 2): string =>
      `cabal install --overwrite-policy=always --ghc-options='-O${opt} +RTS -M6G -RTS'`;

    // Cache parameters
    const keys = [agdav, stdlibv, libsv];
    const key = keys.join('-');
    const restoreKeys = [
      keys.slice(0, 4).join('-') + '-',
      keys.slice(0, 3).join('-') + '-',
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
      '_build'
    ];

    async function sh(...cmds: string[]): Promise<void> {
      core.debug(`$ ${cmds.join(' && ')}...`);
      await spawnAsync(cmds.join(' && '), [], {shell: true, stdio: 'inherit'});
      core.debug('...done');
    }

    async function curlUnzip(
      title: string,
      src: string,
      dest: string,
      lib?: string
    ): Promise<void> {
      core.info(`Downloading ${title}...`);
      try {
        fs.accessSync(dest);
        core.info('...found in cache');
      } catch {
        await sh(
          `curl -L ${src} -o ${dest}.zip`,
          `unzip -qq ${dest}.zip -d ${downloads}`,
          `export f=$(unzip -Z1 ${dest} | head -n1)`,
          `cd ${downloads}`,
          `[ -e ${dest} ] || mv "$f" ${dest}`
        );
        core.info('...done');
      }
      if (lib) await sh(`echo "${join(dest, lib)}" >> ${libsPath}`);
      // TODO Use tool-cache and cache libraries/local-builds as well..
    }

    core.info('Loading cache...');
    const cacheHit = await c.restoreCache(paths, key, restoreKeys);
    core.info(`...${cacheHit ? 'done' : 'not found'}`);

    await io.mkdirP(downloads);
    await io.mkdirP(libsDir);

    core.info(`Installing ${agdav}...`);
    const agdaExe = join(cabalBin, 'agda');
    const localDir = join(home, '.local/');
    const localBin = join(localDir, 'bin/');
    const agdaReleaseExe = join(localBin, 'agda');
    const localData = join(localDir, 'data/');

    try {
      fs.accessSync(agdaReleaseExe);
      core.info('...found in cache');
    } catch {
      try {
        fs.accessSync(agdaExe);
        core.info('...found in cabal cache');
      } catch {
        try {
          const getGhcVersion = (v: string): string => {
            switch (v) {
              case '2.6.4.1':
                return '9.4.7';
              case '2.6.4':
                return '9.6.3';
              case '2.6.3':
                return '9.4.4';
              case '2.6.2.2':
                return '9.2.4';
              case '2.6.2.1':
                return '9.0.2';
              case '2.6.2':
                return '9.0.2';
              case '2.6.1.3':
                return '8.10.7';
              case '2.6.0.1':
                return '8.6.5';
              case '2.5.4.2':
                return '8.4.4';
              case '2.5.3':
                return '8.2.2';
              default:
                return '';
            }
          };
          const ghcVersion = getGhcVersion(agda);
          const arc = await tc.downloadTool(
            `https://github.com/wenkokke/setup-agda/releases/download/latest/agda-${agda}-x64-ubuntu-20.04-ghc${ghcVersion}-icu66.1.zip`
          );
          await tc.extractZip(arc, localDir);
          await sh(`chmod +x ${agdaReleaseExe}`);
          fs.accessSync(agdaReleaseExe);
          core.exportVariable('Agda_datadir', localData);
          core.info('...found released binary');
        } catch {
          const agdaURL = `https://github.com/agda/agda/archive/v${agda}.zip`;
          const agdaDir = join(downloads, `agda-${agda}`);
          try {
            await curlUnzip(agdav, agdaURL, agdaDir);
            await sh(`sudo apt-get install agda-${agda}`);
            fs.accessSync(agdaReleaseExe);
            core.info('...found released Ubuntu package');
          } catch {
            await sh(
              `cabal update`,
              `${cabal(2)} alex-3.2.5`,
              `${cabal(2)} happy-1.19.12`
            );
            await sh(
              `cd ${agdaDir}`,
              `mkdir -p doc`,
              `touch doc/user-manual.pdf`,
              `${cabal(1)}`
            );
            core.info('...done');
          }
        }
      }
    }
    await sh(`agda --version`); // make sure we got the correct Agda version installed

    await io.rmRF(libsPath); // reset library versions
    // TODO: cleanup old library versions

    const stdlibURL = `https://github.com/agda/agda-stdlib/archive/v${stdlib}.zip`;
    const stdlibDir = join(downloads, `agda-stdlib-${stdlib}`);
    await curlUnzip(stdlibv, stdlibURL, stdlibDir, 'standard-library.agda-lib');

    for (const l of Object.values(libraries)) {
      const libURL = `https://github.com/${l.user}/${l.repo}/archive/${l.version}.zip`;
      const libDir = join(downloads, `${l.repo}-${l.version}`);
      await curlUnzip(
        `library ${l.user}/${l.repo}#${l.version} from Github`,
        libURL,
        libDir,
        `${l.repo}.agda-lib`
      );
    }

    if (!opts.build) return;

    core.info('Writing css files');
    const htmlDir = 'site';
    const cssDir = join(htmlDir, 'css');
    const cssFile = opts.css ? basename(opts.css) : 'Agda.css';
    await io.mkdirP(cssDir);

    if (opts.css) await io.mv(join(cur, opts.css), cssDir);
    else await io.mv(join(__dirname, 'css'), htmlDir);

    core.info(
      `Building Agda project${opts.deploy ? ' and generating HTML' : ''}`
    );
    const mainHtml = main.split('/').join('.');
    const rtsOpts = opts.rts ? `+RTS ${opts.rts} -RTS` : '';
    const htmlOpts = opts.deploy
      ? `--html --html-dir=${htmlDir} --css=css/${cssFile}`
      : '';
    const agdaCmd = `agda ${rtsOpts} ${htmlOpts} ${dir}/${main}.agda`;
    await io.mv(join(__dirname, 'scripts'), '.');

    // Measure typechecking time (per module).
    if (opts.measureTypechecking)
      await sh(
        `./scripts/measureTypechecking.sh "${agdaCmd}" "${htmlDir}/typecheck.time"`
      );
    else await sh(agdaCmd);

    if (opts.deploy) {
      await io.cp(`${htmlDir}/${mainHtml}.html`, `${htmlDir}/index.html`);

      // Add Github ribbons to all HTML files
      if (opts.ribbon && opts.deploy) {
        const globber = await glob.create(`${htmlDir}/*.html`);
        for await (const f of globber.globGenerator()) {
          core.debug(`Generating ribbon for file: ${f}...`);
          const agdaFilename = f
            .replace(`/${htmlDir}/`, `/${dir}/`)
            .split('')
            .map(ch => (ch == '.' ? '/' : ch))
            .join('')
            .replace('/html', '.agda');
          core.debug(`- corresponding Agda file: ${agdaFilename}`);
          let fileURL;
          try {
            fs.accessSync(agdaFilename);
            fileURL = agdaFilename.replace(`${cur}/`, ''); // point to source file in repo
          } catch {
            fileURL = ''; // external dependency, point to repo's main page
          }
          core.debug(`- ribbon URL: ${fileURL}`);
          const ribbonCss = `<link rel='stylesheet' href='https://cdnjs.cloudflare.com/ajax/libs/github-fork-ribbon-css/0.2.3/gh-fork-ribbon.min.css'/>\
<style>.github-fork-ribbon:before { background-color: ${opts.ribbonColor}; }</style>`;
          const ribbon = `<a class='github-fork-ribbon'\
href='https://github.com/${repo}/tree/${curBranch}/${fileURL}'\
data-ribbon='${opts.ribbonMsg}' title='${opts.ribbonMsg}'>${opts.ribbonMsg}</a>`;
          await sh(
            `sed -i -e "s%</title>%</title>${ribbonCss}%g" -e "s%<body>%<body>${ribbon}%g" "${f}"`
          );
        }
      }
    }

    if (cacheHit != keys[0]) {
      core.info('Saving cache...');
      try {
        await c.saveCache(paths, key);
        core.info('...done');
      } catch (err) {
        const error = err as Error;
        if (error.name === c.ReserveCacheError.name)
          core.info(`...${error.message}`);
        else throw err;
      }
    }

    if (!opts.deploy) return;
    await deploy({
      ...action,
      branch: opts.deployBranch,
      folder: htmlDir,
      token: opts.token,
      repositoryName: repo,
      silent: true,
      workspace: cur
      // preserve: true
    });
  } catch (err) {
    const error = err as Error;
    core.setFailed(error.message);
  }
})();
