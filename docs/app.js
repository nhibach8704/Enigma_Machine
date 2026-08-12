"use strict";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const SPECIAL_CHARACTERS = ".,?!()[]{}:;-'";
const ALPHABET = LETTERS + SPECIAL_CHARACTERS;
const MODULUS = ALPHABET.length;
const KEYBOARD_ROWS = [
  "QWERTZUIO",
  "ASDFGHJK",
  "PYXCVBNML",
  ".,?!()[]",
  "{}:;-'",
];
const EXTENDED_ROTOR_SUFFIX = SPECIAL_CHARACTERS;
const EXTENDED_REFLECTOR_SUFFIX = ",.!?)(][}{;:'-";

const ROTORS = {
  I: { wiring: "EKMFLGDQVZNTOWYHXUSPAIBRCJ" + EXTENDED_ROTOR_SUFFIX, notch: "Q" },
  II: { wiring: "AJDKSIRUXBLHWTMCQGZNPYFVOE" + EXTENDED_ROTOR_SUFFIX, notch: "E" },
  III: { wiring: "BDFHJLCPRTXVZNYEIWGAKMUSQO" + EXTENDED_ROTOR_SUFFIX, notch: "V" },
  IV: { wiring: "ESOVPZJAYQUIRHXLNFTGKDCMWB" + EXTENDED_ROTOR_SUFFIX, notch: "J" },
  V: { wiring: "VZBRGITYUPSDNHLXAWMJQOFECK" + EXTENDED_ROTOR_SUFFIX, notch: "Z" },
};

const CUSTOM_ROTOR_IDS = ["CUSTOM_LEFT", "CUSTOM_MIDDLE", "CUSTOM_RIGHT"];
const POSITION_NAMES = ["Left", "Middle", "Right"];

const REFLECTORS = {
  B: "YRUHQSLDPXNGOKMIEBFZCWVJAT" + EXTENDED_REFLECTOR_SUFFIX,
  C: "FVPJIAOYEDRZXWGCTKUQSBNMHL" + EXTENDED_REFLECTOR_SUFFIX,
};

const DEFAULT_PLUGBOARD_PAIRS = [
  "AV",
  "BS",
  "CG",
  "DL",
  "FU",
  "HZ",
  "IN",
  "KM",
  "OW",
  "RX",
].map((pair) => [...pair]);

const DEFAULTS = {
  rotorOrder: ["I", "II", "III"],
  rings: [0, 0, 0],
  positions: [0, 0, 0],
  reflector: "B",
  turnover: true,
  customRotors: [
    { wiring: ALPHABET, notch: "", valid: true, error: "" },
    { wiring: ALPHABET, notch: "E", valid: true, error: "" },
    { wiring: ALPHABET, notch: "V", valid: true, error: "" },
  ],
  customReflector: {
    pairs: pairsFromWiring(REFLECTORS.B),
    wiring: REFLECTORS.B,
    valid: true,
    error: "",
    invalidIndexes: [],
  },
  plugboard: {
    pairs: DEFAULT_PLUGBOARD_PAIRS.map((pair) => [...pair]),
    wiring: plugboardWiringFromPairs(DEFAULT_PLUGBOARD_PAIRS),
    valid: true,
    error: "",
    invalidIndexes: [],
  },
};

const machine = {
  rotorOrder: [...DEFAULTS.rotorOrder],
  rings: [...DEFAULTS.rings],
  positions: [...DEFAULTS.positions],
  initialPositions: [...DEFAULTS.positions],
  reflector: DEFAULTS.reflector,
  turnover: DEFAULTS.turnover,
  customRotors: DEFAULTS.customRotors.map((rotor) => ({ ...rotor })),
  customReflector: {
    ...DEFAULTS.customReflector,
    pairs: [...DEFAULTS.customReflector.pairs],
    invalidIndexes: [],
  },
  plugboard: {
    ...DEFAULTS.plugboard,
    pairs: DEFAULTS.plugboard.pairs.map((pair) => [...pair]),
    invalidIndexes: [],
  },
  history: "",
  lastTrace: null,
  stats: createEmptyStats(),
};

const elements = {};
let lampTimer = null;
let operationMode = "encrypt";

function toIndex(symbol) {
  return ALPHABET.indexOf(symbol);
}

function toSymbol(index) {
  return ALPHABET[(index + MODULUS) % MODULUS];
}

function normalizeSymbol(character) {
  const normalized = character.toUpperCase();
  return normalized.length === 1 && ALPHABET.includes(normalized)
    ? normalized
    : "";
}

function cleanAlphabetSymbols(value) {
  return [...value]
    .map(normalizeSymbol)
    .filter(Boolean)
    .join("");
}

function symbolName(symbol) {
  const names = {
    ".": "period",
    ",": "comma",
    "?": "question mark",
    "!": "exclamation mark",
    "(": "left parenthesis",
    ")": "right parenthesis",
    "[": "left bracket",
    "]": "right bracket",
    "{": "left brace",
    "}": "right brace",
    ":": "colon",
    ";": "semicolon",
    "-": "hyphen",
    "'": "apostrophe",
  };
  return names[symbol] || symbol;
}

function createEmptyStats() {
  return {
    symbolsProcessed: 0,
    steps: [0, 0, 0],
  };
}

function pairsFromWiring(wiring) {
  return [...ALPHABET]
    .map((symbol, index) => [symbol, wiring[index]])
    .filter(([source, target]) => toIndex(source) < toIndex(target))
    .map((pair) => pair.join(""));
}

function wiringFromPairs(pairs) {
  const wiring = Array(MODULUS).fill("");
  pairs.forEach((pair) => {
    const [first, second] = pair;
    wiring[toIndex(first)] = second;
    wiring[toIndex(second)] = first;
  });
  return wiring.join("");
}

function plugboardWiringFromPairs(pairs) {
  const wiring = [...ALPHABET];
  pairs.forEach(([first, second]) => {
    wiring[toIndex(first)] = second;
    wiring[toIndex(second)] = first;
  });
  return wiring.join("");
}

function getReflectorWiring() {
  return machine.reflector === "CUSTOM"
    ? machine.customReflector.wiring
    : REFLECTORS[machine.reflector];
}

function reflectorDisplayName() {
  if (machine.reflector === "CUSTOM") return "Custom";
  return machine.reflector === "B" ? "Option 1" : "Option 2";
}

function customRotorIndex(rotorName) {
  return CUSTOM_ROTOR_IDS.indexOf(rotorName);
}

function getRotorSpec(rotorName) {
  const customIndex = customRotorIndex(rotorName);
  return customIndex >= 0 ? machine.customRotors[customIndex] : ROTORS[rotorName];
}

function rotorDisplayName(rotorName) {
  const customIndex = customRotorIndex(rotorName);
  return customIndex >= 0 ? `Custom ${POSITION_NAMES[customIndex]}` : rotorName;
}

function activeCustomIndexes() {
  return machine.rotorOrder
    .map((name) => customRotorIndex(name))
    .filter((index) => index >= 0);
}

function machineIsValid() {
  const rotorsValid = activeCustomIndexes().every(
    (index) => machine.customRotors[index].valid,
  );
  const reflectorValid =
    machine.reflector !== "CUSTOM" || machine.customReflector.valid;
  return rotorsValid && reflectorValid && machine.plugboard.valid;
}

function rotorTransform(rotorName, signal, position, ring, reverse = false) {
  const wiring = getRotorSpec(rotorName).wiring;
  const internalInput = (signal + position - ring + MODULUS) % MODULUS;
  const internalOutput = reverse
    ? wiring.indexOf(toSymbol(internalInput))
    : toIndex(wiring[internalInput]);
  const externalOutput = (internalOutput - position + ring + MODULUS) % MODULUS;

  return {
    rotorName: rotorDisplayName(rotorName),
    direction: reverse ? "reverse" : "forward",
    position: toSymbol(position),
    ring: toSymbol(ring),
    externalInput: toSymbol(signal),
    internalInput: toSymbol(internalInput),
    internalOutput: toSymbol(internalOutput),
    externalOutput: toSymbol(externalOutput),
    output: externalOutput,
  };
}

function stepRotors() {
  const before = machine.positions.map(toSymbol).join("");
  const rightName = machine.rotorOrder[2];
  const middleName = machine.rotorOrder[1];
  const rightAtNotch = getRotorSpec(rightName).notch.includes(toSymbol(machine.positions[2]));
  const middleAtNotch = getRotorSpec(middleName).notch.includes(toSymbol(machine.positions[1]));
  let leftStepped = false;
  let middleStepped = false;

  if (machine.turnover) {
    if (middleAtNotch) {
      machine.positions[0] = (machine.positions[0] + 1) % MODULUS;
      leftStepped = true;
    }
    if (rightAtNotch || middleAtNotch) {
      machine.positions[1] = (machine.positions[1] + 1) % MODULUS;
      middleStepped = true;
    }
  }
  machine.positions[2] = (machine.positions[2] + 1) % MODULUS;

  return {
    before,
    after: machine.positions.map(toSymbol).join(""),
    rightAtNotch,
    middleAtNotch,
    leftStepped,
    middleStepped,
    rightStepped: true,
  };
}

function pressKey(symbol, animate = true) {
  const normalized = normalizeSymbol(symbol);
  if (!normalized || !machineIsValid()) return "";

  const step = stepRotors();
  machine.stats.symbolsProcessed += 1;
  if (step.leftStepped) machine.stats.steps[0] += 1;
  if (step.middleStepped) machine.stats.steps[1] += 1;
  if (step.rightStepped) machine.stats.steps[2] += 1;
  let signal = toIndex(normalized);
  const forward = [];
  const reverse = [];
  const plugboardEntryInput = toSymbol(signal);
  signal = toIndex(machine.plugboard.wiring[signal]);
  const plugboardEntryOutput = toSymbol(signal);

  for (const rotorIndex of [2, 1, 0]) {
    const trace = rotorTransform(
      machine.rotorOrder[rotorIndex],
      signal,
      machine.positions[rotorIndex],
      machine.rings[rotorIndex],
    );
    forward.push(trace);
    signal = trace.output;
  }

  const reflectorInput = toSymbol(signal);
  signal = toIndex(getReflectorWiring()[signal]);
  const reflectorOutput = toSymbol(signal);

  for (const rotorIndex of [0, 1, 2]) {
    const trace = rotorTransform(
      machine.rotorOrder[rotorIndex],
      signal,
      machine.positions[rotorIndex],
      machine.rings[rotorIndex],
      true,
    );
    reverse.push(trace);
    signal = trace.output;
  }

  const plugboardExitInput = toSymbol(signal);
  signal = toIndex(machine.plugboard.wiring[signal]);
  const plugboardExitOutput = toSymbol(signal);
  const output = plugboardExitOutput;
  machine.history += output;
  machine.lastTrace = {
    input: normalized,
    output,
    step,
    plugboardEntryInput,
    plugboardEntryOutput,
    forward,
    reflectorInput,
    reflectorOutput,
    reverse,
    plugboardExitInput,
    plugboardExitOutput,
  };

  renderMachine();
  renderTrace();
  if (animate) illuminate(normalized, output);
  return output;
}

function populateRotorSelect(select, selected, customId, customLabel) {
  select.innerHTML = [
    ...Object.keys(ROTORS).map(
      (name) => `<option value="${name}">Rotor ${name}</option>`,
    ),
    `<option value="${customId}">${customLabel}</option>`,
  ].join("");
  select.value = selected;
}

function rotorMovementDescription(index, name) {
  const spec = getRotorSpec(name);
  if (!machine.turnover && index < 2) {
    return "Does not step in right-rotor-only mode";
  }
  if (index === 0) {
    return "Slow rotor · steps only when the middle rotor triggers turnover";
  }
  if (index === 1) {
    return `Turnover rotor · follows the right notch · double-step notch ${spec.notch}`;
  }
  return machine.turnover
    ? `Fast rotor · steps before every symbol · turnover notch ${spec.notch}`
    : "Fast rotor · steps before every symbol · turnover disabled";
}

function createRotorWindows() {
  elements.rotorWindows.innerHTML = machine.rotorOrder
    .map(
      (name, index) => `
        <div class="rotor-unit">
          <div class="rotor-unit-header">
            <span>${POSITION_NAMES[index]} · ${["Slow", "Turnover", "Fast"][index]}</span>
            <span>${customRotorIndex(name) >= 0 ? rotorDisplayName(name) : `Rotor ${name}`}</span>
          </div>
          <div class="window-control">
            <button type="button" data-position-delta="-1" data-rotor-index="${index}" aria-label="Move ${["left", "middle", "right"][index]} rotor backward">−</button>
            <div class="window-letter" id="position-${index}">${toSymbol(machine.positions[index])}</div>
            <button type="button" data-position-delta="1" data-rotor-index="${index}" aria-label="Move ${["left", "middle", "right"][index]} rotor forward">+</button>
          </div>
          <select class="ring-select" data-ring-index="${index}" aria-label="${["Left", "Middle", "Right"][index]} ring setting">
            ${[...ALPHABET].map((symbol, setting) => `<option value="${setting}"${machine.rings[index] === setting ? " selected" : ""}>Ring ${symbol}</option>`).join("")}
          </select>
          <p class="rotor-movement">${rotorMovementDescription(index, name)}</p>
        </div>
      `,
    )
    .join("");
}

function validateCustomRotor(index, wiring, notch) {
  const cleanWiring = cleanAlphabetSymbols(wiring);
  const cleanNotch = index === 0
    ? ""
    : cleanAlphabetSymbols(notch);
  let error = "";

  if (cleanWiring.length !== MODULUS) {
    error = `Wiring needs ${MODULUS} symbols; currently ${cleanWiring.length}.`;
  } else if (new Set(cleanWiring).size !== MODULUS) {
    error = "Each symbol in the modulo-40 alphabet must appear exactly once.";
  } else if (index > 0 && !cleanNotch.length) {
    error = "Enter at least one turnover notch symbol.";
  } else if (index > 0 && new Set(cleanNotch).size !== cleanNotch.length) {
    error = "Notch symbols cannot repeat.";
  }

  machine.customRotors[index] = {
    wiring: cleanWiring,
    notch: cleanNotch,
    valid: !error,
    error,
  };
  return machine.customRotors[index];
}

function createCustomRotorEditor() {
  elements.customRotorEditor.innerHTML = machine.customRotors
    .map((rotor, index) => {
      const active = machine.rotorOrder.includes(CUSTOM_ROTOR_IDS[index]);
      return `
        <article class="wiring-card${active ? "" : " inactive"}" data-custom-card="${index}">
          <div class="wiring-card-header">
            <span>
              <strong>${POSITION_NAMES[index]} custom rotor</strong>
              <small>Independent wiring</small>
            </span>
            <span class="custom-badge">${active ? "Installed" : "Not active"}</span>
          </div>
          <label class="wiring-field">
            <span>Wiring permutation</span>
            <input
              data-custom-wiring="${index}"
              value="${rotor.wiring}"
              maxlength="40"
              autocomplete="off"
              spellcheck="false"
              aria-label="${POSITION_NAMES[index]} custom rotor wiring"
              aria-invalid="${rotor.valid ? "false" : "true"}"
            />
          </label>
          ${index === 0
            ? `<div class="wiring-field">
                <span>Turnover notch</span>
                <div class="notch-na">Not used on the leftmost rotor</div>
              </div>`
            : `<label class="wiring-field">
                <span>Turnover notch</span>
                <input
                  data-custom-notch="${index}"
                  value="${rotor.notch}"
                  maxlength="40"
                  autocomplete="off"
                  spellcheck="false"
                  aria-label="${POSITION_NAMES[index]} custom rotor turnover notch"
                  aria-invalid="${rotor.valid ? "false" : "true"}"
                />
              </label>`}
          <p class="wiring-help${rotor.error ? " error" : ""}" data-custom-status="${index}">
            ${rotor.error || (active ? "Valid permutation · In use" : "Valid permutation · Not active")}
          </p>
          <button
            class="install-rotor-button${active ? " active" : ""}"
            data-install-custom="${index}"
            type="button"
            ${active || !rotor.valid ? "disabled" : ""}
          >
            ${active ? `Installed in ${POSITION_NAMES[index].toLowerCase()}` : `Use in ${POSITION_NAMES[index].toLowerCase()} position`}
          </button>
        </article>
      `;
    })
    .join("");
  renderCustomValidity();
}

function renderCustomValidity() {
  const invalidActive = activeCustomIndexes().filter(
    (index) => !machine.customRotors[index].valid,
  );
  elements.wiringValidity.classList.toggle("invalid", invalidActive.length > 0);
  elements.wiringValidity.textContent = invalidActive.length
    ? `Fix ${invalidActive.length} installed custom rotor${invalidActive.length === 1 ? "" : "s"}`
    : "All installed rotors valid";
}

function installCustomRotor(index) {
  if (!machine.customRotors[index].valid) return false;
  machine.rotorOrder[index] = CUSTOM_ROTOR_IDS[index];
  rebuildFromConfiguration();
  return true;
}

function renderActiveConfiguration() {
  const rotorCards = machine.rotorOrder.map((name, index) => {
    const spec = getRotorSpec(name);
    const isCustom = customRotorIndex(name) >= 0;
    const notch = index === 0 ? "Not used" : spec.notch;
    return `
      <article class="active-config-card">
        <span>${POSITION_NAMES[index]} rotor</span>
        <strong>${isCustom ? "Custom wiring" : `Rotor ${name}`}</strong>
        <small>Ring ${toSymbol(machine.rings[index])} · Start ${toSymbol(machine.initialPositions[index])} · Notch ${notch}</small>
      </article>
    `;
  });

  rotorCards.push(`
    <article class="active-config-card">
      <span>Reflector &amp; stepping</span>
      <strong>${reflectorDisplayName()}</strong>
      <small>${machine.turnover ? "Historical turnover · Double-step enabled" : "Right rotor only · Turnover disabled"}</small>
    </article>
  `);
  rotorCards.push(`
    <article class="active-config-card">
      <span>Plugboard</span>
      <strong>${machine.plugboard.pairs.length || "No"} connection${machine.plugboard.pairs.length === 1 ? "" : "s"}</strong>
      <small>${machine.plugboard.pairs.length ? machine.plugboard.pairs.map((pair) => pair.join("↔")).join(" · ") : "Identity mapping · No swaps"}</small>
    </article>
  `);
  elements.activeConfiguration.innerHTML = rotorCards.join("");
}

function renderSessionStats() {
  const { symbolsProcessed, steps } = machine.stats;
  const initial = machine.initialPositions.map(toSymbol).join("");
  const current = machine.positions.map(toSymbol).join("");
  elements.sessionSummary.textContent =
    `${symbolsProcessed} symbol${symbolsProcessed === 1 ? "" : "s"} processed · Initial ${initial} · Current ${current}`;

  const stats = [
    ["Symbols processed", symbolsProcessed, "40-symbol alphabet"],
    ["Right rotor · Fast", steps[2], "steps before every encrypted symbol"],
    ["Middle rotor · Turnover", steps[1], machine.turnover ? `triggered by right notch ${getRotorSpec(machine.rotorOrder[2]).notch}` : "disabled in this mode"],
    ["Left rotor · Slow", steps[0], machine.turnover ? `triggered by middle notch ${getRotorSpec(machine.rotorOrder[1]).notch}` : "disabled in this mode"],
  ];
  elements.movementStats.innerHTML = stats
    .map(
      ([label, value, detail]) => `
        <article class="movement-stat">
          <span>${label}</span>
          <strong>${value}</strong>
          <small>${detail}</small>
        </article>
      `,
    )
    .join("");
}

function validateCustomReflector(pairs) {
  const cleanPairs = pairs.map((pair) => cleanAlphabetSymbols(pair).slice(0, 2));
  const invalidIndexes = new Set();
  const symbolOwners = new Map();
  let hasIncompletePair = false;
  let hasSelfPair = false;

  cleanPairs.forEach((pair, index) => {
    if (pair.length !== 2) {
      hasIncompletePair = true;
      invalidIndexes.add(index);
    }
    if (pair.length === 2 && pair[0] === pair[1]) {
      hasSelfPair = true;
      invalidIndexes.add(index);
    }
    [...pair].forEach((symbol) => {
      const owners = symbolOwners.get(symbol) || [];
      owners.push(index);
      symbolOwners.set(symbol, owners);
    });
  });

  let hasDuplicates = false;
  symbolOwners.forEach((owners) => {
    if (owners.length > 1) {
      hasDuplicates = true;
      owners.forEach((index) => invalidIndexes.add(index));
    }
  });

  let error = "";
  if (hasIncompletePair) {
    error = "Each reflector pair needs exactly two symbols.";
  } else if (hasSelfPair) {
    error = "A reflector cannot connect a symbol to itself.";
  } else if (hasDuplicates || symbolOwners.size !== MODULUS) {
    error = `Use every modulo-${MODULUS} symbol exactly once across the ${MODULUS / 2} pairs.`;
  }

  const valid = !error;
  machine.customReflector = {
    pairs: cleanPairs,
    wiring: valid ? wiringFromPairs(cleanPairs) : "",
    valid,
    error,
    invalidIndexes: [...invalidIndexes],
  };
  return machine.customReflector;
}

function createReflectorEditor() {
  const isCustom = machine.reflector === "CUSTOM";
  const pairs = isCustom
    ? machine.customReflector.pairs
    : pairsFromWiring(REFLECTORS[machine.reflector]);

  elements.reflectorPairs.innerHTML = pairs
    .map(
      (pair, index) => `
        <label class="reflector-pair">
          <span>Pair ${String(index + 1).padStart(2, "0")}</span>
          <input
            data-reflector-pair="${index}"
            value="${pair}"
            maxlength="2"
            autocomplete="off"
            spellcheck="false"
            aria-label="${isCustom ? "Custom" : reflectorDisplayName()} reflector pair ${index + 1}"
            aria-invalid="${isCustom && machine.customReflector.invalidIndexes.includes(index)}"
            ${isCustom ? "" : "readonly"}
          />
        </label>
      `,
    )
    .join("");
  renderReflectorValidity();
}

function renderReflectorValidity() {
  const isCustom = machine.reflector === "CUSTOM";
  elements.clearReflectorPairs.hidden = !isCustom;
  elements.reflectorLabEyebrow.textContent = isCustom
    ? "Custom component"
    : "Preset reflector";
  elements.reflectorLabTitle.textContent = isCustom
    ? "Custom reflector pairboard"
    : `${reflectorDisplayName()} reflector pairboard`;
  elements.reflectorLabCopy.textContent = isCustom
    ? `Connect the alphabet into ${MODULUS / 2} pairs. Each symbol must appear exactly once, and a symbol cannot connect to itself.`
    : `${reflectorDisplayName()} connects the alphabet into ${MODULUS / 2} fixed reciprocal pairs. Select Custom to create your own.`;

  if (!isCustom) {
    elements.reflectorValidity.classList.remove("invalid");
    elements.reflectorValidity.textContent = `${reflectorDisplayName()} preset`;
    elements.reflectorError.textContent = "Preset wiring is displayed read-only.";
    elements.reflectorError.classList.remove("error");
    return;
  }

  const reflector = machine.customReflector;
  elements.reflectorValidity.classList.toggle("invalid", !reflector.valid);
  elements.reflectorValidity.textContent = reflector.valid
    ? "Valid reciprocal reflector"
    : "Custom reflector incomplete";
  elements.reflectorError.textContent =
    reflector.error || `All ${MODULUS} contacts are paired.`;
  elements.reflectorError.classList.toggle("error", !reflector.valid);
}

function clearCustomReflectorPairs() {
  if (machine.reflector !== "CUSTOM") return;
  validateCustomReflector(Array(MODULUS / 2).fill(""));
  machine.history = "";
  machine.lastTrace = null;
  machine.stats = createEmptyStats();
  machine.positions = [...machine.initialPositions];
  createReflectorEditor();
  renderMachine();
  renderTrace();
}

function validatePlugboard(pairs) {
  const cleanPairs = pairs.map((pair) => [
    normalizeSymbol(pair[0] || ""),
    normalizeSymbol(pair[1] || ""),
  ]);
  const invalidIndexes = new Set();
  const symbolOwners = new Map();
  let hasIncompletePair = false;
  let hasSelfPair = false;

  cleanPairs.forEach((pair, index) => {
    const [first, second] = pair;
    if (!first || !second) {
      hasIncompletePair = true;
      invalidIndexes.add(index);
    }
    if (first && first === second) {
      hasSelfPair = true;
      invalidIndexes.add(index);
    }
    pair.filter(Boolean).forEach((symbol) => {
      const owners = symbolOwners.get(symbol) || [];
      owners.push(index);
      symbolOwners.set(symbol, owners);
    });
  });

  let hasDuplicates = false;
  symbolOwners.forEach((owners) => {
    if (owners.length > 1) {
      hasDuplicates = true;
      owners.forEach((index) => invalidIndexes.add(index));
    }
  });

  let error = "";
  if (cleanPairs.length > MODULUS / 2) {
    error = `The plugboard supports at most ${MODULUS / 2} disjoint pairs.`;
  } else if (hasIncompletePair) {
    error = "Choose two symbols for every plugboard connection.";
  } else if (hasSelfPair) {
    error = "A plugboard connection cannot join a symbol to itself.";
  } else if (hasDuplicates) {
    error = "A symbol can appear in only one plugboard connection.";
  }

  const valid = !error;
  machine.plugboard = {
    pairs: cleanPairs,
    wiring: valid ? plugboardWiringFromPairs(cleanPairs) : ALPHABET,
    valid,
    error,
    invalidIndexes: [...invalidIndexes],
  };
  return machine.plugboard;
}

function plugboardOptionLabel(symbol) {
  return LETTERS.includes(symbol)
    ? symbol
    : `${symbol} · ${symbolName(symbol)}`;
}

function plugboardOptions(selected, pairIndex) {
  const usedElsewhere = new Set(
    machine.plugboard.pairs
      .filter((_, index) => index !== pairIndex)
      .flat(),
  );
  return [
    '<option value="">Choose symbol</option>',
    ...[...ALPHABET].map((symbol) =>
      `<option value="${symbol}"${selected === symbol ? " selected" : ""}${usedElsewhere.has(symbol) ? " disabled" : ""}>${plugboardOptionLabel(symbol)}</option>`,
    ),
  ].join("");
}

function createPlugboardEditor() {
  if (!machine.plugboard.pairs.length) {
    elements.plugboardConnections.innerHTML = `
      <p class="plugboard-empty">No connections. Every symbol currently passes through the plugboard unchanged.</p>
    `;
  } else {
    elements.plugboardConnections.innerHTML = machine.plugboard.pairs
      .map(
        (pair, index) => `
          <div class="plugboard-connection${machine.plugboard.invalidIndexes.includes(index) ? " invalid" : ""}">
            <span>Pair ${String(index + 1).padStart(2, "0")}</span>
            <select data-plugboard-pair="${index}" data-plugboard-side="0" aria-label="Plugboard pair ${index + 1} first symbol">
              ${plugboardOptions(pair[0], index)}
            </select>
            <span class="plugboard-link" aria-hidden="true">↔</span>
            <select data-plugboard-pair="${index}" data-plugboard-side="1" aria-label="Plugboard pair ${index + 1} second symbol">
              ${plugboardOptions(pair[1], index)}
            </select>
            <button type="button" data-remove-plugboard="${index}" aria-label="Remove plugboard pair ${index + 1}">Remove</button>
          </div>
        `,
      )
      .join("");
  }
  elements.addPlugboardPair.disabled =
    !machine.plugboard.valid || machine.plugboard.pairs.length >= MODULUS / 2;
  elements.clearPlugboard.disabled = machine.plugboard.pairs.length === 0;
  renderPlugboardValidity();
}

function plugboardMatchesDefault() {
  return machine.plugboard.valid &&
    machine.plugboard.pairs.length === DEFAULT_PLUGBOARD_PAIRS.length &&
    machine.plugboard.pairs.every((pair, index) =>
      pair[0] === DEFAULT_PLUGBOARD_PAIRS[index][0] &&
      pair[1] === DEFAULT_PLUGBOARD_PAIRS[index][1],
    );
}

function renderPlugboardValidity() {
  const plugboard = machine.plugboard;
  elements.plugboardValidity.classList.toggle("invalid", !plugboard.valid);
  elements.plugboardValidity.textContent = plugboard.valid
    ? `${plugboard.pairs.length} active pair${plugboard.pairs.length === 1 ? "" : "s"}`
    : "Plugboard needs attention";
  elements.plugboardError.textContent = plugboard.error ||
    (plugboardMatchesDefault()
      ? "Default 10-pair preset active. Edit any pair or clear it to use an identity plugboard."
      : plugboard.pairs.length
      ? "Each connection is a reciprocal swap applied before and after the rotors."
      : "Add a connection to swap any two letters or special characters.");
  elements.plugboardError.classList.toggle("error", !plugboard.valid);
}

function addPlugboardPair() {
  const used = new Set(machine.plugboard.pairs.flat());
  const available = [...ALPHABET].filter((symbol) => !used.has(symbol));
  if (available.length < 2) return;
  validatePlugboard([...machine.plugboard.pairs, [available[0], available[1]]]);
  rebuildFromConfiguration();
}

function useDefaultPlugboard() {
  validatePlugboard(
    DEFAULT_PLUGBOARD_PAIRS.map((pair) => [...pair]),
  );
  rebuildFromConfiguration();
}

function clearPlugboard() {
  validatePlugboard([]);
  rebuildFromConfiguration();
}

function updatePlugboardPair(pairIndex, side, symbol) {
  const pairs = machine.plugboard.pairs.map((pair) => [...pair]);
  pairs[pairIndex][side] = symbol;
  validatePlugboard(pairs);
  rebuildFromConfiguration();
}

function removePlugboardPair(pairIndex) {
  validatePlugboard(
    machine.plugboard.pairs.filter((_, index) => index !== pairIndex),
  );
  rebuildFromConfiguration();
}

function createLetterBoard(container, isKeyboard) {
  container.innerHTML = KEYBOARD_ROWS.map(
    (row) => `
      <div class="letter-row">
        ${[...row]
          .map((symbol) =>
            isKeyboard
              ? `<button class="letter" type="button" data-key="${symbol}" aria-label="Press ${symbolName(symbol)}">${symbol}</button>`
              : `<span class="letter" data-lamp="${symbol}" aria-label="${symbolName(symbol)} lamp">${symbol}</span>`,
          )
          .join("")}
      </div>
    `,
  ).join("");
}

function updateRotorSelects() {
  const selects = [elements.leftRotor, elements.middleRotor, elements.rightRotor];
  selects.forEach((select, index) => {
    select.value = machine.rotorOrder[index];
    [...select.options].forEach((option) => {
      option.disabled = Boolean(
        ROTORS[option.value] &&
        option.value !== machine.rotorOrder[index] &&
        machine.rotorOrder.includes(option.value),
      );
    });
  });
}

function renderMachine() {
  machine.positions.forEach((position, index) => {
    const window = document.getElementById(`position-${index}`);
    if (window) window.textContent = toSymbol(position);
  });
  elements.cipherText.value = machine.history;
  elements.turnoverToggle.checked = machine.turnover;
  const valid = machineIsValid();
  elements.encryptMessage.disabled = !valid;
  elements.keyboard.classList.toggle("disabled", !valid);
  document.querySelectorAll("[data-reflector]").forEach((button) => {
    button.classList.toggle("active", button.dataset.reflector === machine.reflector);
  });
  renderActiveConfiguration();
  renderSessionStats();
}

function renderOperationMode() {
  const decrypting = operationMode === "decrypt";
  document.querySelectorAll("[data-operation-mode]").forEach((button) => {
    button.classList.toggle("active", button.dataset.operationMode === operationMode);
  });
  elements.inputLabel.textContent = decrypting ? "Ciphertext" : "Plaintext";
  elements.outputLabel.textContent = decrypting ? "Plaintext" : "Ciphertext";
  elements.operationAction.textContent = decrypting
    ? "Decipher message"
    : "Encipher message";
  elements.modeExplanation.textContent = decrypting
    ? "All 40 supported symbols are decrypted modulo 40; spaces pass through without stepping."
    : "A–Z and 14 special characters are encrypted modulo 40; spaces pass through without stepping.";
  elements.plainText.placeholder = decrypting
    ? "TYPE OR PASTE CIPHERTEXT…"
    : "TYPE A MESSAGE…";
  elements.cipherText.placeholder = decrypting
    ? "PLAINTEXT APPEARS HERE…"
    : "CIPHERTEXT APPEARS HERE…";
}

function renderTrace() {
  const trace = machine.lastTrace;
  if (!trace) {
    elements.traceSummary.textContent = "Press a supported symbol to follow the current.";
    elements.traceCard.innerHTML = `
      <div class="empty-trace">
        <span class="empty-trace-icon">↯</span>
        <p>The machine steps before the first encrypted symbol; its full electrical journey will appear here.</p>
      </div>
    `;
    return;
  }

  elements.traceSummary.textContent =
    `${trace.input} became ${trace.output} as the rotors moved ${trace.step.before} → ${trace.step.after}.`;

  const nodes = [
    { letter: trace.input, label: "Key", detail: "Input", className: "endpoint" },
    {
      letter: trace.plugboardEntryOutput,
      label: "Plugboard",
      detail: `${trace.plugboardEntryInput} ↔ ${trace.plugboardEntryOutput}`,
      className: "plugboard",
    },
    ...trace.forward.map((item) => ({
      letter: item.externalOutput,
      label: `Rotor ${item.rotorName}`,
      detail: `→ ${item.internalInput}:${item.internalOutput}`,
      className: "",
    })),
    {
      letter: trace.reflectorOutput,
      label: `Reflector ${reflectorDisplayName()}`,
      detail: `${trace.reflectorInput} ↔ ${trace.reflectorOutput}`,
      className: "reflector",
    },
    ...trace.reverse.map((item) => ({
      letter: item.externalOutput,
      label: `Rotor ${item.rotorName}`,
      detail: `← ${item.internalInput}:${item.internalOutput}`,
      className: "",
    })),
    {
      letter: trace.plugboardExitOutput,
      label: "Plugboard",
      detail: `${trace.plugboardExitInput} ↔ ${trace.plugboardExitOutput}`,
      className: "plugboard",
    },
    { letter: trace.output, label: "Lamp", detail: "Output", className: "endpoint" },
  ];

  const badges = [
    { label: "Right stepped", active: trace.step.rightStepped },
    { label: "Middle stepped", active: trace.step.middleStepped },
    { label: "Left stepped", active: trace.step.leftStepped },
    { label: "Right at notch", active: trace.step.rightAtNotch },
    { label: "Middle at notch", active: trace.step.middleAtNotch },
  ];

  elements.traceCard.innerHTML = `
    <div class="trace-step">
      <strong>${trace.step.before} → ${trace.step.after}</strong>
      <div class="step-badges">
        ${badges
          .map((badge) => `<span class="step-badge${badge.active ? " active" : ""}">${badge.label}</span>`)
          .join("")}
      </div>
    </div>
    <div class="signal-path">
      ${nodes
        .map(
          (node) => `
            <div class="signal-node ${node.className}">
              <span class="signal-letter">${node.letter}</span>
              <strong>${node.label}</strong>
              <small>${node.detail}</small>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function illuminate(input, output) {
  window.clearTimeout(lampTimer);
  document.querySelectorAll(".letter.lit, .letter.pressed").forEach((item) => {
    item.classList.remove("lit", "pressed");
  });
  document.querySelector(`[data-key="${input}"]`)?.classList.add("pressed");
  document.querySelector(`[data-lamp="${output}"]`)?.classList.add("lit");
  lampTimer = window.setTimeout(() => {
    document.querySelectorAll(".letter.lit, .letter.pressed").forEach((item) => {
      item.classList.remove("lit", "pressed");
    });
  }, 450);
}

function resetPositions(clearHistory = true) {
  machine.positions = [...machine.initialPositions];
  if (clearHistory) {
    machine.history = "";
    machine.lastTrace = null;
    machine.stats = createEmptyStats();
  }
  renderMachine();
  renderTrace();
}

function rebuildFromConfiguration() {
  machine.positions = [...machine.initialPositions];
  machine.history = "";
  machine.lastTrace = null;
  machine.stats = createEmptyStats();
  createRotorWindows();
  createCustomRotorEditor();
  createReflectorEditor();
  createPlugboardEditor();
  updateRotorSelects();
  renderMachine();
  renderTrace();
}

function restoreDefaults() {
  operationMode = "encrypt";
  Object.assign(machine, {
    rotorOrder: [...DEFAULTS.rotorOrder],
    rings: [...DEFAULTS.rings],
    positions: [...DEFAULTS.positions],
    initialPositions: [...DEFAULTS.positions],
    reflector: DEFAULTS.reflector,
    turnover: DEFAULTS.turnover,
    customRotors: DEFAULTS.customRotors.map((rotor) => ({ ...rotor })),
    customReflector: {
      ...DEFAULTS.customReflector,
      pairs: [...DEFAULTS.customReflector.pairs],
      invalidIndexes: [],
    },
    plugboard: {
      ...DEFAULTS.plugboard,
      pairs: DEFAULTS.plugboard.pairs.map((pair) => [...pair]),
      invalidIndexes: [],
    },
    history: "",
    lastTrace: null,
    stats: createEmptyStats(),
  });
  createRotorWindows();
  createCustomRotorEditor();
  createReflectorEditor();
  createPlugboardEditor();
  updateRotorSelects();
  renderMachine();
  renderOperationMode();
  renderTrace();
}

function cleanMessageSymbols(value) {
  return cleanAlphabetSymbols(value);
}

function transformMessage(value) {
  let result = "";
  for (const character of value) {
    const normalized = normalizeSymbol(character);
    result += normalized
      ? pressKey(normalized, false)
      : character;
  }
  return result;
}

function bindEvents() {
  [elements.leftRotor, elements.middleRotor, elements.rightRotor].forEach((select, index) => {
    select.addEventListener("change", () => {
      machine.rotorOrder[index] = select.value;
      if (customRotorIndex(select.value) >= 0) elements.wiringLab.open = true;
      rebuildFromConfiguration();
    });
  });

  document.querySelectorAll("[data-reflector]").forEach((button) => {
    button.addEventListener("click", () => {
      machine.reflector = button.dataset.reflector;
      rebuildFromConfiguration();
    });
  });

  document.querySelectorAll("[data-operation-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      operationMode = button.dataset.operationMode;
      machine.history = "";
      machine.lastTrace = null;
      resetPositions(true);
      renderOperationMode();
    });
  });

  elements.turnoverToggle.addEventListener("change", () => {
    machine.turnover = elements.turnoverToggle.checked;
    rebuildFromConfiguration();
  });

  elements.rotorWindows.addEventListener("click", (event) => {
    const button = event.target.closest("[data-position-delta]");
    if (!button) return;
    const index = Number(button.dataset.rotorIndex);
    const delta = Number(button.dataset.positionDelta);
    machine.positions[index] = (machine.positions[index] + delta + MODULUS) % MODULUS;
    machine.initialPositions = [...machine.positions];
    machine.history = "";
    machine.lastTrace = null;
    machine.stats = createEmptyStats();
    renderMachine();
    renderTrace();
  });

  elements.rotorWindows.addEventListener("change", (event) => {
    const select = event.target.closest("[data-ring-index]");
    if (!select) return;
    machine.rings[Number(select.dataset.ringIndex)] = Number(select.value);
    rebuildFromConfiguration();
  });

  elements.keyboard.addEventListener("click", (event) => {
    const key = event.target.closest("[data-key]");
    if (key && machineIsValid()) pressKey(key.dataset.key);
  });

  elements.customRotorEditor.addEventListener("click", (event) => {
    const button = event.target.closest("[data-install-custom]");
    if (!button) return;
    installCustomRotor(Number(button.dataset.installCustom));
  });

  elements.customRotorEditor.addEventListener("input", (event) => {
    const wiringInput = event.target.closest("[data-custom-wiring]");
    const notchInput = event.target.closest("[data-custom-notch]");
    if (!wiringInput && !notchInput) return;

    const index = Number(
      wiringInput?.dataset.customWiring ?? notchInput?.dataset.customNotch,
    );
    const card = elements.customRotorEditor.querySelector(`[data-custom-card="${index}"]`);
    const wiring = card.querySelector("[data-custom-wiring]").value;
    const notch = card.querySelector("[data-custom-notch]")?.value ?? "";
    const rotor = validateCustomRotor(index, wiring, notch);
    card.querySelectorAll("input").forEach((input) => {
      input.setAttribute("aria-invalid", String(!rotor.valid));
    });
    const status = card.querySelector("[data-custom-status]");
    const active = machine.rotorOrder[index] === CUSTOM_ROTOR_IDS[index];
    status.textContent = rotor.error || (active
      ? "Valid permutation · In use"
      : "Valid permutation · Not active");
    status.classList.toggle("error", !rotor.valid);
    const installButton = card.querySelector("[data-install-custom]");
    installButton.disabled = active || !rotor.valid;
    machine.history = "";
    machine.lastTrace = null;
    machine.stats = createEmptyStats();
    machine.positions = [...machine.initialPositions];
    renderCustomValidity();
    renderMachine();
    renderTrace();
  });

  elements.reflectorPairs.addEventListener("input", (event) => {
    if (machine.reflector !== "CUSTOM") return;
    const input = event.target.closest("[data-reflector-pair]");
    if (!input) return;

    input.value = cleanAlphabetSymbols(input.value).slice(0, 2);
    const pairs = [...elements.reflectorPairs.querySelectorAll("[data-reflector-pair]")]
      .map((pairInput) => pairInput.value);
    const reflector = validateCustomReflector(pairs);
    elements.reflectorPairs
      .querySelectorAll("[data-reflector-pair]")
      .forEach((pairInput, index) => {
        pairInput.setAttribute(
          "aria-invalid",
          String(reflector.invalidIndexes.includes(index)),
        );
      });
    machine.history = "";
    machine.lastTrace = null;
    machine.stats = createEmptyStats();
    machine.positions = [...machine.initialPositions];
    renderReflectorValidity();
    renderMachine();
    renderTrace();
  });

  elements.clearReflectorPairs.addEventListener(
    "click",
    clearCustomReflectorPairs,
  );

  elements.addPlugboardPair.addEventListener("click", addPlugboardPair);
  elements.useDefaultPlugboard.addEventListener("click", useDefaultPlugboard);
  elements.clearPlugboard.addEventListener("click", clearPlugboard);

  elements.plugboardConnections.addEventListener("change", (event) => {
    const select = event.target.closest("[data-plugboard-pair]");
    if (!select) return;
    updatePlugboardPair(
      Number(select.dataset.plugboardPair),
      Number(select.dataset.plugboardSide),
      select.value,
    );
  });

  elements.plugboardConnections.addEventListener("click", (event) => {
    const button = event.target.closest("[data-remove-plugboard]");
    if (!button) return;
    removePlugboardPair(Number(button.dataset.removePlugboard));
  });

  document.addEventListener("keydown", (event) => {
    if (
      event.metaKey ||
      event.ctrlKey ||
      event.altKey ||
      ["TEXTAREA", "INPUT", "SELECT"].includes(document.activeElement?.tagName)
    ) {
      return;
    }
    const symbol = normalizeSymbol(event.key);
    if (symbol) {
      event.preventDefault();
      pressKey(symbol);
    }
  });

  elements.plainText.addEventListener("input", () => {
    const count = cleanMessageSymbols(elements.plainText.value).length;
    const spaces = [...elements.plainText.value].filter((character) => character === " ").length;
    elements.inputCount.textContent =
      `${count} symbol${count === 1 ? "" : "s"}` +
      (spaces ? ` · ${spaces} preserved space${spaces === 1 ? "" : "s"}` : "");
  });

  elements.encryptMessage.addEventListener("click", () => {
    const message = elements.plainText.value;
    if (!cleanMessageSymbols(message)) {
      elements.plainText.focus();
      return;
    }
    resetPositions(true);
    const result = transformMessage(message);
    machine.history = result;
    elements.cipherText.value = result;
    if (machine.lastTrace) illuminate(machine.lastTrace.input, machine.lastTrace.output);
  });

  elements.copyOutput.addEventListener("click", async () => {
    if (!elements.cipherText.value) return;
    try {
      await navigator.clipboard.writeText(elements.cipherText.value);
      elements.copyOutput.textContent = "Copied";
      window.setTimeout(() => {
        elements.copyOutput.textContent = "Copy";
      }, 1200);
    } catch {
      elements.cipherText.select();
      document.execCommand("copy");
    }
  });

  elements.restoreDefaults.addEventListener("click", restoreDefaults);
  elements.resetMachine.addEventListener("click", () => resetPositions(true));
  elements.clearMachine.addEventListener("click", () => {
    machine.history = "";
    machine.lastTrace = null;
    elements.plainText.value = "";
    elements.inputCount.textContent = "0 symbols";
    resetPositions(true);
  });

  elements.aboutButton.addEventListener("click", () => elements.aboutDialog.showModal());
  elements.closeAbout.addEventListener("click", () => elements.aboutDialog.close());
  elements.aboutDialog.addEventListener("click", (event) => {
    if (event.target === elements.aboutDialog) elements.aboutDialog.close();
  });
}

function init() {
  [
    "leftRotor",
    "middleRotor",
    "rightRotor",
    "rotorWindows",
    "turnoverToggle",
    "wiringLab",
    "customRotorEditor",
    "wiringValidity",
    "activeConfiguration",
    "sessionSummary",
    "movementStats",
    "reflectorPanel",
    "reflectorPairs",
    "reflectorLabEyebrow",
    "reflectorLabTitle",
    "reflectorLabCopy",
    "reflectorValidity",
    "reflectorError",
    "clearReflectorPairs",
    "plugboardConnections",
    "plugboardValidity",
    "plugboardError",
    "addPlugboardPair",
    "useDefaultPlugboard",
    "clearPlugboard",
    "lampboard",
    "keyboard",
    "plainText",
    "cipherText",
    "inputLabel",
    "outputLabel",
    "operationAction",
    "modeExplanation",
    "inputCount",
    "encryptMessage",
    "copyOutput",
    "restoreDefaults",
    "resetMachine",
    "clearMachine",
    "traceSummary",
    "traceCard",
    "aboutButton",
    "aboutDialog",
    "closeAbout",
  ].forEach((id) => {
    elements[id] = document.getElementById(id);
  });

  populateRotorSelect(
    elements.leftRotor,
    machine.rotorOrder[0],
    CUSTOM_ROTOR_IDS[0],
    "Custom wiring…",
  );
  populateRotorSelect(
    elements.middleRotor,
    machine.rotorOrder[1],
    CUSTOM_ROTOR_IDS[1],
    "Custom wiring…",
  );
  populateRotorSelect(
    elements.rightRotor,
    machine.rotorOrder[2],
    CUSTOM_ROTOR_IDS[2],
    "Custom wiring…",
  );
  createRotorWindows();
  createCustomRotorEditor();
  createReflectorEditor();
  createPlugboardEditor();
  createLetterBoard(elements.lampboard, false);
  createLetterBoard(elements.keyboard, true);
  updateRotorSelects();
  bindEvents();
  renderMachine();
  renderOperationMode();
}

document.addEventListener("DOMContentLoaded", init);
