// *** Hard-coded parameters for setup-haskell ***
import runHS from 'setup-haskell/dist/lib';

(async () => {
  process.env['INPUT_GHC_VERSION'] = '8.6.5';
  await runHS();
})();
// **********************************************
