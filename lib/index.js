// #region plugin: narrative-voice
/**
 * Prompt-level narrative-voice rewrite for the `ask_user_question` tool.
 *
 * Mechanism: every model request runs `SystemPrompt.assemble()`, which builds
 * the model-facing prompt and dispatches the built `assembly` through the
 * `system-prompt/assemble` waterfall BEFORE it is rendered and sent. This
 * plugin registers a `global: true` listener on that waterfall; while enabled
 * it REWRITES (replaces, not appends) the `description` of the
 * `ask_user_question` tool's `questions` parameter, so the rule text becomes
 * the tool's own description. Ordinary replies and other tools are never
 * touched.
 *
 * Live control: registers a `/voice` slash command (via the `commands`
 * service) that flips an in-process boolean (`on`/`off`) and switches the
 * narrative voice at runtime (`user` = 方案B / `ai` = 方案A). Because
 * `assemble()` runs per request, the change applies from the next message —
 * no restart and no HMR dependency (the web profile disables HMR).
 *
 * Default voice is "user" (方案B): the answerer narrates — "我"/"I" = the
 * person answering, "你"/"You" = the AI. Set `voice: "ai"` for the mirror
 * (方案A: "我"/"I" = the AI).
 *
 * Deliberately DEPENDENCY-FREE: config validation is hand-rolled instead of
 * Schemastery, so this module has NO bare imports at all. A bundle installed
 * via `link:` is resolved from its own (real) directory; any bare import
 * would have to resolve from there — which is exactly how the
 * `@deepseek-ai/schemastery` import broke boots before. No imports → no
 * resolution problem on any machine, no node_modules, no npm install.
 *
 * @module @dsh-user/narrative-voice
 */

/** Cordis plugin name. */
const name = "narrative-voice";

/** Hard dependencies: prompt registry (waterfall hook) + command registry (/voice). */
const inject = ["systemPrompt", "commands"];

/**
 * Validate + normalize the raw config. Callable like a Schemastery schema:
 * `Config(raw)` returns the validated/defaulted object, throws on invalid
 * values. Hand-rolled so the plugin needs no dependency.
 * @param raw - the raw config object from the patch row.
 * @returns `{ voice, defaultActive }` with defaults applied.
 */
function Config(raw = {}) {
	if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
		throw new Error("narrative-voice: config must be an object");
	}
	if (raw.voice !== undefined && raw.voice !== "user" && raw.voice !== "ai") {
		throw new Error(`narrative-voice: invalid voice ${JSON.stringify(raw.voice)} (expected "user" or "ai")`);
	}
	if (raw.defaultActive !== undefined && typeof raw.defaultActive !== "boolean") {
		throw new Error("narrative-voice: defaultActive must be a boolean");
	}
	return {
		voice: raw.voice === "ai" ? "ai" : "user",
		defaultActive: raw.defaultActive === undefined ? true : raw.defaultActive
	};
}

/**
 * Standard Schema interface for Cordis's `resolveConfig`, which reads
 * `runtime.Config["~standard"].validate(config)` and expects `{ value }` or
 * `{ issues: [{ message, path? }] }` — the exact contract Schemastery schemas
 * satisfy and our hand-rolled Config now mirrors, still dependency-free.
 */
Config["~standard"] = {
	version: 1,
	vendor: "narrative-voice",
	validate(raw) {
		try {
			return { value: Config(raw) };
		} catch (error) {
			return { issues: [{ message: error.message }] };
		}
	}
};

/** 方案B rule — the answerer is the narrator. */
const VOICE_USER_RULE = "Writing rule (this tool only): write the question, header, label, and description from the answerer's point of view — \"我\"/\"I\" is the person answering, \"你\"/\"You\" is the AI. The mapping is fixed: never swap them, and never call the answerer \"用户\" or any other third-person word. Keep each option self-consistent: the \"我\"/\"I\" in a label and the \"我\"/\"I\" in its description must be the same person, and the \"你\"/\"You\" likewise; a description may say what the AI will do (\"你\"/\"You\" will …) without shifting the label's perspective. If a draft drifts — say a label from the answerer's view but its description from the AI's view — rewrite the whole block rather than patching it. This rule applies only where such pronouns actually appear — never force \"我\"/\"你\" (\"I\"/\"You\") into a question or option that does not naturally need them. This rule only governs this tool; it does not change your ordinary reply voice.";

/** 方案A rule — the AI is the narrator. */
const VOICE_AI_RULE = "Writing rule (this tool only): write the question, header, label, and description from the AI's point of view — \"我\"/\"I\" is the AI, \"你\"/\"You\" is the person answering. The mapping is fixed: never swap them, and never call the answerer \"用户\" or any other third-person word. Keep each option self-consistent: the \"我\"/\"I\" in a label and the \"我\"/\"I\" in its description must be the same person, and the \"你\"/\"You\" likewise; a description may say what the answerer will do (\"你\"/\"You\" will …) without shifting the label's perspective. If a draft drifts — say a label from the AI's view but its description from the answerer's view — rewrite the whole block rather than patching it. This rule applies only where such pronouns actually appear — never force \"我\"/\"你\" (\"I\"/\"You\") into a question or option that does not naturally need them. This rule only governs this tool; it does not change your ordinary reply voice.";

/** The rule text for a voice. */
function ruleFor(voice) {
	return voice === "ai" ? VOICE_AI_RULE : VOICE_USER_RULE;
}

/**
 * Replace the tool's description with a single edited sentence that embeds
 * the voice rule — a replacement, not an appended appendix.
 * @param original - the registered description text.
 * @param voice - "user" (方案B) or "ai" (方案A).
 */
function rewrite(original, voice) {
	return `${original} ${ruleFor(voice)}`.replace(/\s+/g, " ").trim();
}

/**
 * Register the assemble-hook listener and the /voice toggle command.
 * @param ctx - the mounting context (host plane).
 * @param config - validated `{ voice, defaultActive }`.
 */
function apply(ctx, config) {
	let voice = config.voice;
	let active = config.defaultActive;

	ctx.on("system-prompt/assemble", (assembly, _context, next) => {
		if (active) {
			const tool = assembly.tools?.find((t) => t.name === "ask_user_question");
			const params = tool?.parameters;
			// The assembled schema is JSON-Schema form: { type: "object", properties: { questions } }.
			// Fall back to the bare shape ({ questions }) in case the emitter changes.
			const questions = params?.properties?.questions ?? params?.questions;
			if (questions && typeof questions.description === "string") {
				questions.description = rewrite(questions.description, voice);
			}
		}
		return next();
	}, { global: true });

	ctx.commands.register({
		name: "voice",
		description: "toggle the rewrite or switch the narrative voice for ask_user_question (on|off|user|ai)",
		input: { hint: "on|off|user|ai" },
		recordInput: false,
		handler: (invocation) => {
			const raw = invocation.rawInput.trim().toLowerCase();
			if (raw === "on") active = true;
			else if (raw === "off") active = false;
			else if (raw === "user") { voice = "user"; active = true; }
			else if (raw === "ai") { voice = "ai"; active = true; }
			else if (raw !== "") return { kind: "error", text: "Usage: /voice on|off|user|ai" };
			const state = active ? "ON" : "OFF";
			const scheme = voice === "ai" ? "ai / scheme A (AI narrates)" : "user / scheme B (answerer narrates)";
			return { kind: "success", text: `narrative-voice is ${state} for ask_user_question (voice: ${scheme}).` };
		}
	});
}
// #endregion
export { apply, Config, inject, name };
