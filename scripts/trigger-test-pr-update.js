const path = require("path");
const { readFile, writeFile, readdir } = require("fs").promises;
const { execSync } = require("child_process");

const repoRoot = (...args) => path.join(__dirname, "..", ...args);
const workflow = (...args) => repoRoot(".github/workflows", ...args);

/** @type {import('child_process').ExecSyncOptions} */
const execOpts = {
	cwd: repoRoot(),
	stdio: "inherit",
};

/**
 * @param {string} newBranchName
 * @returns {Promise<string[]>}
 */
async function updateActionDefs(newBranchName) {
	const workflowDir = workflow();
	const workflowPaths = (await readdir(workflowDir))
		.filter((fileName) => fileName.endsWith(".yml"))
		.map((fileName) => workflow(fileName));

	for (let workflowPath of workflowPaths) {
		let contents = await readFile(workflowPath, "utf8");
		let newContents = contents.replace(
			/uses: andrewiggins\/tachometer-reporter-action@[A-Za-z0-9_-]+/g,
			`uses: andrewiggins/tachometer-reporter-action@${newBranchName}`
		);

		console.log(`Updating ${path.basename(workflowPath)} ...`);
		await writeFile(workflowPath, newContents, "utf8");
	}

	return workflowPaths;
}

async function updateResultsFile() {
	const resultsPath = repoRoot("tests/results/test-results.json");
	/** @type {import('../src/global').TachResults} */
	const results = JSON.parse(await readFile(resultsPath, "utf8"));

	const baseFrameworkIndex = results.benchmarks.findIndex(
		(b) => b.version == "base-framework"
	);
	const localFramework = results.benchmarks.find(
		(b) => b.version == "local-framework"
	);

	const diff = localFramework.differences[baseFrameworkIndex];

	// If faster, make it unsure
	if (diff.absolute.low < 0 && diff.absolute.high < 0) {
		localFramework.differences[baseFrameworkIndex] = {
			absolute: {
				low: -4.100584444274766,
				high: 5.235917753535269,
			},
			percentChange: {
				low: -9.662003704353273,
				high: 12.318940173956952,
			},
		};
	}
	// if unsure, make it slower
	else if (diff.absolute.low < 0 && diff.absolute.high > 0) {
		localFramework.differences[baseFrameworkIndex] = {
			absolute: {
				low: 3.5470975408067247,
				high: 12.768235849180819,
			},
			percentChange: {
				low: 8.68324988103642,
				high: 37.74505918646691,
			},
		};
	}
	// if slower, make it faster
	else {
		localFramework.differences[baseFrameworkIndex] = {
			absolute: {
				low: -12.768235849180819,
				high: -3.5470975408067247,
			},
			percentChange: {
				low: -28.411804797038677,
				high: -9.269181809727653,
			},
		};
	}

	await writeFile(resultsPath, JSON.stringify(results, null, 2) + "\n", "utf8");
}

async function main() {
	// const currentBranch = execSync("git branch --show", {
	// 	encoding: "utf8",
	// }).trim();
	// console.log(`Current branch: ${currentBranch}`);
	const currentBranch = "main";

	execSync("git checkout test-forked-pr", execOpts);

	await updateResultsFile();

	// const updatedFiles = await updateActionDefs(currentBranch);

	[
		`git add tests/results/test-results.json`,
		// ...updatedFiles.map((filePath) => `git add ${filePath}`),
		`git status -s`,
		`git commit -m "Trigger Forked PR action run: ${currentBranch}"`,
		`git push`,
		// `git checkout ${currentBranch}`,
	].forEach((command) => execSync(command, execOpts));
}

// updateResultsFile();
main();
