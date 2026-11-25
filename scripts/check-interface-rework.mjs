import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const index = read("../index.html");
const main = read("../main.js");
const player = read("../player.js");
const readme = read("../README.md");

assert.doesNotMatch(index, /phone/i, "the phone interface and its styling must be completely removed");
assert.doesNotMatch(main, /phoneOpen|deepseekerAppOpen|togglePhone|phoneStory|phoneCardText|showHouseIntroPhoneMessage/, "gameplay code must not depend on the phone");
assert.doesNotMatch(player, /phones/i, "player input comments must no longer refer to a phone overlay");
assert.doesNotMatch(readme, /\bP\s+—\s+phone/i, "the controls guide must not advertise a phone");
assert.match(index, /id="adminOverlay"/, "developer tools must remain available outside the player phone UI");
assert.match(index, /id="signalGlitchDetail"/, "the signal transmission overlay must include a message body");
assert.match(main, /signalGlitchDetail\.textContent/, "signal transmissions must display their detail text");
assert.match(main, /function showHouseIntroTransmission/, "the opening tutorial must use a signal transmission");
assert.match(main, /RADIO_CHANNELS/, "the handheld receiver must expose tunable channels");
assert.match(main, /function cycleRadioChannel/, "the player must be able to cycle receiver channels");
assert.match(main, /KeyR/, "receiver tuning must have a keyboard binding");
assert.match(index, /<span class="key">R<\/span>/, "the controls panel must explain receiver tuning");
assert.match(main, /e\.code==="F3"/, "developer tools must have a separate developer-only shortcut");
console.log("Interface migration checks passed.");
