// *** Hard-coded parameters for setup-haskell ***
import runHS from 'setup-haskell';

(async () => {
  await runHS({'ghc-version': '8.6.5'});
})();
// **********************************************
