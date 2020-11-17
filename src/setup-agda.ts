import {join} from 'path';
import * as fs from 'fs';
import {promisify} from 'util';

import * as core from '@actions/core';
import * as io from '@actions/io';
import * as c from '@actions/cache';
import {exec} from '@actions/exec';
import deploy from '@jamesives/github-pages-deploy-action';

import {getOpts, showLibs} from './opts';

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
    const ghc = '8.6.5';
    const htmlDir = 'site';
    const cssDir = join(htmlDir, 'css');
    const css = join(cssDir, 'Agda.css');
    // const css = opts.css ? `../${opts.css}` : agdaCss;
    const libsDir = join(home, '.agda');

    // Cache parameters
    const key = `\
    Agda-v${opts.agda}\
    -stdlib-v${opts.stdlib}\
    -${showLibs(opts.libraries)}\
    -${repo}\
    `;
    const paths = [`${home}/.stack`, `${cur}/.stack-work`, `${cur}/_build/`];

    // Constants
    const Makefile = `
.phony: agda lib site 

agda: ${home}/.local/bin/agda

${home}/.local/bin/agda:
\tcurl -L https://github.com/agda/agda/archive/v${opts.agda}.zip -o ${home}/agda-${opts.agda}.zip
\tunzip -qq ${home}/agda-${opts.agda}.zip -d ${home}
\tcd ${home}/agda-${opts.agda} && stack install --stack-yaml=stack-${ghc}.yaml
\tcurl -L https://github.com/agda/agda-stdlib/archive/v${opts.stdlib}.zip -o ${home}/agda-stdlib-${opts.stdlib}.zip
\tunzip -qq ${home}/agda-stdlib-${opts.stdlib}.zip -d ${home}
\techo "${home}/agda-stdlib-${opts.stdlib}/standard-library.agda-lib" >> ${libsDir}/libraries

lib: ${home}/$(GIT_REPO)-master/$(GIT_REPO).agda-lib

${home}/$(GIT_REPO)-master/$(GIT_REPO).agda-lib:
\tcurl -L https://github.com/$(GIT_USER)/$(GIT_REPO)/archive/master.zip -o ${home}/$(GIT_REPO)-master.zip
\tunzip -qq ${home}/$(GIT_REPO)-master.zip -d ${home}
\techo "${home}/$(GIT_REPO)-master/$(GIT_REPO).agda-lib" >> ${libsDir}/libraries

site: ${htmlDir}/index.html

${htmlDir}/index.html:
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

    const make = async (target: string): Promise<void> => {
      exec('make', [target]);
    };
    const cacheLoad = async (): Promise<void> => {
      c.restoreCache(paths, key, []);
    };
    const cacheSave = async (): Promise<void> => {
      c.saveCache(paths, key);
    };
    async function makeLibs(): Promise<void> {
      await io.mkdirP(libsDir);
      for (const l of Object.values(opts.libraries)) {
        core.info(`Library: ${JSON.stringify(l)}`);
        core.exportVariable('GIT_USER', l.user);
        core.exportVariable('GIT_REPO', l.repo);
        await make('lib');
      }
    }
    async function sequence(tasks: Array<Promise<void>>): Promise<void> {
      tasks.reduce(async (acc, k) => acc.finally(async () => k));
    }

    core.addPath(`${home}/.local/bin/`);
    await sequence([
      cacheLoad(),
      promisify(fs.writeFile)('Makefile', Makefile),
      make('agda'),
      cacheSave(),
      makeLibs(),
      io.mkdirP(cssDir),
      promisify(fs.writeFile)(join(cssDir, 'Agda.css'), agdaCss),
      make('site'),
      deploy({
        accessToken: opts.token,
        branch: opts.deployBranch,
        folder: htmlDir,
        silent: true,
        workspace: cur
      })
    ]);
  } catch (error) {
    core.setFailed(error.message);
  }
})();
