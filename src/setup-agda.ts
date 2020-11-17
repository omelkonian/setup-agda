import {join} from 'path';
import * as fs from 'fs';
import {promisify} from 'util';

import * as core from '@actions/core';
import * as io from '@actions/io';
import * as c from '@actions/cache';
import {exec} from '@actions/exec';
import deploy from '@jamesives/github-pages-deploy-action';

import {getOpts, showLibs, Library} from './opts';

(async () => {
  try {
    core.info('Preparing to setup an Agda environment...');
    const home = `${process.env.HOME}`;
    const cur = `${process.env.GITHUB_WORKSPACE}`;
    const repo = `${process.env.GITHUB_REPOSITORY}`;
    const opts = getOpts();
    core.info(`
    HOME: ${home}
    GITHUB_WORKSPACE: ${cur}
    REPO: ${repo}
    DIRNAME: ${__dirname}
    Options: ${JSON.stringify(opts)}
    `);
    const htmlDir = 'site';
    const cssDir = join(htmlDir, 'css');
    const css = join(cssDir, 'Agda.css');
    // const css = opts.css ? `../${opts.css}` : agdaCss;
    const libsDir = join(home, '.agda');

    // Cache parameters
    const key = `Agda-v${opts.agda}-stdlib-v${opts.stdlib}-${showLibs(
      opts.libraries
    )}-${repo}`;
    const paths = [`${home}/.stack`, `${cur}/.stack-work`, `${cur}/_build/`];

    // Constants
    const Makefile = `
.phony: agda lib site 

agda:
\tcurl -L https://github.com/agda/agda/archive/v${opts.agda}.zip -o ${home}/agda-${opts.agda}.zip
\tunzip -qq ${home}/agda-${opts.agda}.zip -d ${home}
\tcd ${home}/agda-${opts.agda} && stack install --stack-yaml=stack-$(GHC).yaml
\tcurl -L https://github.com/agda/agda-stdlib/archive/v${opts.stdlib}.zip -o ${home}/agda-stdlib-${opts.stdlib}.zip
\tunzip -qq ${home}/agda-stdlib-${opts.stdlib}.zip -d ${home}
\techo "${home}/agda-stdlib-${opts.stdlib}/standard-library.agda-lib" >> ${libsDir}/libraries

lib: 
\tcurl -L https://github.com/$(GIT_USER)/$(GIT_REPO)/archive/master.zip -o ${home}/$(GIT_REPO)-master.zip
\tunzip -qq ${home}/$(GIT_REPO)-master.zip -d ${home}
\techo "${home}/$(GIT_REPO)-master/$(GIT_REPO).agda-lib" >> ${libsDir}/libraries

site:
\tagda --html --html-dir=${htmlDir} --css=${css} ${opts.main}.agda
\tcp ${htmlDir}/${opts.main}.html ${htmlDir}/index.html
`;

    const agdaCss = `
/* Aspects. */
.Agda .Comment       { color: #B22222 }
.Agda .Background    {}
.Agda .Markup        { color: #000000 }
.Agda .Keyword       { color: #CD6600 }
.Agda .String        { color: #B22222 }
.Agda .Number        { color: #A020F0 }
.Agda .Symbol        { color: #404040 }
.Agda .PrimitiveType { color: #0000CD }
.Agda .Pragma        { color: black   }
.Agda .Operator      {}

/* NameKinds. */
.Agda .Bound                  { color: black   }
.Agda .Generalizable          { color: black   }
.Agda .InductiveConstructor   { color: #008B00 }
.Agda .CoinductiveConstructor { color: #8B7500 }
.Agda .Datatype               { color: #0000CD }
.Agda .Field                  { color: #EE1289 }
.Agda .Function               { color: #0000CD }
.Agda .Module                 { color: #A020F0 }
.Agda .Postulate              { color: #0000CD }
.Agda .Primitive              { color: #0000CD }
.Agda .Record                 { color: #0000CD }

/* OtherAspects. */
.Agda .DottedPattern      {}
.Agda .UnsolvedMeta       { color: black; background: yellow         }
.Agda .UnsolvedConstraint { color: black; background: yellow         }
.Agda .TerminationProblem { color: black; background: #FFA07A        }
.Agda .IncompletePattern  { color: black; background: #F5DEB3        }
.Agda .Error              { color: red;   text-decoration: underline }
.Agda .TypeChecks         { color: black; background: #ADD8E6        }
.Agda .Deadcode           { color: black; background: #808080        }

/* Standard attributes. */
.Agda a { text-decoration: none }
.Agda a[href]:hover { background-color: #B4EEB4 }

/* Fonts */
@font-face {
  font-family: 'mononoki';
  src: url('mononoki.woff2') format('woff2'),
      url('mononoki.woff') format('woff');
}
@font-face {
  font-family: 'DejaVu Sans Mono';
  src: url('DejaVuSansMono.woff2') format('woff2'),
      url('DejaVuSansMono.woff') format('woff');
  font-weight: normal;
  font-style: normal;
}
pre.Agda {
  font-family: 'mononoki';
  font-size: .85em;
}
`;

    async function writeMakefile(): Promise<void> {
      await promisify(fs.writeFile)('Makefile', Makefile);
    }
    async function writeCss(): Promise<void> {
      await io.mkdirP(cssDir);
      await promisify(fs.writeFile)(join(cssDir, 'Agda.css'), agdaCss);
    }

    async function make(target: string, args?: string[]): Promise<void> {
      await exec(
        'make',
        [
          target
          // `H="${home}" GHC="8.6.5" AGDA="${opts.agda}" STDLIB="${opts.stdlib}" HTML_DIR="${htmlDir}" CSS="${css}"`
        ].concat(args || [])
      );
    }
    async function makeAgda(): Promise<void> {
      await writeMakefile().then(async () => make('agda'));
    }
    async function makeLib(l: Library): Promise<void> {
      core.exportVariable('GIT_USER', l.user);
      core.exportVariable('GIT_REPO', l.repo);
      await make('lib');
    }
    async function makeSite(): Promise<void> {
      await writeCss().then(async () => make('site'));
    }

    // Restore cache
    await c.restoreCache(paths, key, []);

    // Add ~/.local/bin to PATH
    core.addPath(`${home}/.local/bin/`);

    // Install Agda and its standard library
    core.group(
      `Installing Agda-v${opts.agda} and stdlib-v${opts.stdlib}`,
      makeAgda
    );

    // Install libraries
    core.group('Installing user-supplied libraries...', async () => {
      await io.mkdirP(libsDir);
      for (const l of Object.values(opts.libraries)) {
        core.info(`Library: ${JSON.stringify(l)}`);
        makeLib(l);
      }
    });

    // Copy default CSS file here

    // Build current Agda project
    if (opts.build)
      core.group(
        `Building Agda project with main file: ${opts.main}`,
        makeSite
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
  } catch (error) {
    core.setFailed(error.message);
  }
})();
