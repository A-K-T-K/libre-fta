import { XMLParser } from "fast-xml-parser";
import { parsedModelSchema, type ParsedEdge, type ParsedNode } from "./schema";
import type { GateType, EventKind, CcfGroup, CcfModel } from "@/types/fta";

const FORMULA_TAGS = new Set(["and", "or", "not", "xor", "atleast", "nand", "nor", "iff", "cardinality"]);
const REF_TAGS = new Set(["gate", "basic-event", "house-event", "event"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type XmlNode = any;

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function getAttr(node: XmlNode, name: string): string | undefined {
  return node?.[`@_${name}`];
}

interface Container {
  node: XmlNode;
  /** Dotted `<define-component>` name chain this container is nested
   * inside ("" at the top level, "t" one level in, "t.u" two levels, …). */
  scope: string;
}

/** `<define-component>` bodies allow the exact same
 * `event-definition | component-definition | parameter-definition |
 * CCF-group-definition` children as `<define-fault-tree>`/`<model-data>`
 * (and can nest arbitrarily deep) — so gates/events/parameters/CCF groups
 * declared inside one were previously invisible to every lookup in this
 * file, and any `<event>`/`<gate>` reference to them resolved to nothing.
 * Flattens a container plus every component nested inside it (recursively)
 * into one array, each tagged with its own scope, so names declared inside
 * a component don't collide with (or get silently overwritten by) a
 * same-named gate/event elsewhere in the model — real files do reuse names
 * across components deliberately (e.g. a "spare motor" component reusing
 * the same relay names as the primary one). */
function collectContainers(node: XmlNode, scope: string, acc: Container[]) {
  if (!node) return;
  acc.push({ node, scope });
  for (const comp of asArray(node["define-component"])) {
    const compName = getAttr(comp, "name") ?? "component";
    collectContainers(comp, scope ? `${scope}.${compName}` : compName, acc);
  }
}

/** A scope's own chain of lookup fallbacks, innermost first — `"t.u"` tries
 * `"t.u"`, then `"t"`, then `""` (global), matching normal lexical scoping:
 * a reference inside a component resolves to a same-named sibling defined
 * in that component first, falling back to an outer/global definition only
 * if the component doesn't define its own. */
function scopeChain(scope: string): string[] {
  const parts = scope ? scope.split(".") : [];
  const chain: string[] = [];
  for (let i = parts.length; i >= 0; i--) chain.push(parts.slice(0, i).join("."));
  return chain;
}

/** Internal map key for a name declared in `scope` — never exposed as a
 * node id/identifier (`::` isn't a legal identifier character), only used
 * to keep `gateSymbolId`/`eventDefs`/parameter lookups scope-aware. */
function scopedKey(scope: string, name: string): string {
  return scope ? `${scope}::${name}` : name;
}

/** Renders a scoped key as a valid Open-PSA identifier (letters/digits/`-`/`_`
 * only) — used once a name has actually been resolved to becomes a node's
 * `id`/`identifier`. */
function keyToIdentifier(key: string): string {
  return key.replace(/\./g, "_").replace(/::/g, "__");
}

/** Resolves a bare reference `name`, seen from `scope`, to whichever scoped
 * key it actually exists under in `map` — innermost enclosing scope wins,
 * falling back outward, matching `scopeChain`. */
function findScopedKey(map: { has(key: string): boolean }, scope: string, name: string): string | undefined {
  for (const s of scopeChain(scope)) {
    const key = scopedKey(s, name);
    if (map.has(key)) return key;
  }
  return undefined;
}

/** A reference name containing a `.` (e.g. `t.E1`) is Open-PSA MEF's
 * explicit qualified path INTO a component — an absolute address from the
 * model root, not a bare name to resolve relative to the referencing
 * scope's own lexical chain. Splits it into (component-chain, bare name)
 * and looks that up directly, ignoring `scope` entirely — otherwise a
 * dotted reference from outside a component to something declared inside
 * it (a "transfer-in") never resolves, and the app builds a dangling
 * placeholder gate literally named "t.E1" instead. */
function resolveReferenceKey(map: { has(key: string): boolean }, scope: string, rawName: string): string | undefined {
  const lastDot = rawName.lastIndexOf(".");
  if (lastDot === -1) return findScopedKey(map, scope, rawName);
  const qualifiedScope = rawName.slice(0, lastDot);
  const bareName = rawName.slice(lastDot + 1);
  const key = scopedKey(qualifiedScope, bareName);
  return map.has(key) ? key : undefined;
}

/** Resolves a generic `<event name="X"/>` reference, whose *kind*
 * (gate vs. basic/house event) isn't encoded in the tag itself. Proper
 * lexical scoping means the innermost scope that defines `X` *at all*
 * wins, regardless of which kind it defines it as — checking "is it a gate
 * anywhere in the chain" before "is it an event anywhere in the chain"
 * (as a naive two-pass check would) gets this backwards: a component-local
 * basic event can end up shadowed by an unrelated same-named *gate*
 * declared at the model's top level, purely because gates happened to be
 * checked first. Interleaving the two lookups scope-by-scope, innermost
 * first, is what actually matches Open-PSA MEF's own name resolution. */
function resolveAmbiguousRef(ctx: WalkContext, scope: string, name: string): { isGate: boolean; key: string } | undefined {
  const lastDot = name.lastIndexOf(".");
  if (lastDot !== -1) {
    const key = scopedKey(name.slice(0, lastDot), name.slice(lastDot + 1));
    if (ctx.gateSymbolId.has(key)) return { isGate: true, key };
    if (ctx.eventDefs.has(key)) return { isGate: false, key };
    return undefined;
  }
  for (const s of scopeChain(scope)) {
    const key = scopedKey(s, name);
    if (ctx.gateSymbolId.has(key)) return { isGate: true, key };
    if (ctx.eventDefs.has(key)) return { isGate: false, key };
  }
  return undefined;
}

/** Same qualified-vs-scope-relative distinction as `resolveReferenceKey`,
 * for the case where the reference didn't resolve to an existing
 * definition and a placeholder/implicit one needs to be registered under
 * the *correct* key regardless. */
function fallbackKey(scope: string, rawName: string): string {
  const lastDot = rawName.lastIndexOf(".");
  if (lastDot === -1) return scopedKey(scope, rawName);
  return scopedKey(rawName.slice(0, lastDot), rawName.slice(lastDot + 1));
}

interface EventDef {
  kind: EventKind;
  probability?: { value?: number; lambda?: number; booleanState?: boolean };
  description?: string;
  x?: number;
  y?: number;
}

function readAttributesExtension(node: XmlNode): { kind?: EventKind; x?: number; y?: number } {
  const attrsBlock = node?.attributes;
  const result: { kind?: EventKind; x?: number; y?: number } = {};
  if (!attrsBlock) return result;
  for (const a of asArray(attrsBlock.attribute)) {
    const name = getAttr(a, "name");
    const value = getAttr(a, "value");
    if (name === "fta-event-kind") result.kind = value as EventKind;
    if (name === "fta-x") result.x = Number(value);
    if (name === "fta-y") result.y = Number(value);
  }
  return result;
}

interface ParamEntry {
  node: XmlNode;
  scope: string;
}

/** Resolves a `<define-parameter>`'s expression to a single point value —
 * a plain `<float>`, a (scope-aware) indirection to another named
 * parameter, or a random-deviate collapsed to its central value (median
 * for lognormal, mean for normal, midpoint for uniform) since this app
 * doesn't do uncertainty propagation through parameter references, only
 * point-value analysis. `seen` guards against a reference cycle. */
function resolveParameterValue(paramDefs: Map<string, ParamEntry>, key: string, seen: Set<string>): number | undefined {
  if (seen.has(key)) return undefined;
  const entry = paramDefs.get(key);
  if (!entry) return undefined;
  seen.add(key);
  const { node, scope } = entry;
  if (node.float !== undefined) return Number(getAttr(node.float, "value") ?? node.float);
  if (node.parameter !== undefined) {
    const refName = getAttr(node.parameter, "name");
    const refKey = refName ? findScopedKey(paramDefs, scope, refName) : undefined;
    return refKey ? resolveParameterValue(paramDefs, refKey, seen) : undefined;
  }
  if (node["lognormal-deviate"] !== undefined) {
    return Number(getAttr(node["lognormal-deviate"].float?.[0] ?? node["lognormal-deviate"].float, "value"));
  }
  if (node["normal-deviate"] !== undefined) {
    return Number(getAttr(node["normal-deviate"].float?.[0] ?? node["normal-deviate"].float, "value"));
  }
  if (node["uniform-deviate"] !== undefined) {
    const floats = asArray(node["uniform-deviate"].float);
    const lo = Number(getAttr(floats[0], "value"));
    const hi = Number(getAttr(floats[1], "value"));
    return (lo + hi) / 2;
  }
  return undefined;
}

/** Parses every `<define-parameter>` across `containers` into a resolved
 * scoped-key -> point-value map, so basic events referencing them by name
 * (`<exponential><parameter name="X"/>...`) can look up a real number
 * instead of silently getting `NaN`. */
function parseParameterDefs(containers: Container[]): Map<string, number> {
  const raw = new Map<string, ParamEntry>();
  for (const { node: container, scope } of containers) {
    for (const p of asArray(container?.["define-parameter"])) {
      const name = getAttr(p, "name");
      if (name) raw.set(scopedKey(scope, name), { node: p, scope });
    }
  }
  const resolved = new Map<string, number>();
  for (const key of raw.keys()) {
    const v = resolveParameterValue(raw, key, new Set());
    if (v !== undefined) resolved.set(key, v);
  }
  return resolved;
}

/** `<exponential>` takes exactly two expression children: a rate and a
 * time to evaluate `P(t)=1-e^(-λt)` at — almost always a bare
 * `<system-mission-time/>`, but real periodic-test models sometimes scale
 * it, e.g. `<mul><int value="20"/><system-mission-time/></mul>` ("this
 * component's exposure window is 20× the mission time"). This app's
 * `ProbabilityModel` has no separate "time multiplier" field, but
 * `1-e^(-λ·(k·t))` and `1-e^(-(kλ)·t)` are exactly the same function, so
 * folding a constant multiplier into the lambda itself (rather than
 * needing a new field threaded through the whole engine) reproduces the
 * correct probability exactly. A `<mul>` of anything else (two parameters,
 * more than one non-constant factor, …) isn't representable this way and
 * is left as a 1x no-op rather than guessed at. */
function extractTimeMultiplier(body: XmlNode): number {
  const mul = body?.mul;
  if (mul === undefined) return 1;
  if (mul.int !== undefined) return Number(getAttr(mul.int, "value") ?? mul.int);
  if (mul.float !== undefined) return Number(getAttr(mul.float, "value") ?? mul.float);
  return 1;
}

function readProbability(defNode: XmlNode, paramValues: Map<string, number>, scope: string): EventDef["probability"] {
  if (defNode.float !== undefined) {
    const v = getAttr(defNode.float, "value") ?? defNode.float;
    return { value: Number(v) };
  }
  if (defNode["exponential"] !== undefined) {
    const body = defNode.exponential;
    const timeMultiplier = extractTimeMultiplier(body);
    if (body?.float !== undefined) return { lambda: Number(getAttr(body.float, "value") ?? body.float) * timeMultiplier };
    if (body?.parameter !== undefined) {
      const refName = getAttr(body.parameter, "name");
      const refKey = refName ? findScopedKey(paramValues, scope, refName) : undefined;
      const v = refKey ? paramValues.get(refKey) : undefined;
      if (v !== undefined) return { lambda: v * timeMultiplier };
    }
    return undefined;
  }
  if (defNode.constant !== undefined) {
    const v = getAttr(defNode.constant, "value");
    return { booleanState: v === "true" };
  }
  return undefined;
}

/** Reads a single expression's point value (a `<factor>`'s or CCF group's
 * `<distribution>`'s payload) — narrower than `readProbability` since these
 * are never house-event constants, just a plain float or a named-parameter
 * indirection. */
function readExpressionValue(node: XmlNode, paramValues: Map<string, number>, scope: string): number | undefined {
  if (node === undefined) return undefined;
  if (node.float !== undefined) return Number(getAttr(node.float, "value") ?? node.float);
  if (node.parameter !== undefined) {
    const refName = getAttr(node.parameter, "name");
    const refKey = refName ? findScopedKey(paramValues, scope, refName) : undefined;
    return refKey ? paramValues.get(refKey) : undefined;
  }
  return undefined;
}

const CCF_MODEL_FROM_TAG: Record<string, CcfModel | undefined> = {
  "beta-factor": "beta-factor",
  MGL: "mgl",
  "alpha-factor": "alpha-factor",
};

/** Parses every `<define-CCF-group>` across `containers` (top-level
 * siblings of `<define-fault-tree>`, or nested inside one/a component) into
 * this app's `CcfGroup` shape. Beta-factor, MGL, and alpha-factor are
 * modeled by the app's `CcfModel` union — `phi-factor` groups (legal per
 * the schema but not representable here) are skipped rather than imported
 * wrong. Member names are resolved through the group's own scope chain so
 * a group declared inside a component correctly targets that component's
 * own basic events rather than a same-named global one. */
function parseCcfGroups(containers: Container[], paramValues: Map<string, number>, eventDefs: Map<string, EventDef>): CcfGroup[] {
  const groups: CcfGroup[] = [];
  let counter = 0;
  for (const { node: container, scope } of containers) {
    for (const g of asArray(container?.["define-CCF-group"])) {
      const name = getAttr(g, "name");
      const model = CCF_MODEL_FROM_TAG[getAttr(g, "model") ?? ""];
      if (!name || !model) continue;

      const memberIdentifiers = asArray(g.members?.["basic-event"])
        .map((m: XmlNode) => getAttr(m, "name"))
        .filter((n: string | undefined): n is string => Boolean(n))
        .map((n: string) => keyToIdentifier(findScopedKey(eventDefs, scope, n) ?? scopedKey(scope, n)));

      const groupProbability = readProbability(g.distribution ?? {}, paramValues, scope) ?? {};

      let factors: number[];
      if (model === "beta-factor") {
        factors = [readExpressionValue(g.factor, paramValues, scope) ?? 0];
      } else {
        factors = asArray(g.factors?.factor ?? g.factor)
          .map((f: XmlNode) => ({ level: Number(getAttr(f, "level") ?? 0), value: readExpressionValue(f, paramValues, scope) ?? 0 }))
          .sort((a, b) => a.level - b.level)
          .map((f) => f.value);
      }

      groups.push({ id: `ccf-${++counter}`, name, model, memberIdentifiers, groupProbability, factors });
    }
  }
  return groups;
}

/** `<define-basic-event>`/`<define-house-event>`/`<define-parameter>` are
 * legal directly under `<define-fault-tree>` as well as inside a top-level
 * `<model-data>` (Open-PSA MEF's `event-definition`/`parameter-definition`
 * choice applies in both places) — small, single-file example models
 * commonly co-locate them with the tree instead of using `<model-data>` at
 * all. Every container is merged into one set of definitions so an event's
 * probability isn't silently missed just because of where its
 * `<define-basic-event>` happens to live in the file. */
function parseModelData(containers: Container[]): Map<string, EventDef> {
  const defs = new Map<string, EventDef>();
  const paramValues = parseParameterDefs(containers);

  for (const { node: container, scope } of containers) {
    if (!container) continue;
    for (const be of asArray(container["define-basic-event"])) {
      const name = getAttr(be, "name")!;
      const ext = readAttributesExtension(be);
      defs.set(scopedKey(scope, name), {
        kind: ext.kind ?? "basic",
        probability: readProbability(be, paramValues, scope),
        description: be.label,
        x: ext.x,
        y: ext.y,
      });
    }
    for (const he of asArray(container["define-house-event"])) {
      const name = getAttr(he, "name")!;
      const ext = readAttributesExtension(he);
      defs.set(scopedKey(scope, name), {
        kind: "house",
        probability: readProbability(he, paramValues, scope) ?? { booleanState: false },
        x: ext.x,
        y: ext.y,
      });
    }
  }
  return defs;
}

let syntheticCounter = 0;

interface WalkContext {
  nodes: ParsedNode[];
  edges: ParsedEdge[];
  eventDefs: Map<string, EventDef>;
  createdEventIds: Set<string>;
  /** Scoped key -> internal gate-symbol node id. */
  gateSymbolId: Map<string, string>;
  /** Bumped for every duplicate node instance created for a repeated event reference. */
  eventInstanceCounter: number;
}

/** Each *reference* to a basic/house event gets its own node instance, even
 * when the same name is referenced from multiple gates — matching how this
 * app already represents a shared event when a user builds one by hand
 * (separate boxes with the same identifier; see `FaultTreeCanvas.tsx`'s
 * `repeatedGroups`, which groups purely by `data.identifier` and drives the
 * "×N" badge / cross-highlight). A single shared node with edges fanning
 * out to multiple gates doesn't work here regardless — the layout
 * (`elkLayout.ts`) is a strict tree where every node has at most one
 * parent, so a node referenced by two gates would only ever get positioned
 * under one of them while the other's line points at a node that isn't
 * really part of its own subtree.
 *
 * `defKey` is the event definition's own resolved scoped key (where it was
 * *defined*, not necessarily the scope it's being *referenced* from), so
 * two references from different components to the same global/public event
 * correctly land on the same identifier instead of each minting their own. */
function ensureEventNode(ctx: WalkContext, defKey: string): string {
  const def = ctx.eventDefs.get(defKey);
  const identifier = keyToIdentifier(defKey);
  const isFirstOccurrence = !ctx.createdEventIds.has(defKey);
  const id = isFirstOccurrence ? identifier : `${identifier}__dup${++ctx.eventInstanceCounter}`;
  ctx.nodes.push({
    id,
    identifier,
    label: identifier,
    category: "event",
    eventKind: def?.kind ?? "basic",
    probability: def?.probability ?? { value: 1e-4 },
    description: def?.description,
    // Only the first instance gets the file's `fta-x`/`fta-y` position (a
    // name is only ever defined once); later instances fall through to the
    // auto-layout pass triggered whenever any node lacks a position.
    x: isFirstOccurrence ? def?.x : undefined,
    y: isFirstOccurrence ? def?.y : undefined,
  });
  ctx.createdEventIds.add(defKey);
  return id;
}

/** Creates the (box event, gate symbol) pair backing one `<define-gate>`.
 * `key` is the gate's own resolved scoped key. Returns the gate symbol's id. */
function ensureGatePair(ctx: WalkContext, key: string, label: string | undefined, x: number | undefined, y: number | undefined): string {
  const existing = ctx.gateSymbolId.get(key);
  if (existing) return existing;

  const identifier = keyToIdentifier(key);
  const gateId = `${identifier}__gate`;
  ctx.nodes.push({
    id: identifier,
    identifier,
    label: label ?? identifier,
    category: "event",
    eventKind: "intermediate",
    x,
    y,
  });
  ctx.nodes.push({
    id: gateId,
    identifier: gateId,
    label: gateId,
    category: "gate",
    gateType: "or",
    x,
    y: y !== undefined ? y + 90 : undefined,
  });
  ctx.edges.push({ source: gateId, target: identifier });
  ctx.gateSymbolId.set(key, gateId);
  return gateId;
}

function gateTagToType(tag: string): GateType {
  switch (tag) {
    case "and":
      return "and";
    case "or":
      return "or";
    case "nand":
      return "nand";
    case "nor":
      return "nor";
    case "atleast":
      return "atleast";
    case "cardinality":
      return "cardinality";
    case "not":
      return "not";
    case "xor":
      return "xor";
    case "iff":
      return "iff";
    default:
      return "or";
  }
}

/** Walks a <define-gate>'s formula, wiring child references/nested formulas
 * as edges. `scope` is the scope the gate itself (and thus every bare name
 * its formula references) was declared in. */
function walkFormula(ctx: WalkContext, formulaHost: XmlNode, gateSymbolId: string, scope: string) {
  const tag = Object.keys(formulaHost).find((k) => FORMULA_TAGS.has(k));
  // No wrapping connective element found — per Open-PSA MEF, a bare event
  // reference directly under `<define-gate>` (no `<and>`/`<or>`/etc.) *is*
  // the schema's representation of a pass-through/NULL gate, so fall back
  // to reading a REF_TAGS key straight off `formulaHost` itself.
  const body = tag ? formulaHost[tag] : formulaHost;
  const isBareRef = !tag && [...REF_TAGS].some((refTag) => body[refTag] !== undefined);
  if (!tag && !isBareRef) return;

  const gateNode = ctx.nodes.find((n) => n.id === gateSymbolId);
  if (gateNode) {
    gateNode.gateType = isBareRef ? "null" : gateTagToType(tag!);
    if (tag === "atleast") {
      const k = getAttr(body, "min") ?? body?.["@_min"];
      gateNode.votingK = Number(k) || 2;
    }
    if (tag === "cardinality") {
      const min = getAttr(body, "min") ?? body?.["@_min"];
      const max = getAttr(body, "max") ?? body?.["@_max"];
      gateNode.votingK = Number(min) || 0;
      gateNode.votingMax = Number(max) || 0;
    }
  }

  for (const refTag of REF_TAGS) {
    for (const ref of asArray(body[refTag])) {
      const name = getAttr(ref, "name")!;
      // A dotted name (`t.E1`) is an explicit qualified path INTO a
      // component from outside it (Open-PSA MEF's "transfer-in" idiom) —
      // an absolute address, resolved independent of the referencing
      // scope; a plain name resolves relative to it, innermost first.
      //
      // The explicit `gate`/`basic-event`/`house-event` tags already say
      // which kind they mean, so only the generic `<event>` tag needs the
      // scope-interleaved ambiguity resolution — every `<define-gate>` in
      // this model is pre-registered (two-pass walk below) before any
      // formula is walked, and `<define-basic-event>`/`<define-house-event>`
      // are parsed even earlier via `parseModelData`, so both lookups are
      // reliable regardless of declaration order.
      const ambiguous = refTag === "event" ? resolveAmbiguousRef(ctx, scope, name) : undefined;
      const isGateRef = refTag === "gate" || ambiguous?.isGate === true;
      if (isGateRef) {
        // Referenced gate's box may not have been created yet if it's defined later in the file.
        const key = ambiguous?.key ?? resolveReferenceKey(ctx.gateSymbolId, scope, name) ?? fallbackKey(scope, name);
        const boxId = ensureGatePairPlaceholder(ctx, key);
        ctx.edges.push({ source: boxId, target: gateSymbolId });
      } else {
        const defKey = ambiguous?.key ?? resolveReferenceKey(ctx.eventDefs, scope, name) ?? fallbackKey(scope, name);
        const kind: EventKind = refTag === "house-event" || ctx.eventDefs.get(defKey)?.kind === "house" ? "house" : "basic";
        if (!ctx.eventDefs.has(defKey)) ctx.eventDefs.set(defKey, { kind });
        const nodeId = ensureEventNode(ctx, defKey);
        ctx.edges.push({ source: nodeId, target: gateSymbolId });
      }
    }
  }

  for (const nestedTag of FORMULA_TAGS) {
    if (nestedTag === tag) continue;
    for (const nested of asArray(body[nestedTag])) {
      // Must start with a letter — `identifierSchema` (schema.ts) rejects a
      // leading underscore, so the previous `_G${n}` scheme made every file
      // with a nested inline formula (e.g. `<not>` wrapping a single
      // reference inside an `<and>`, a completely ordinary Open-PSA MEF
      // pattern) fail the post-parse Zod validation and throw, instead of
      // importing.
      const syntheticName = `Syn${++syntheticCounter}`;
      const nestedGateId = ensureGatePair(ctx, syntheticName, syntheticName, undefined, undefined);
      ctx.edges.push({ source: syntheticName, target: gateSymbolId });
      walkFormula(ctx, { [nestedTag]: nested }, nestedGateId, scope);
    }
  }
}

/** Reserves a box id for a gate referenced before its own <define-gate> has been walked. */
function ensureGatePairPlaceholder(ctx: WalkContext, key: string): string {
  if (!ctx.gateSymbolId.has(key)) {
    ensureGatePair(ctx, key, keyToIdentifier(key), undefined, undefined);
  }
  return keyToIdentifier(key);
}

/** Detects a cyclic gate reference (gate A feeds into gate B which
 * eventually feeds back into A) and returns the cycle as a chain of
 * identifiers, or `null` if the graph is acyclic. Real Open-PSA MEF test
 * suites include deliberately-malformed cyclic fixtures (SCRAM itself
 * rejects them at analysis time) — this app's own downstream code has no
 * such guard: the auto-layout pass that runs immediately after import
 * (`useAppActions.ts`'s `handleImport`) is a strict-tree algorithm with no
 * cycle protection, so it recurses forever and hangs/crashes the whole
 * webview before the lint panel (which *does* already detect cycles) ever
 * gets a chance to run and report it cleanly. Catching it here, before a
 * cyclic model is ever handed off to that layout pass, is the only point
 * that's actually safe to fail from. */
function detectCycle(nodes: ParsedNode[], edges: ParsedEdge[]): string[] | null {
  const childrenOf = new Map<string, string[]>();
  for (const e of edges) {
    if (!childrenOf.has(e.target)) childrenOf.set(e.target, []);
    childrenOf.get(e.target)!.push(e.source);
  }
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>(nodes.map((n) => [n.id, WHITE]));
  const stack: string[] = [];

  function visit(id: string): string[] | null {
    color.set(id, GRAY);
    stack.push(id);
    for (const child of childrenOf.get(id) ?? []) {
      const c = color.get(child);
      if (c === GRAY) {
        const cycleStart = stack.indexOf(child);
        return stack.slice(cycleStart).concat(child).map((nid) => byId.get(nid)?.identifier ?? nid);
      } else if (c === WHITE) {
        const found = visit(child);
        if (found) return found;
      }
    }
    stack.pop();
    color.set(id, BLACK);
    return null;
  }

  for (const n of nodes) {
    if (color.get(n.id) === WHITE) {
      const found = visit(n.id);
      if (found) return found;
    }
  }
  return null;
}

/** Open-PSA MEF lets the same `<define-gate>` be referenced from more than
 * one parent formula — a completely normal, common way to reuse a
 * sub-tree (SCRAM itself, and this app's own serializer, represent that as
 * two `<gate name="X"/>` references to one `<define-gate name="X">`, no
 * duplication needed on that side). This app's canvas can't show that
 * directly, though: the layout engine (`elkLayout.ts`) is a strict tree —
 * every node gets positioned under exactly one parent — so a gate box
 * referenced by two different parents ends up positioned under only one of
 * them while the other parent's connector has to reach across the canvas
 * to a node that isn't really part of its own subtree, producing exactly
 * the tangled, crossing-lines layout a shared gate reference creates.
 * Basic/house events already get a fresh node per reference
 * (`ensureEventNode`); this mirrors that for gates, deep-cloning the whole
 * referenced subtree (fresh ids throughout, same identifiers/labels/data,
 * so it displays and re-exports as the same conceptual event) for every
 * parent beyond the first. */
function duplicateSharedGateSubtrees(ctx: WalkContext) {
  const byId = new Map(ctx.nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, string[]>();
  for (const e of ctx.edges) {
    if (!childrenOf.has(e.target)) childrenOf.set(e.target, []);
    childrenOf.get(e.target)!.push(e.source);
  }
  // Snapshot which box ids feed into more than one parent BEFORE any
  // mutation — edges are pushed by reference below, so later lookups would
  // otherwise see (and re-process) the clones' own edges too.
  const outgoingFrom = new Map<string, ParsedEdge[]>();
  for (const e of ctx.edges) {
    if (!outgoingFrom.has(e.source)) outgoingFrom.set(e.source, []);
    outgoingFrom.get(e.source)!.push(e);
  }

  let cloneCounter = 0;
  function cloneSubtree(rootId: string): string {
    const idMap = new Map<string, string>();
    const newId = (oldId: string): string => {
      if (!idMap.has(oldId)) idMap.set(oldId, `${oldId}__clone${++cloneCounter}`);
      return idMap.get(oldId)!;
    };
    const stack = [rootId];
    const seen = new Set<string>();
    while (stack.length) {
      const oldId = stack.pop()!;
      if (seen.has(oldId)) continue;
      seen.add(oldId);
      const orig = byId.get(oldId);
      if (!orig) continue;
      ctx.nodes.push({ ...orig, id: newId(oldId) });
      for (const childOld of childrenOf.get(oldId) ?? []) {
        ctx.edges.push({ source: newId(childOld), target: newId(oldId) });
        stack.push(childOld);
      }
    }
    return newId(rootId);
  }

  for (const [boxId, edges] of outgoingFrom) {
    const box = byId.get(boxId);
    // Only intermediate-event boxes (i.e. gates) can legitimately have more
    // than one parent this way — a leaf event already gets a fresh
    // instance per reference, and a "top" box can never have a parent
    // (lint would already flag that as an error).
    if (!box || box.category !== "event" || box.eventKind !== "intermediate") continue;
    if (edges.length <= 1) continue;
    for (let i = 1; i < edges.length; i++) {
      edges[i].source = cloneSubtree(boxId);
    }
  }
}

export function parseOpenPsaXml(xmlText: string): { nodes: ParsedNode[]; edges: ParsedEdge[]; ccfGroups: CcfGroup[] } {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    allowBooleanAttributes: true,
    parseAttributeValue: false,
    trimValues: true,
  });

  const doc = parser.parse(xmlText);
  const root = doc["opsa-mef"];
  if (!root) throw new Error("Not a valid Open-PSA MEF document: missing <opsa-mef> root.");

  const faultTrees = asArray(root["define-fault-tree"]);
  if (faultTrees.length === 0) throw new Error("No <define-fault-tree> element found.");

  // Flatten every fault tree plus any `<define-component>` nested inside it
  // (arbitrarily deep) into one list of containers, each tagged with its
  // own scope — gates/events/params/CCF groups declared inside a component
  // are otherwise invisible to every lookup below, and references to them
  // resolve to nothing. `root` itself is included too: `<define-CCF-group>`
  // (and `<define-parameter>`) are legal as top-level siblings of
  // `<define-fault-tree>`/`<model-data>` directly under `<opsa-mef>`, not
  // just nested inside one — matching exactly where this app's own
  // serializer already emits CCF groups on export (serializer.ts).
  const allContainers: Container[] = [{ node: root, scope: "" }];
  collectContainers(root["model-data"], "", allContainers);
  for (const ft of faultTrees) collectContainers(ft, "", allContainers);

  const eventDefs = parseModelData(allContainers);
  const ctx: WalkContext = {
    nodes: [],
    edges: [],
    eventDefs,
    createdEventIds: new Set(),
    gateSymbolId: new Map(),
    eventInstanceCounter: 0,
  };

  const gateNames: string[] = [];
  for (const { node: container, scope } of allContainers) {
    for (const gateDef of asArray(container["define-gate"])) {
      const name = getAttr(gateDef, "name")!;
      const key = scopedKey(scope, name);
      const ext = readAttributesExtension(gateDef);
      ensureGatePair(ctx, key, gateDef.label ?? keyToIdentifier(key), ext.x, ext.y);
      gateNames.push(keyToIdentifier(key));
    }
  }
  for (const { node: container, scope } of allContainers) {
    for (const gateDef of asArray(container["define-gate"])) {
      const name = getAttr(gateDef, "name")!;
      const key = scopedKey(scope, name);
      walkFormula(ctx, gateDef, ctx.gateSymbolId.get(key)!, scope);
    }
  }

  const paramValues = parseParameterDefs(allContainers);
  const ccfGroups = parseCcfGroups(allContainers, paramValues, eventDefs);

  // The top gate's box is the one never referenced as a child of another gate.
  const referencedBoxIds = new Set(
    ctx.edges
      .filter((e) => gateNames.includes(e.source))
      .map((e) => e.source)
  );
  const topName = gateNames.find((n) => !referencedBoxIds.has(n)) ?? gateNames[0];
  const topBox = ctx.nodes.find((n) => n.id === topName);
  if (topBox) {
    topBox.category = "top";
    topBox.eventKind = undefined;
  }

  const cycle = detectCycle(ctx.nodes, ctx.edges);
  if (cycle) {
    throw new Error(`Model contains a cyclic gate reference (${cycle.join(" → ")}) — a fault tree must be acyclic.`);
  }

  duplicateSharedGateSubtrees(ctx);

  const parsed = { nodes: ctx.nodes, edges: ctx.edges };
  const result = parsedModelSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Parsed model failed validation: ${result.error.issues.map((i) => i.message).join("; ")}`);
  }
  return { ...result.data, ccfGroups };
}
