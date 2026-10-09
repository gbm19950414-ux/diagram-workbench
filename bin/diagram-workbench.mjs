#!/usr/bin/env node
import {createWorkbench,initializeProject} from '../src/workbench.mjs';
import {readerCLI} from '../src/reader-package.mjs';
const args=process.argv.slice(2);
function option(name) {const i=args.indexOf(name);if(i<0)return undefined;if(!args[i+1]||args[i+1].startsWith('--'))throw Error(`Missing value: ${name}`);return args.splice(i,2)[1];}
try {
  if(['reader-model','reader-package'].includes(args[0])) await readerCLI(args);
  else if(args.includes('--help'))console.log('diagram-workbench <init|setup|status|review|build|check|preview|reader-model|reader-package> --project <root> [--config diagram.config.json]\n\ninit options: [--title <project title>] [--target software-architecture|domain-model]');
  else {
    const project=option('--project'),config=option('--config'),command=args[0];
    if(command==='init') {const title=option('--title'),target=option('--target');if(args.length!==1)throw Error('Use init --project <root> [--config diagram.config.json] [--title <project title>]');await initializeProject({project,config,title,target});}
    else {const workbench=await createWorkbench({project,config});await workbench.main(args);}
  }
} catch(error) {console.error(error.message);process.exitCode=1;}
