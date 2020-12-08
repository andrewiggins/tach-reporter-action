const core = require("@actions/core");
const github = require("@actions/github");
const { reportTachResults } = require("../index");
const { getLogger, getInputs } = require("./util");
const { fullVersion } = require("../utils/version");

(async () => {
	const token = core.getInput("github-token", { required: true });

	const logger = getLogger();
	const inputs = getInputs(logger);
	const octokit = github.getOctokit(token);

	logger.info(`Running tachometer-reporter-action ${fullVersion}`);

	if (github.context.eventName !== "pull_request") {
		logger.info(
			"Not a pull request event. Skipping this action and doing nothing."
		);
		logger.info("Event name: " + github.context.eventName);
		return;
	}

	try {
		core.debug("Inputs: " + JSON.stringify(inputs, null, 2));

		await reportTachResults(octokit, github.context, inputs, logger);
	} catch (e) {
		core.setFailed(e.message);
	}
})();
