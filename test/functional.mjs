// Isolated functional test for @dsh-user/narrative-voice.
// Simulates the system-prompt/assemble waterfall call and the /voice command
// against the real plugin module + real schemastery.
// Run via `test/run-test.ps1` (creates a temporary schemastery junction,
// runs this file, then removes the junction).
import { apply, Config } from "../lib/index.js";

let failures = 0;
const check = (name, cond, extra) => {
	console.log(`${cond ? "PASS" : "FAIL"}  ${name}${extra ? "  -> " + extra : ""}`);
	if (!cond) failures++;
};

// --- 1. Config schema validates & fills defaults (Schema is callable: Config(raw)) ---
const configUser = Config({});
check("Config defaults: voice=user", configUser.voice === "user", JSON.stringify(configUser));
check("Config defaults: defaultActive=true", configUser.defaultActive === true);
const configAi = Config({ voice: "ai", defaultActive: false });
check("Config override: voice=ai / defaultActive=false", configAi.voice === "ai" && configAi.defaultActive === false);
let threw = false;
try { Config({ voice: "bogus" }); } catch { threw = true; }
check("Config rejects invalid voice", threw);

// --- 1b. Standard Schema interface: Cordis resolveConfig reads Config["~standard"].validate ---
const st = Config["~standard"];
check("Config exposes ~standard interface", !!st && st.version === 1 && typeof st.validate === "function");
check("~standard.validate ok -> {value}", JSON.stringify(st.validate({})) === JSON.stringify({ value: Config({}) }), JSON.stringify(st.validate({})));
const bad = st.validate({ voice: "bogus" });
check("~standard.validate bad -> {issues}", Array.isArray(bad.issues) && bad.issues.length > 0, JSON.stringify(bad));

// --- 2. apply registers the waterfall listener and the /voice command ---
const listeners = [];
let command;
const mockCtx = {
	on(event, cb, opts) { listeners.push({ event, cb, opts }); },
	commands: { register(def) { command = def; } }
};
apply(mockCtx, configUser);

const hook = listeners.find((l) => l.event === "system-prompt/assemble");
check("listener registered on system-prompt/assemble", !!hook);
check("listener is global:true", hook?.opts?.global === true);
check("/voice command registered", command?.name === "voice");

// --- 3. Assemble simulation: rewrite happens when active ---
// The REAL assembled schema (verified against a live request/header) is
// JSON-Schema form: parameters = { type: "object", properties: { questions } }.
const original = "Questions to ask the user before continuing.";
const questionsField = (description) => ({
	type: "array",
	description,
	items: {
		type: "object",
		properties: {
			id: { type: "string" },
			question: { type: "string" },
			header: { type: "string" },
			options: { type: "array" },
			multi_select: { type: "boolean" }
		}
	}
});
const makeAssembly = () => ({
	tools: [
		{
			name: "ask_user_question",
			description: "Ask the user a concise question…",
			parameters: { type: "object", properties: { questions: questionsField(original) } }
		},
		{ name: "other_tool", parameters: { x: { description: "untouched" } } }
	]
});
const qDesc = (assembly) => assembly.tools[0].parameters.properties.questions.description;
const runAssemble = async (assembly) => {
	return await hook.cb(assembly, { scope: undefined }, () => Promise.resolve(assembly));
};

const a1 = makeAssembly();
await runAssemble(a1);
const rewritten = qDesc(a1);
check("description is rewritten (not equal original)", rewritten !== original, rewritten.slice(0, 60) + "…");
check("rewrite embeds 方案B binding 我=answerer", rewritten.includes("我") && rewritten.includes("你"));
check("rewrite mentions the tool-only scope", rewritten.includes("this tool only"));
check("other tool untouched", a1.tools[1].parameters.x.description === "untouched");
check("rewrite keeps original purpose text", rewritten.startsWith(original));

// --- 3b. Regression: rewrite must target the REAL JSON-Schema shape
// (parameters.properties.questions.description). This is the exact field that
// previously existed at parameters.questions.description and silently no-op'd.
check("REAL shape: parameters.properties.questions.description", rewritten.startsWith(original));

// --- 3c. Bare-shape fallback still works ({ questions } with no properties) ---
const bare = { tools: [{ name: "ask_user_question", parameters: { questions: { description: original } } }] };
await hook.cb(bare, { scope: undefined }, () => Promise.resolve(bare));
check("bare-shape fallback { questions } also rewritten", bare.tools[0].parameters.questions.description !== original);

// --- 4. /voice off disables the rewrite ---
let r1 = command.handler({ rawInput: "off" });
check("/voice off returns success + OFF", r1.kind === "success" && /OFF/.test(r1.text), r1.text);
const a2 = makeAssembly();
await runAssemble(a2);
check("after /voice off, description restored to original", qDesc(a2) === original);

// --- 5. /voice on re-enables; bad arg errors ---
command.handler({ rawInput: "on" });
const a3 = makeAssembly();
await runAssemble(a3);
check("after /voice on, rewrite works again", qDesc(a3) !== original);
let r2 = command.handler({ rawInput: "garbage" });
check("/voice garbage returns error", r2.kind === "error", r2.text);
let r3 = command.handler({ rawInput: "" });
check("/voice (no arg) shows state", r3.kind === "success");

// --- 6. defaultActive=false means disabled until /voice on ---
apply(mockCtx, Config({ defaultActive: false }));
const hook2 = listeners[listeners.length - 1];
const a4 = makeAssembly();
await hook2.cb(a4, {}, () => Promise.resolve(a4));
check("defaultActive=false -> no rewrite at first", qDesc(a4) === original);

// --- 7. 方案A (ai voice) binding ---
apply(mockCtx, Config({ voice: "ai" }));
const hook3 = listeners[listeners.length - 1];
const a5 = makeAssembly();
await hook3.cb(a5, {}, () => Promise.resolve(a5));
check("方案A rewrite: 我=AI binding present", /"我" is the AI/.test(qDesc(a5)));

console.log(failures === 0 ? "\nALL TESTS PASSED" : `\n${failures} TEST(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
