// Entry point for the standalone SEA executable.
//
// In a Single Executable Application the script is embedded in the binary, so
// `process.argv[1]` is undefined and `cli/index.ts`'s own self-invoke guard never
// fires. This wrapper is therefore the single invocation of the CLI.
import { main } from '../cli/index';

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
