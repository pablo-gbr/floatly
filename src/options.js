const defaultSettings = {
  accentColor: "#45d19f",
  clickVideoToTogglePlayback: true,
  rememberWindowSize: false,
  windowSize: null,
  speedSteps: [0.5, 0.75, 1, 1.25, 1.5, 2],
  shortcuts: {
    playPause: " ",
    rewind: "ArrowLeft",
    forward: "ArrowRight",
    volumeUp: "ArrowUp",
    volumeDown: "ArrowDown"
  },
  controls: {
    progress: true,
    rewind: true,
    forward: true,
    speed: true,
    volume: true,
    fit: true,
    time: true
  }
};

const controlLabels = {
  progress: "Progress bar",
  rewind: "Rewind",
  forward: "Forward",
  speed: "Speed menu",
  volume: "Volume slider",
  fit: "Crop / fit",
  time: "Time"
};

const shortcutLabels = {
  playPause: "Play / pause",
  rewind: "Rewind",
  forward: "Forward",
  volumeUp: "Volume up",
  volumeDown: "Volume down"
};

const colorInput = document.querySelector("#accentColor");
const controls = document.querySelector("#controls");
const clickVideoToTogglePlayback = document.querySelector("#clickVideoToTogglePlayback");
const rememberWindowSize = document.querySelector("#rememberWindowSize");
const speedSteps = document.querySelector("#speedSteps");
const shortcuts = document.querySelector("#shortcuts");
const reset = document.querySelector("#reset");

init();

async function init() {
  const settings = await getSettings();
  render(settings);
}

async function getSettings() {
  const stored = await chrome.storage.sync.get({ floatlySettings: defaultSettings });
  return mergeSettings(stored.floatlySettings);
}

function mergeSettings(settings) {
  const merged = {
    ...defaultSettings,
    ...settings,
    controls: {
      ...defaultSettings.controls,
      ...settings?.controls
    },
    shortcuts: {
      ...defaultSettings.shortcuts,
      ...settings?.shortcuts
    }
  };
  if (typeof settings?.clickVideoToPause === "boolean") {
    merged.clickVideoToTogglePlayback = settings.clickVideoToPause;
  }
  return merged;
}

function render(settings) {
  colorInput.value = settings.accentColor;
  clickVideoToTogglePlayback.checked = settings.clickVideoToTogglePlayback;
  rememberWindowSize.checked = settings.rememberWindowSize;
  speedSteps.value = settings.speedSteps.join(", ");
  controls.textContent = "";
  shortcuts.textContent = "";

  for (const [key, labelText] of Object.entries(controlLabels)) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = settings.controls[key];
    input.addEventListener("change", () => saveControl(key, input.checked));
    label.append(input, labelText);
    controls.append(label);
  }

  for (const [key, labelText] of Object.entries(shortcutLabels)) {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "text";
    input.readOnly = true;
    input.value = displayKey(settings.shortcuts[key]);
    input.addEventListener("keydown", (event) => setShortcut(event, key, input));
    label.className = "field";
    label.append(labelText, input);
    shortcuts.append(label);
  }
}

colorInput.addEventListener("input", async () => {
  const settings = await getSettings();
  settings.accentColor = colorInput.value;
  await save(settings);
});

reset.addEventListener("click", async () => {
  await save(defaultSettings);
  render(defaultSettings);
});

clickVideoToTogglePlayback.addEventListener("change", async () => {
  const settings = await getSettings();
  settings.clickVideoToTogglePlayback = clickVideoToTogglePlayback.checked;
  delete settings.clickVideoToPause;
  await save(settings);
});

rememberWindowSize.addEventListener("change", async () => {
  const settings = await getSettings();
  settings.rememberWindowSize = rememberWindowSize.checked;
  if (!rememberWindowSize.checked) settings.windowSize = null;
  await save(settings);
});

speedSteps.addEventListener("change", async () => {
  const parsed = parseSpeedSteps(speedSteps.value);
  const settings = await getSettings();
  settings.speedSteps = parsed;
  speedSteps.value = parsed.join(", ");
  await save(settings);
});

async function saveControl(key, value) {
  const settings = await getSettings();
  settings.controls[key] = value;
  await save(settings);
}

async function save(settings) {
  await chrome.storage.sync.set({ floatlySettings: settings });
}

async function setShortcut(event, key, input) {
  if (event.key === "Tab") return;

  event.preventDefault();
  const shortcut = event.key === "Escape" ? defaultSettings.shortcuts[key] : event.key;
  const settings = await getSettings();
  settings.shortcuts[key] = shortcut;
  input.value = displayKey(shortcut);
  await save(settings);
}

function parseSpeedSteps(value) {
  const steps = value
    .split(",")
    .map((step) => Number(step.trim()))
    .filter((step) => Number.isFinite(step) && step > 0 && step <= 16);
  const unique = [...new Set(steps)].sort((a, b) => a - b);

  // ponytail: six speeds keep the tiny menu readable; upgrade to paging if people want huge lists.
  return unique.slice(0, 6).length ? unique.slice(0, 6) : defaultSettings.speedSteps;
}

function displayKey(key) {
  return key === " " ? "Space" : key;
}
