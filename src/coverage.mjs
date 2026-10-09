const sections = new Set(['boundaries','domain','behavior','assurance']);
const statuses = new Set(['modelled','unknown','not-applicable']);
const presentations = new Set(['embed','link']);
const kinds = new Set(['c4-system-context','c4-container','domain-class','sequence','state-lifecycle','data-lineage','runtime-deployment']);
const profileKinds = new Set(['c4-system-context','c4-container','domain-class','sequence','state-lifecycle','data-lineage']);

function fail(message) { throw Error(`Invalid coverage: ${message}`); }
function object(value, name) {
  if (!value || Array.isArray(value) || typeof value !== 'object') fail(`${name} must be an object`);
  return value;
}
function text(value, name) {
  if (typeof value !== 'string' || !value.trim()) fail(`${name} must be a non-empty string`);
  return value;
}
function evidenceReferences(value, sources, perspectiveId) {
  if (!Array.isArray(value) || value.length === 0) fail(`${perspectiveId}.evidence must be a non-empty array`);
  return value.map((reference, index) => {
    const ref = typeof reference === 'string' ? {id: reference} : object(reference, `${perspectiveId}.evidence[${index}]`);
    const id = text(ref.id, `${perspectiveId}.evidence[${index}].id`);
    const source = sources[id];
    if (!source) fail(`${perspectiveId} references missing evidence ${id}`);
    if (ref.type !== undefined) {
      text(ref.type, `${perspectiveId}.evidence[${index}].type`);
      if (source.type !== ref.type) fail(`${perspectiveId} evidence ${id} has type ${source.type || 'unspecified'}, expected ${ref.type}`);
    }
    return {id, type: ref.type};
  });
}
function c4Views(dsl) {
  const views = new Map();
  for (const match of dsl.matchAll(/^\s*(systemContext|container)\s+\w+\s+"([^"]+)"/gm)) {
    views.set(match[2], match[1] === 'systemContext' ? 'c4-system-context' : 'c4-container');
  }
  return views;
}

export function detectPlantUmlKind(text) {
  const body = text.replace(/^'.*$/gm, '');
  if (/\b(class|interface|enum|entity)\b/.test(body)) return 'domain-class';
  if (/\[\*\]\s*-->|^\s*state\s+["\w]/m.test(body)) return 'state-lifecycle';
  if (/^\s*(component|rectangle|cloud|node|folder|frame|package|artifact)\b/m.test(body)) return 'data-lineage';
  if (/\b(actor|participant|database|boundary|control|entity)\b|--?>/.test(body)) return 'sequence';
  return null;
}

export function coverageSummary(coverage) {
  if (!coverage) return null;
  const counts = {modelled: 0, unknown: 0, 'not-applicable': 0};
  for (const perspective of coverage.perspectives) counts[perspective.status] += 1;
  return {
    profile: coverage.profile,
    audiences: coverage.audiences,
    perspectives: coverage.perspectives.length,
    counts,
    state: counts.unknown || counts['not-applicable'] ? 'complete-with-unknowns' : 'complete'
  };
}

export function validateCoverage(coverage, {manifest, dsl, diagrams} = {}) {
  object(coverage, 'coverage');
  if (coverage.schema !== 1) fail('unsupported schema');
  if (coverage.profile !== 'software-current-state') fail('profile must be software-current-state');
  if (!Array.isArray(coverage.audiences) || coverage.audiences.length === 0) fail('audiences must be a non-empty array');
  const audiences = new Set(coverage.audiences.map((audience, index) => text(audience, `audiences[${index}]`)));
  for (const required of ['project-author','maintainer-agent']) if (!audiences.has(required)) fail(`profile requires audience ${required}`);
  if (!Array.isArray(coverage.perspectives)) fail('perspectives must be an array');
  const ids = new Set(), modelledKinds = new Set(), concerns = new Set(), views = c4Views(dsl || '');
  const sources = manifest?.sources || {};
  const normalized = coverage.perspectives.map((perspective, index) => {
    object(perspective, `perspectives[${index}]`);
    const id = text(perspective.id, `perspectives[${index}].id`);
    if (ids.has(id)) fail(`duplicate perspective id ${id}`);
    ids.add(id);
    if (!sections.has(perspective.section)) fail(`${id}.section is invalid`);
    text(perspective.question, `${id}.question`);
    if (!kinds.has(perspective.kind)) fail(`${id}.kind is invalid`);
    if (!statuses.has(perspective.status)) fail(`${id}.status is invalid`);
    if (!presentations.has(perspective.presentation)) fail(`${id}.presentation is invalid`);
    const evidence = evidenceReferences(perspective.evidence, sources, id);
    const perspectiveConcerns = perspective.concerns || [];
    if (!Array.isArray(perspectiveConcerns)) fail(`${id}.concerns must be an array`);
    for (const concern of perspectiveConcerns) concerns.add(text(concern, `${id}.concerns`));
    if (perspective.status === 'modelled') {
      object(perspective.artifact, `${id}.artifact`);
      const artifact = perspective.artifact;
      if (artifact.type === 'structurizr') {
        const viewKey = text(artifact.viewKey, `${id}.artifact.viewKey`);
        if (!views.has(viewKey)) fail(`${id} references missing C4 view ${viewKey}`);
        if (views.get(viewKey) !== perspective.kind) fail(`${id} C4 view ${viewKey} is ${views.get(viewKey)}, not ${perspective.kind}`);
        if (perspective.presentation !== 'link') fail(`${id} C4 presentation must be link`);
      } else if (artifact.type === 'plantuml') {
        const file = text(artifact.file, `${id}.artifact.file`);
        if (!diagrams?.[file]) fail(`${id} references missing UML ${file}`);
        if (perspective.kind.startsWith('c4-') || perspective.kind === 'runtime-deployment') fail(`${id} cannot use PlantUML for ${perspective.kind}`);
        const detected = detectPlantUmlKind(diagrams[file]);
        if (detected !== perspective.kind) fail(`${id} UML ${file} renders as ${detected || 'unknown'}, not ${perspective.kind}`);
      } else fail(`${id}.artifact.type must be structurizr or plantuml`);
      modelledKinds.add(perspective.kind);
    } else {
      text(perspective.reason, `${id}.reason`);
      text(perspective.revisitWhen, `${id}.revisitWhen`);
      if (perspective.artifact !== undefined) fail(`${id} ${perspective.status} perspective must not declare an artifact`);
    }
    return {...perspective, evidence};
  });
  for (const required of profileKinds) if (!modelledKinds.has(required)) fail(`profile requires a modelled ${required} perspective`);
  for (const concern of ['failure','recovery']) if (!concerns.has(concern)) fail(`profile requires ${concern} concern`);
  return {schema: coverage.schema, profile: coverage.profile, audiences: [...audiences], perspectives: normalized};
}

export function verifyRenderedCoverage(coverage, diagrams, renderedSvgs) {
  if (!coverage) return;
  for (const perspective of coverage.perspectives) {
    if (perspective.status !== 'modelled' || perspective.artifact.type !== 'plantuml') continue;
    const file = perspective.artifact.file;
    const svg = renderedSvgs[file];
    if (!svg || !svg.includes('<svg')) fail(`${perspective.id} has no rendered SVG for ${file}`);
    const actual = detectPlantUmlKind(diagrams[file]);
    if (actual !== perspective.kind) fail(`${perspective.id} rendered UML ${file} is ${actual || 'unknown'}, not ${perspective.kind}`);
  }
}
