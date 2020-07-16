const path = require("path");
const { readFileSync } = require("fs");
const { readFile, writeFile } = require("fs").promises;
const { suite } = require("uvu");
const assert = require("uvu/assert");
const { parse } = require("node-html-parser");
const prettier = require("prettier");
const { buildReport, getCommentBody } = require("../lib/index");

const testRoot = (...args) => path.join(__dirname, ...args);
const testResultsPath = testRoot("results/test-results.json");

/** @type {import('../src/global').TachResults} */
const testResults = JSON.parse(readFileSync(testResultsPath, "utf8"));

/** @type {() => import('../src/global').TachResults} */
const copyResults = () => JSON.parse(JSON.stringify(testResults));

const formatHtml = (html) => prettier.format(html, { parser: "html" });

const prBenchName = "local-framework";
const baseBenchName = "base-framework";
const defaultInputs = Object.freeze({
	prBenchName,
	baseBenchName,
	reportId: null,
	defaultOpen: false,
});

/** @type {import('../src/global').WorkflowRunData} */
// @ts-ignore
const fakeWorkflowRun = {
	run_name: "Pull Request Test #50",
	html_url:
		"https://github.com/andrewiggins/tachometer-reporter-action/actions/runs/166208365",
};

/** @type {import('../src/global').GitHubActionContext} */
// @ts-ignore
const fakeContext = {};

/** @type {import('../src/global').CommitInfo} */
const fakeCommit = {
	sha: "626e78c2446b8d1afc917fc9b0059aa65cc9a07d",
	node_id:
		"MDY6Q29tbWl0Mjc4NzIyMjI3OjYyNmU3OGMyNDQ2YjhkMWFmYzkxN2ZjOWIwMDU5YWE2NWNjOWEwN2Q=",
	url:
		"https://api.github.com/repos/andrewiggins/tachometer-reporter-action/git/commits/626e78c2446b8d1afc917fc9b0059aa65cc9a07d",
	html_url:
		"https://github.com/andrewiggins/tachometer-reporter-action/commit/626e78c2446b8d1afc917fc9b0059aa65cc9a07d",
	author: {
		name: "Andre Wiggins",
		email: "author@email.com",
		date: "2020-07-15T07:22:26Z",
	},
	committer: {
		name: "Andre Wiggins",
		email: "committer@email.com",
		date: "2020-07-15T07:22:26Z",
	},
	tree: {
		sha: "860ccb10b8f2866599fb3a1256ce65bfea59589b",
		url:
			"https://api.github.com/repos/andrewiggins/tachometer-reporter-action/git/trees/860ccb10b8f2866599fb3a1256ce65bfea59589b",
	},
	message: "Fill in readme",
	parents: [
		{
			sha: "e14f6dfcaca042ac8fa174d96afa9fabe0e0516b",
			url:
				"https://api.github.com/repos/andrewiggins/tachometer-reporter-action/git/commits/e14f6dfcaca042ac8fa174d96afa9fabe0e0516b",
			// html_url: "https://github.com/andrewiggins/tachometer-reporter-action/commit/e14f6dfcaca042ac8fa174d96afa9fabe0e0516b",
		},
	],
	verification: {
		verified: false,
		reason: "unsigned",
		signature: null,
		payload: null,
	},
};

const getTableId = (id) => `tachometer-reporter-action--table-${id ? id : ""}`;
const getSummaryId = (id) =>
	`tachometer-reporter-action--summary-${id ? id : ""}`;

/**
 * @typedef BuildReportParams
 * @property {import('../src/global').Commit} [commit]
 * @property {import('../src/global').WorkflowRunData} [workflow]
 * @property {Partial<import('../src/global').Inputs>} [inputs]
 * @property {import('../src/global').TachResults} [results]
 * @param {BuildReportParams} params
 */
function invokeBuildReport({
	commit = fakeCommit,
	workflow = fakeWorkflowRun,
	inputs = null,
	results = testResults,
} = {}) {
	const fullInputs = {
		...defaultInputs,
		...inputs,
	};

	return buildReport(commit, workflow, fullInputs, results);
}

const buildReportSuite = suite("buildReport");

buildReportSuite("Body snapshot", async () => {
	const report = invokeBuildReport();
	const html = formatHtml(report.body);

	const snapshotPath = testRoot("snapshots/test-results-body.html");
	const snapshot = await readFile(snapshotPath, "utf-8");

	// Uncomment to update snapshot
	// await writeFile(snapshotPath, html, "utf8");

	assert.fixture(html, snapshot, "Report body matches snapshot");
});

buildReportSuite("Summary snapshot", async () => {
	const report = invokeBuildReport();
	const html = formatHtml(report.summary);

	const snapshotPath = testRoot("snapshots/test-results-summary.html");
	const snapshot = await readFile(snapshotPath, "utf-8");

	// Uncomment to update snapshot
	// await writeFile(snapshotPath, html, "utf8");

	assert.fixture(html, snapshot, "Report summary matches snapshot");
});

buildReportSuite("Uses input.reportId", () => {
	const reportId = "test-input-id";
	const bodyIdRe = new RegExp(`<div id="${getTableId(reportId)}"`);
	const summaryIdRe = new RegExp(`<div id="${getSummaryId(reportId)}"`);

	const report = invokeBuildReport({ inputs: { reportId } });

	assert.is(report.id, reportId, "report.id matches input id");
	assert.ok(report.body.match(bodyIdRe), "body contains input id");
	assert.ok(report.summary.match(summaryIdRe), "summary contains input id");
});

buildReportSuite("Generates reportId if not given", () => {
	const expectedId = "l5UdXHMZ2m10Bdp0kqRnW0cWarA";
	const bodyIdRe = new RegExp(`<div id="${getTableId(expectedId)}"`);
	const summaryIdRe = new RegExp(`<div id="${getSummaryId(expectedId)}"`);

	const report = invokeBuildReport();

	assert.is(report.id, expectedId, "report.id matches expectation");
	assert.ok(report.body.match(bodyIdRe), "body contains valid id");
	assert.ok(report.summary.match(summaryIdRe), "summary contains valid id");
});

buildReportSuite("Sets open attribute if defaultOpen is true", () => {
	const openRe = /<details open="open">/;

	const report = invokeBuildReport({ inputs: { defaultOpen: true } });

	assert.ok(report.body.match(openRe), "body contains <details open>");
});

buildReportSuite(
	"Does not set open attribute if defaultOpen is false or null",
	() => {
		const openRe = /<details open/;

		let report = invokeBuildReport({ inputs: { defaultOpen: false } });

		assert.not.ok(
			report.body.match(openRe),
			"body does not contain <details open> for false"
		);

		report = invokeBuildReport({ inputs: { defaultOpen: null } });

		assert.not.ok(
			report.body.match(openRe),
			"body does not contain <details open> for null"
		);
	}
);

buildReportSuite("No summary if base version is null", () => {
	const report = invokeBuildReport({ inputs: { baseBenchName: null } });
	assert.not.ok(report.baseBenchName, "report.baseBenchName is null");
	assert.not.ok(report.summary, "report.summary is null");
});

buildReportSuite("No summary if local version is null", () => {
	const report = invokeBuildReport({ inputs: { prBenchName: null } });
	assert.not.ok(report.prBenchName, "report.prBenchName is null");
	assert.not.ok(report.summary, "report.summary is null");
});

buildReportSuite("No summary if base and local version are null", () => {
	const report = invokeBuildReport({
		inputs: { prBenchName: null, baseBenchName: null },
	});
	assert.not.ok(report.prBenchName, "report.prBenchName is null");
	assert.not.ok(report.baseBenchName, "report.baseBenchName is null");
	assert.not.ok(report.summary, "report.summary is null");
});

buildReportSuite("Supports benchmarks with different names", () => {
	const results = copyResults();
	const otherBenchName = "other-bench";

	results.benchmarks[0].name = otherBenchName;
	const report = invokeBuildReport({ results });
	const bodyDoc = parse(report.body);

	const allBenchNames = results.benchmarks.map((b) => b.name);
	const expectedTitle = Array.from(new Set(allBenchNames)).join(", ");

	// console.log(prettier.format(report.body, { parser: "html" }));

	// Check <summary> tag includes all names
	assert.is(
		bodyDoc.querySelector("summary").text,
		expectedTitle,
		"Title includes all bench names"
	);

	// Check row and columns include both bench name and version name
	const rowLabels = bodyDoc
		.querySelectorAll("tbody tr")
		.map((row) => row.childNodes[0].text);
	const columnLabels = bodyDoc
		.querySelectorAll("thead th")
		.map((td) => td.text);

	for (let i = 0; i < results.benchmarks.length; i++) {
		const bench = results.benchmarks[i];
		const rowLabel = rowLabels[i];
		const columnLabel = columnLabels[i + 2];

		assert.ok(rowLabel.includes(bench.name), "Row label contains bench.name");
		assert.ok(
			columnLabel.includes(bench.name),
			"Column label contains bench.name"
		);

		assert.ok(
			rowLabel.includes(bench.version),
			"Row label contains bench.version"
		);
		assert.ok(
			rowLabel.includes(bench.version),
			"Row label contains bench.version"
		);
	}

	// TODO: Figure out what summary should do here.
	// const summaryDoc = parse(report.summary);
	// console.log(prettier.format(report.summary, { parser: "html" }));
});

buildReportSuite("Lists all browsers used in details", () => {
	const results = copyResults();

	results.benchmarks[0].browser = {
		name: "firefox",
		headless: false,
		windowSize: { width: 1024, height: 768 },
	};

	const report = invokeBuildReport({ results });
	const bodyDoc = parse(report.body);

	// console.log(prettier.format(report.body, { parser: "html" }));

	// Check details list includes all browsers
	const listItems = bodyDoc.querySelectorAll("ul li").map((li) => li.text);

	results.benchmarks.forEach((bench) => {
		assert.ok(
			listItems.some((text) => text.includes(bench.browser.name)),
			`List items mention "${bench.browser.name}"`
		);
	});

	// Check table rows and columns include browsers
	const rowLabels = bodyDoc
		.querySelectorAll("tbody tr")
		.map((row) => row.childNodes[0].text);
	const columnLabels = bodyDoc
		.querySelectorAll("thead th")
		.map((td) => td.text);

	for (let i = 0; i < results.benchmarks.length; i++) {
		const bench = results.benchmarks[i];
		const rowLabel = rowLabels[i];
		const columnLabel = columnLabels[i + 2];

		assert.ok(
			rowLabel.includes(bench.browser.name),
			"Row label contains bench.browser.name"
		);
		assert.ok(
			columnLabel.includes(bench.browser.name),
			"Column label contains bench.browser.name"
		);

		assert.ok(
			rowLabel.includes(bench.version),
			"Row label contains bench.version"
		);
		assert.ok(
			rowLabel.includes(bench.version),
			"Row label contains bench.version"
		);
	}

	// TODO: Figure out summary should do here
	// const summaryDoc = parse(report.summary);
});

buildReportSuite("Supports benchmarks with no version field", () => {
	// TODO: How to do Summary?? Perhaps rework prBenchName to be something that
	// can be a benchmark name or version field value?
	// Check <summary> tag includes all names
	// Check table row labels
	// Check table column labels
});

const newCommentSuite = suite("getCommentBody (new)");

newCommentSuite("Generates full comment if comment null", () => {
	const report = invokeBuildReport();
	const body = getCommentBody(fakeContext, report, null);

	assert.ok(body.includes("Tachometer Benchmark Results"), "Includes title");
	assert.ok(body.includes("### Summary"), "Includes summary title");
	assert.ok(body.includes("<h3>Results</h3>"), "Includes results title");
	assert.ok(body.includes(report.summary), "Includes report.summary");
	assert.ok(body.includes(report.body), "Includes report.body");
});

newCommentSuite("Generates full comment with no summary", () => {
	const report = invokeBuildReport();
	report.summary = null;

	const body = getCommentBody(fakeContext, report, null);
	assert.not.ok(
		body.includes("### Summary"),
		"Does not include summary section"
	);
});

// const updateCommentSuite = suite("getCommentBody (update)");
// updateCommentSuite(
// 	"Updates existing comment that doesn't contain matching ID",
// 	() => {
// 		// Add new table in appropriate section
// 	}
// );
// updateCommentSuite(
// 	"Benchmarks always inserted in same order regardless of when they finish",
// 	() => {}
// );
// updateCommentSuite("Updates existing comment that contains matching ID", () => {
// 	// Replace existing content matching ID
// });
// updateCommentSuite(
// 	"Updates existing comment that contains matching ID with keep old option and no old content",
// 	() => {
// 		// Create old results <details> section and put existing table in it
// 	}
// );
// updateCommentSuite(
// 	"Updates existing comment that contains matching ID with keep old option and no old content",
// 	() => {
// 		// Move old table into existing old results <details> section
// 	}
// );
// updateCommentSuite(
// 	"Does not add summary to existing summary section if summary is null",
// 	() => {}
// );

buildReportSuite.run();
newCommentSuite.run();
