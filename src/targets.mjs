import {validateRefs} from './checks.mjs';
import {validateCoverage} from './coverage.mjs';
import {validateDomainModel, renderDomainModel} from './domain-model.mjs';

// Targets own representation; the workbench owns publication and review.
const targets = {
  'software-architecture': {
    id: 'software-architecture', modelKey: 'workspace', native: true,
    validateTargetModel({manifest, dsl, diagrams, root, options, coverage}) {
      validateRefs(manifest, dsl, diagrams, root, options);
      return {manifest, coverage: coverage ? validateCoverage(coverage, {manifest, dsl, diagrams}) : null};
    },
    renderTarget(context) { return context.renderSoftware(); }
  },
  'domain-model': {
    id: 'domain-model', modelKey: 'model', native: false,
    validateTargetModel({manifest, model, root, options, coverage}) {
      if (coverage) throw Error('domain-model uses model views and explicit unknowns, not software coverage');
      return {manifest: validateDomainModel(model, manifest, root, options), coverage: null};
    },
    renderTarget(context) { return renderDomainModel(context); }
  }
};

export function getTarget(name = 'software-architecture') {
  if (!Object.hasOwn(targets, name)) throw Error(`Unknown drawing target: ${name}`);
  return targets[name];
}
