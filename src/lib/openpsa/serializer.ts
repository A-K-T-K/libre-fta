import { XMLBuilder } from "fast-xml-parser";
import type { FTANode, FTAEdge } from "@/store/ftaStore";
import type { CcfGroup, ProbabilityModel } from "@/types/fta";

const CCF_MODEL_TAG: Record<CcfGroup["model"], string> = {
  "beta-factor": "beta-factor",
  mgl: "MGL",
  "alpha-factor": "alpha-factor",
};

const GATE_TAG: Record<string, string> = {
  and: "and",
  or: "or",
  atleast: "atleast",
  not: "not",
  xor: "xor",
  nand: "nand",
  nor: "nor",
  iff: "iff",
  cardinality: "cardinality",
  // "null" is deliberately absent: Open-PSA MEF has no `<null>` element —
  // a pass-through gate is represented as a bare event reference directly
  // under `<define-gate>`, with no wrapping connective (see below).
};

function isBoxEvent(n: FTANode): boolean {
  return n.data.category === "top" || n.data.eventKind === "intermediate";
}

function leafPositionAttrs(node: FTANode) {
  return {
    attributes: {
      attribute: [
        { "@_name": "fta-x", "@_value": String(Math.round(node.position.x)) },
        { "@_name": "fta-y", "@_value": String(Math.round(node.position.y)) },
        { "@_name": "fta-event-kind", "@_value": node.data.eventKind ?? "basic" },
      ],
    },
  };
}

function gatePositionAttrs(node: FTANode) {
  return {
    attributes: {
      attribute: [
        { "@_name": "fta-x", "@_value": String(Math.round(node.position.x)) },
        { "@_name": "fta-y", "@_value": String(Math.round(node.position.y)) },
      ],
    },
  };
}

function deviateExpression(distribution: NonNullable<ProbabilityModel["distribution"]>) {
  const [a, b] = distribution.params;
  switch (distribution.kind) {
    case "uniform":
      return { "uniform-deviate": { float: [{ "@_value": a }, { "@_value": b }] } };
    case "normal":
      return { "normal-deviate": { float: [{ "@_value": a }, { "@_value": b }] } };
    case "lognormal":
      // level = confidence level the error factor `b` is defined at;
      // engine.ts's own sampler assumes the standard 0.95 (z=1.645).
      return { "lognormal-deviate": { float: [{ "@_value": a }, { "@_value": b }, { "@_value": 0.95 }] } };
  }
}

/** Builds a basic event's Open-PSA MEF probability expression. A
 * `distribution` (used for Monte Carlo uncertainty analysis) takes
 * priority over the point value, so SCRAM CLI samples the same
 * distribution the built-in engine's own `runMonteCarlo` does
 * (engine.ts) — the point `value`/`lambda` on the same event still
 * exists for non-uncertainty runs, but a deviate expression replaces it
 * here since Open-PSA MEF expressions are one-or-the-other, not both. */
function probabilityExpression(prob: ProbabilityModel | undefined) {
  if (prob?.distribution) {
    if (prob.lambda !== undefined) {
      // The distribution models uncertainty in the RATE, not a raw
      // probability — <exponential> takes any expression for its rate
      // child (`input.rng`'s exponential rule: two generic `expression`
      // refs, not `float` specifically), so nesting the deviate here makes
      // SCRAM sample a rate and apply P(t)=1-e^(-λt) to it, matching
      // engine.ts's own runMonteCarlo treatment of lambda-based events —
      // sampling the deviate directly as a bare probability (the previous
      // behavior) skipped that transform entirely.
      return { exponential: { ...deviateExpression(prob.distribution), "system-mission-time": "" } };
    }
    return deviateExpression(prob.distribution);
  }
  if (prob?.lambda !== undefined) {
    // Open-PSA MEF's <exponential> expression takes exactly two children —
    // the rate and a time to evaluate P(t)=1-e^(-λt) at — not just the
    // rate. Omitting the second (verified via `scram --validate`) makes
    // SCRAM reject the whole model with an XML validity error.
    // <system-mission-time/> ties it to whatever --mission-time the run
    // was invoked with, matching the engine's own P(t) calculation for the
    // same event (engine.ts).
    return { exponential: { float: { "@_value": prob.lambda }, "system-mission-time": "" } };
  }
  return { float: { "@_value": prob?.value ?? 1e-4 } };
}

export interface SerializeOptions {
  modelName?: string;
  faultTreeName?: string;
  ccfGroups?: CcfGroup[];
}

/** Open-PSA MEF `name` attributes are XML NCNames: no whitespace, no leading punctuation. */
function toNCName(raw: string): string {
  const cleaned = raw.trim().replace(/\s+/g, "_").replace(/[^A-Za-z0-9_.-]/g, "");
  return cleaned || "Model";
}

/**
 * Each (event box -> gate) pair in the canvas represents exactly one
 * Open-PSA MEF `<define-gate>`: the box supplies the gate's exported
 * name/label, the gate node supplies its logic and inputs.
 */
export function serializeToOpenPsaXml(
  nodes: FTANode[],
  edges: FTAEdge[],
  options: SerializeOptions = {}
): string {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const childrenOf = new Map<string, string[]>();
  for (const e of edges) {
    if (!childrenOf.has(e.target)) childrenOf.set(e.target, []);
    childrenOf.get(e.target)!.push(e.source);
  }

  const boxOfGate = new Map<string, FTANode>();
  for (const e of edges) {
    const src = byId.get(e.source);
    const tgt = byId.get(e.target);
    if (src?.data.category === "gate" && tgt && isBoxEvent(tgt)) {
      boxOfGate.set(e.source, tgt);
    }
  }

  const gateNodes = nodes.filter((n) => n.data.category === "gate");
  const leafEventNodes = nodes.filter((n) => n.data.category === "event" && !isBoxEvent(n));

  // A gate can legitimately be referenced from more than one parent — this
  // app represents that on canvas as duplicate box+gate node pairs sharing
  // one identifier (parser.ts's `duplicateSharedGateSubtrees`, so the
  // strict-tree layout can draw it sensibly), each a deep clone of the
  // same structure. Collapse those back into a single `<define-gate>`
  // here, the same way leaf events already are below — emitting one per
  // node would redefine the same gate name more than once, which SCRAM
  // rejects as a duplicate element.
  const seenGateIdentifiers = new Set<string>();
  const uniqueGateNodes = gateNodes.filter((gate) => {
    const box = boxOfGate.get(gate.id);
    const exportName = box?.data.identifier ?? gate.data.identifier;
    if (seenGateIdentifiers.has(exportName)) return false;
    seenGateIdentifiers.add(exportName);
    return true;
  });

  const defineGates = uniqueGateNodes.map((gate) => {
    const box = boxOfGate.get(gate.id);
    const exportName = box?.data.identifier ?? gate.data.identifier;
    const exportLabel = box?.data.label;

    const kids = childrenOf.get(gate.id) ?? [];
    const isNull = gate.data.gateType === "null";
    const tag = isNull ? null : (GATE_TAG[gate.data.gateType ?? "or"] ?? "or");

    const gateRefs: { "@_name": string }[] = [];
    const beRefs: { "@_name": string }[] = [];
    const heRefs: { "@_name": string }[] = [];

    for (const childId of kids) {
      const child = byId.get(childId);
      if (!child) continue;
      if (isBoxEvent(child)) {
        // References the deeper gate by the identifier its own box exports it under.
        gateRefs.push({ "@_name": child.data.identifier });
      } else if (child.data.category === "gate") {
        // A transfer tree's root gate gets spliced directly under whatever
        // fed into the transfer event (buildCombinedTree.ts), skipping the
        // usual box-event wrapper — without this branch it fell into the
        // basic-event case below, producing a `<basic-event>` reference to
        // a name only ever defined as a `<define-gate>`, which SCRAM
        // rejects as an undefined element.
        gateRefs.push({ "@_name": child.data.identifier });
      } else if (child.data.eventKind === "house") {
        heRefs.push({ "@_name": child.data.identifier });
      } else {
        beRefs.push({ "@_name": child.data.identifier });
      }
    }

    const formulaBody: Record<string, unknown> = {};
    if (tag === "atleast") formulaBody["@_min"] = gate.data.votingK ?? 2;
    if (tag === "cardinality") {
      formulaBody["@_min"] = gate.data.votingK ?? 0;
      formulaBody["@_max"] = gate.data.votingMax ?? kids.length;
    }
    if (gateRefs.length) formulaBody.gate = gateRefs;
    if (beRefs.length) formulaBody["basic-event"] = beRefs;
    if (heRefs.length) formulaBody["house-event"] = heRefs;

    // Open-PSA MEF requires strict child order: name, role?, label?, attributes?, formula.
    // A NULL gate has no wrapping connective element at all — its formula
    // *is* the bare single-child reference, spliced directly in place of
    // where `[tag]: formulaBody` would otherwise sit.
    return {
      "@_name": exportName,
      ...(exportLabel && exportLabel !== exportName ? { label: exportLabel } : {}),
      ...gatePositionAttrs(box ?? gate),
      ...(isNull ? formulaBody : { [tag as string]: formulaBody }),
    };
  });

  // A basic/house event's identifier can legitimately be shared by more than
  // one node on the canvas (the same physical event referenced under
  // several gates) — collapse those into a single Open-PSA MEF definition,
  // referenced by name from each gate's formula, instead of emitting one
  // `<define-basic-event>` per node (which would redefine the same name
  // multiple times and produce invalid XML).
  const seenIdentifiers = new Set<string>();
  const uniqueByIdentifier = leafEventNodes.filter((n) => {
    if (seenIdentifiers.has(n.data.identifier)) return false;
    seenIdentifiers.add(n.data.identifier);
    return true;
  });

  // CCF group members get their probability from the group's own
  // <distribution>, not an individual <define-basic-event> expression —
  // emitting both would redefine the same event's failure model twice.
  const ccfGroups = (options.ccfGroups ?? []).filter((g) => g.memberIdentifiers.length >= 2);
  const ccfMemberIdentifiers = new Set(ccfGroups.flatMap((g) => g.memberIdentifiers));

  const basicEventDefs = uniqueByIdentifier
    .filter((n) => n.data.eventKind !== "house" && !ccfMemberIdentifiers.has(n.data.identifier))
    .map((n) => ({
      "@_name": n.data.identifier,
      ...(n.data.label && n.data.label !== n.data.identifier ? { label: n.data.label } : {}),
      ...leafPositionAttrs(n),
      ...probabilityExpression(n.data.probability),
    }));

  const houseEventDefs = uniqueByIdentifier
    .filter((n) => n.data.eventKind === "house")
    .map((n) => ({
      "@_name": n.data.identifier,
      ...leafPositionAttrs(n),
      constant: { "@_value": n.data.probability?.booleanState ? "true" : "false" },
    }));

  // Verified against the real schema (`input.rng`'s `CCF-group-definition`,
  // via `scram --validate`): the element is `<define-CCF-group>` (not
  // `<ccf-group>`) and is a top-level sibling of `<define-fault-tree>`/
  // `<model-data>` under `<opsa-mef>`, not nested inside `<model-data>` —
  // nesting it there produced "Did not expect element ccf-group there".
  // `<factor>` wraps an expression child (`<float value=.../>`), not a
  // bare `value` attribute on `<factor>` itself.
  const ccfGroupDefs = ccfGroups.map((g) => ({
    "@_name": toNCName(g.name),
    "@_model": CCF_MODEL_TAG[g.model],
    members: { "basic-event": g.memberIdentifiers.map((id) => ({ "@_name": id })) },
    distribution: probabilityExpression(g.groupProbability),
    ...(g.model === "beta-factor"
      ? { factor: probabilityExpression({ value: g.factors[0] ?? 0 }) }
      : {
          // MGL's ρ factors describe *shared* failure levels only, so they
          // start at level 2 (level 1 — a single component alone — isn't a
          // common-cause event by definition). Alpha-factor's α factors
          // instead cover every multiplicity including the independent
          // (single-component) case, so they start at level 1.
          factors: {
            factor: g.factors.map((f, i) => ({
              "@_level": i + (g.model === "alpha-factor" ? 1 : 2),
              ...probabilityExpression({ value: f }),
            })),
          },
        }),
  }));

  const doc = {
    "?xml": { "@_version": "1.0", "@_encoding": "UTF-8" },
    "opsa-mef": {
      "@_name": toNCName(options.modelName ?? "FTA_Studio_Model"),
      "define-fault-tree": {
        "@_name": toNCName(options.faultTreeName ?? "FaultTree"),
        "define-gate": defineGates,
      },
      "model-data": {
        ...(basicEventDefs.length ? { "define-basic-event": basicEventDefs } : {}),
        ...(houseEventDefs.length ? { "define-house-event": houseEventDefs } : {}),
      },
      ...(ccfGroupDefs.length ? { "define-CCF-group": ccfGroupDefs } : {}),
    },
  };

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    format: true,
    indentBy: "  ",
    suppressEmptyNode: true,
  });

  // fast-xml-parser's XMLBuilder has a confirmed bug (isolated independently
  // of this app's logic): an attribute whose value is exactly the string
  // "true" gets its value silently dropped — `{ "@_value": "true" }` builds
  // as `value` with no `="true"`, not `value="true"`, regardless of
  // `suppressEmptyNode` or other attributes present. "false"/"TRUE"/every
  // other value is unaffected. The only place this app ever emits a literal
  // "true" attribute value is `<constant value="true"/>` for a house event
  // whose state is on — SCRAM rejects the resulting `<constant value/>` as
  // invalid XML ("Specification mandates value for attribute value"), so
  // every "on" house event silently broke re-export/SCRAM analysis. Since
  // `<constant value/>` never legitimately occurs otherwise (the `false`
  // case always serializes correctly on its own), targeting exactly that
  // string is a safe, narrow fix rather than a broad content rewrite.
  return builder.build(doc).replace(/<constant value\/>/g, '<constant value="true"/>');
}
