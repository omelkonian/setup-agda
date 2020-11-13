import * as core from '@actions/core';
import {getOpts} from './opts';
import type {Version, GitUser, GitRepo, Options} from './opts';
import {exec} from '@actions/exec';

(async () => {
  try {
    core.info('Preparing to setup a Agda environment');
    const opts: Options = getOpts();
    const ghc: Version = '8.6.5';

    // Install stack
    await exec(`\
    mkdir -p $HOME/.local/bin && \
    export PATH=$HOME/.local/bin:$PATH && \ 
    curl -L https://www.stackage.org/stack/linux-x86_64 | tar xz --wildcards --strip-components=1 -C $HOME/.local/bin '*/stack' \
    `);

    // Install Agda
    await exec(`\
    curl -L https://github.com/agda/agda/archive/v${opts.agda}.zip -o $HOME/agda-${opts.agda}.zip && \
    unzip -qq $HOME/agda-${opts.agda}.zip -d $HOME && \
	  cd $HOME/agda-${opts.agda}; && \
    stack install --stack-yaml=stack-${ghc}.yaml && \
	  mkdir -p $HOME/.agda \
    `);

    // Install stdlib
    await exec(`\
    curl -L https://github.com/agda/agda-stdlib/archive/v${opts.stdlib}.zip -o $HOME/agda-stdlib-${opts.stdlib}.zip && \
    unzip -qq $HOME/agda-stdlib-${opts.stdlib}.zip -d $HOME \
	  echo "$HOME/agda-stdlib-${opts.stdlib}/standard-library.agda-lib" >> $HOME/.agda/libraries
    `);

    // Install libraries
    Object.values(opts.libraries).forEach(async l => {
      core.info(`GitUser: ${l[0]}, GitRepo: ${l[1]}`);
      const user: GitUser = l[0];
      const repo: GitRepo = l[1];
      await exec(`\
	    curl -L https://github.com/${user}/${repo}/archive/master.zip -o $(HOME)/${repo}-master.zip && \
	    unzip -qq $HOME/${repo}-master.zip -d $HOME && \
	    echo "$HOME/${repo}-master/${repo}.agda-lib" >> $HOME/.agda/libraries \
      `);
    });
  } catch (error) {
    core.setFailed(error.message);
  }
})();
