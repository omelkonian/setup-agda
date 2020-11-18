import {join} from 'path';
import * as fs from 'fs';

import * as core from '@actions/core';
import * as c from '@actions/cache';
import deploy from '@jamesives/github-pages-deploy-action';

import {getOpts, showLibs} from './opts';
import {spawnSync} from 'child_process';

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
    const restoreKeys = [
      `Agda-v${opts.agda}-stdlib-v${opts.stdlib}-${showLibs(opts.libraries)}`,
      `Agda-v${opts.agda}-stdlib-v${opts.stdlib}`,
      `Agda-v${opts.agda}`
    ];
    const paths = [`${home}/.stack`, `${cur}/.stack-work`, `${cur}/_build/`];

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

    core.info('Loading cache');
    const k = await c.restoreCache(paths, key, restoreKeys);
    core.info(`Done: ${k}`);

    core.info(`Installing Agda-v${opts.agda}`);
    const {output} = spawnSync(`\
    curl -L https://github.com/agda/agda/archive/v${opts.agda}.zip -o ${home}/agda-${opts.agda}.zip && \
    zip -qq ${home}/agda-${opts.agda}.zip -d ${home} && \
    cd ${home}/agda-${opts.agda} && \
    stack install --stack-yaml=stack-${ghc}.yaml \
    `);
    core.info(`Done: ${output}`);
    fs.accessSync(`${home}/.local/bin/agda`);
    core.addPath(`${home}/.local/bin/`);

    core.info('Saving cache');
    const sc = c.saveCache(paths, key);
    core.info(`Done: ${sc}`);

    core.info(`Installing stdlib-v${opts.stdlib}`);
    const {output: out1} = spawnSync(`\
    curl -L https://github.com/agda/agda-stdlib/archive/v${opts.stdlib}.zip -o ${home}/agda-stdlib-${opts.stdlib}.zip && \
    unzip -qq agda-stdlib-${opts.stdlib}.zip -d ${home} && \
    echo "${home}/agda-stdlib-${opts.stdlib}/standard-library.agda-lib" >> ${home}/.agda/libraries \
    `);
    core.info(`Done(1): ${out1}`);
    fs.accessSync(libsDir);

    core.info('Making libraries');
    fs.mkdirSync(libsDir, {recursive: true});
    for (const l of Object.values(opts.libraries)) {
      core.info(`Library: ${JSON.stringify(l)}`);
      const {output: out2} = spawnSync(`\
      curl -L https://github.com/${l.user}/${l.repo}/archive/master.zip -o ${home}/${l.repo}-master.zip && \
      unzip -qq ${home}/${l.repo}-master.zip -d ${home} && \
      echo "${home}/${l.repo}-master/${l.repo}.agda-lib" >> ${home}/.agda/libraries \
      `);
      core.info(`Done(2): ${out2}`);
      fs.accessSync(`${home}/${l.repo}-master/${l.repo}.agda-lib`);
    }

    if (!opts.build) return;

    core.info('Writing css file');
    fs.mkdirSync(cssDir, {recursive: true});
    fs.writeFileSync(css, agdaCss);
    fs.accessSync(css);

    core.info('Making site');
    const {output: out3} = spawnSync(`\
    agda --html --html-dir=${htmlDir} --css=${css} ${opts.main}.agda && \
    cp ${htmlDir}/${opts.main}.html ${htmlDir}/index.html \
    `);
    core.info(`Done(3): ${out3}`);
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
