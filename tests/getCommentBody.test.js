const { readFile, writeFile } = require("fs").promises;
const { suite } = require("uvu");
const assert = require("uvu/assert");
const { parse } = require("node-html-parser");
const {
	testReportId,
	testRoot,
	formatHtml,
	copyTestResults,
	getMultiMeasureResults,
	readFixture,
	assertFixture,
	getBenchmarkSectionId,
	getSummaryId,
	getSummaryListId,
	getResultsContainerId,
	skipSuite,
} = require("./utils");
const { invokeBuildReport } = require("./invokeBuildReport");
const { defaultInputs, testLogger } = require("./mocks/actions");
const { defaultActionInfo } = require("./mocks/github");
const { getCommentBody } = require("../lib/getCommentBody");
const { defaultMeasureId } = require("../src/utils/hash");

function generateNewTestResults() {
	var results = copyTestResults();

	const baseFrameworkIndex = results.benchmarks.findIndex(
		(b) => b.version == "base-framework"
	);
	const localFramework = results.benchmarks.find(
		(b) => b.version == "local-framework"
	);

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

	return results;
}

/**
 * @typedef GetCommentBodyParams
 * @property {Partial<import('../src/global').Inputs>} [inputs]
 * @property {import('../src/global').Report} [report]
 * @property {string} [commentBody]
 * @param {GetCommentBodyParams} params
 */
function invokeGetCommentBody({
	inputs = null,
	report = undefined,
	commentBody = null,
} = {}) {
	const fullInputs = {
		...defaultInputs,
		...inputs,
	};

	if (report === undefined) {
		report = invokeBuildReport({ inputs: fullInputs });
	}

	return getCommentBody(fullInputs, report, commentBody, testLogger);
}

/**
 * @param {string} label
 * @param {import('node-html-parser').HTMLElement} body
 * @param {{ isRunning?: boolean; hasResults?: boolean; }} [options]
 * @param {{ reportId?: string; measurementId?: string; }} [ids]
 */
function assertUIState(
	label,
	body,
	{ isRunning = false, hasResults = true } = {},
	{ reportId = testReportId, measurementId = defaultMeasureId } = {}
) {
	let summaryId = getSummaryId({ reportId, measurementId });
	let summaryStatus = body.querySelector(`#${summaryId} .status a`);
	let summaryData = body.querySelector(`#${summaryId} em`);

	let resultId = getBenchmarkSectionId(reportId);
	let resultStatus = body.querySelector(`#${resultId} .status a`);
	let resultData = body.querySelector(`#${resultId} table`);

	const msg = (message) => `${label}: ${message}`;

	if (isRunning) {
		assert.ok(summaryStatus, msg(`Summary running status link should exist`));
		assert.ok(resultStatus, msg(`Result running link should exist`));

		let summaryText = summaryStatus?.text.includes("⏱");
		let resultText = resultStatus?.text.includes("⏱");

		assert.ok(summaryText, msg(`Summary running status link has text`));
		assert.ok(resultText, msg(`Result running status link has text`));
	} else {
		assert.not.ok(summaryStatus, `summary status link should not exist`);
		assert.not.ok(resultStatus, msg(`result status link should not exist`));
	}

	if (hasResults) {
		assert.ok(summaryData, msg(`summary results should exist`));
		assert.ok(resultData, msg(`result data should exist`));
	} else {
		assert.not.ok(summaryData, msg(`summary results should not exist`));
		assert.not.ok(resultData, msg(`result data should not exist`));
	}
}

//#region New Comment Suite

const newCommentSuite = suite("getCommentBody (new)");

newCommentSuite("New comment snapshot in running state", async () => {
	const inputs = { reportId: testReportId };
	const body = invokeGetCommentBody({
		inputs,
		report: invokeBuildReport({ inputs, isRunning: true, results: null }),
	});
	const html = formatHtml(body.toString());

	const fixturePath = testRoot("fixtures/new-comment-running.html");
	const fixture = await readFile(fixturePath, "utf-8");

	// Uncomment to update fixture
	// await writeFile(fixturePath, html, "utf8");

	assertFixture(html, fixture, "Report body matches fixture");
});

newCommentSuite("New comment snapshot with results", async () => {
	const body = invokeGetCommentBody();
	const html = formatHtml(body.toString());

	const fixturePath = testRoot("fixtures/test-results-new-comment.html");
	const fixture = await readFile(fixturePath, "utf-8");

	// Uncomment to update fixture
	// await writeFile(fixturePath, html, "utf8");

	assertFixture(html, fixture, "Report body matches fixture");
});

newCommentSuite("Uses input.reportId", async () => {
	const body = invokeGetCommentBody({ inputs: { reportId: testReportId } });
	const html = formatHtml(body.toString());

	const fixturePath = testRoot("fixtures/test-results-existing-comment.html");
	const fixture = await readFile(fixturePath, "utf-8");

	// Uncomment to update fixture
	// await writeFile(fixturePath, html, "utf8");

	assertFixture(html, fixture, "Report body matches fixture");
});

newCommentSuite("Generates reportId if not given", () => {
	const bodyIdRe = new RegExp(`<div id="${getBenchmarkSectionId()}"`);
	const summaryIdRe = new RegExp(`<div id="${getSummaryId()}"`);

	const body = invokeGetCommentBody();

	assert.ok(body.match(bodyIdRe), "body contains valid id");
	assert.ok(body.match(summaryIdRe), "summary contains valid id");
});

newCommentSuite("Sets open attribute if defaultOpen is true", () => {
	const openRe = /<details open="open">/;
	const body = invokeGetCommentBody({ inputs: { defaultOpen: true } });

	assert.ok(body.match(openRe), "body contains <details open>");
});

newCommentSuite(
	"Does not set open attribute if defaultOpen is false or null",
	() => {
		let body;
		const openRe = /<details open/;

		body = invokeGetCommentBody({ inputs: { defaultOpen: false } });

		assert.not.ok(
			body.match(openRe),
			"body does not contain <details open> for false"
		);

		body = invokeGetCommentBody({ inputs: { defaultOpen: null } });

		assert.not.ok(
			body.match(openRe),
			"body does not contain <details open> for null"
		);
	}
);

newCommentSuite("Generates full comment if comment null", () => {
	const report = invokeBuildReport();
	const body = invokeGetCommentBody({ report });

	assert.ok(body.includes("Tachometer Benchmark Results"), "Includes title");
	assert.ok(body.includes("<h3>Summary</h3>"), "Includes summary title");
	assert.ok(body.includes("<h3>Results</h3>"), "Includes results title");
	report.summaries.forEach((m, i) => {
		assert.ok(
			body.includes(m.summary.toString()),
			`Includes report.summaries[${i}]`
		);
	});
	assert.ok(body.includes(report.body.toString()), "Includes report.body");
});

newCommentSuite("Supports benchmarks with different names", () => {
	const results = copyTestResults();
	const otherBenchName = "other-bench";

	results.benchmarks[0].name = otherBenchName;
	const report = invokeBuildReport({ results });
	const body = invokeGetCommentBody({ report });

	const allBenchNames = results.benchmarks.map((b) => b.name);
	const expectedTitle = Array.from(new Set(allBenchNames)).join(", ");

	// console.log(prettier.format(body, { parser: "html" }));

	const benchSectionId = getBenchmarkSectionId(report.id);
	const bodyDoc = parse(body);
	const actualTitle = bodyDoc.querySelector(`#${benchSectionId} summary`).text;

	// Check <summary> tag includes all names
	assert.is(actualTitle, expectedTitle, "Title includes all bench names");
});

newCommentSuite(
	"Still renders status even if job.html_url and run.html_url is falsey",
	async () => {
		const report = invokeBuildReport({
			inputs: { reportId: testReportId },
			actionInfo: {
				...defaultActionInfo,
				run: {
					...defaultActionInfo.run,
					htmlUrl: null,
				},
				job: {
					id: undefined,
					index: undefined,
					htmlUrl: undefined,
					name: defaultActionInfo.job.name,
				},
			},
			results: null,
			isRunning: true,
		});

		const bodyHtml = parse(invokeGetCommentBody({ report }));

		const summaryId = getSummaryId({ reportId: testReportId });
		const summaryStatus = bodyHtml.querySelector(`#${summaryId} .status span`);

		const resultId = getBenchmarkSectionId(testReportId);
		const resultStatus = bodyHtml.querySelector(`#${resultId} .status span`);

		assert.ok(summaryStatus, "Summary status span exists");
		assert.ok(resultStatus, "Result status span exists");
		assert.ok(summaryStatus.text.includes("⏱"), "Summary status span has text");
		assert.ok(resultStatus.text.includes("⏱"), "Result status span has text");
	}
);

newCommentSuite("Renders generic comment body if report is null", async () => {
	const body = invokeGetCommentBody({ report: null });
	const html = formatHtml(body.toString());

	const fixture = await readFixture("new-comment-initialized.html");
	assertFixture(html, fixture, "Comment body matches fixture");
});

newCommentSuite("Renders multiple measures in report correctly", async () => {
	const results = getMultiMeasureResults();
	const body = invokeGetCommentBody({ report: invokeBuildReport({ results }) });
	const actualHtml = formatHtml(body.toString());

	const fixturePath = testRoot("fixtures/multi-measure-new-comment.html");
	const fixture = await readFile(fixturePath, "utf-8");

	// Uncomment to update fixture
	// await writeFile(fixturePath, actualHtml, "utf-8");

	assertFixture(actualHtml, fixture, "Comment body matches fixture");
});

//#endregion

//#region Update Comment Suite

const updateCommentSuite = suite("getCommentBody (update)");
const otherReportId = "test-results-new-id";

// Update from results to running
updateCommentSuite(
	"Update status for existing comment with old results",
	async () => {
		const commentBody = await readFixture("test-results-existing-comment.html");
		const report = invokeBuildReport({
			inputs: { reportId: testReportId },
			results: null,
			isRunning: true,
		});

		const bodyHtml = parse(invokeGetCommentBody({ report, commentBody }));

		assertUIState("Updated results", bodyHtml, {
			isRunning: true,
			hasResults: true,
		});

		const actualHtml = formatHtml(bodyHtml.toString());

		const fixturePath = testRoot("fixtures/test-results-existing-running.html");
		const expectedHtml = await readFile(fixturePath, "utf-8");

		// Uncomment to update fixture
		// await writeFile(fixturePath, actualHtml, "utf-8");

		assertFixture(
			actualHtml,
			expectedHtml,
			"Updating status with results fixture"
		);
	}
);

updateCommentSuite(
	"Update status for existing comment when no job.html_url or run.html_url is present",
	async () => {
		const commentBody = await readFixture("test-results-existing-comment.html");
		const report = invokeBuildReport({
			inputs: { reportId: testReportId },
			actionInfo: {
				...defaultActionInfo,
				run: {
					...defaultActionInfo.run,
					htmlUrl: null,
				},
				job: {
					id: undefined,
					index: undefined,
					htmlUrl: undefined,
					name: defaultActionInfo.job.name,
				},
			},
			results: null,
			isRunning: true,
		});

		const bodyHtml = parse(invokeGetCommentBody({ report, commentBody }));

		const summaryId = getSummaryId({ reportId: testReportId });
		const summaryStatus = bodyHtml.querySelector(`#${summaryId} .status span`);
		const summaryData = bodyHtml.querySelector(`#${summaryId} em`);

		const resultId = getBenchmarkSectionId(testReportId);
		const resultStatus = bodyHtml.querySelector(`#${resultId} .status span`);
		const resultData = bodyHtml.querySelector(`#${resultId} table`);

		assert.ok(summaryStatus, "Summary status span exists");
		assert.ok(resultStatus, "Result status span exists");
		assert.ok(summaryStatus.text.includes("⏱"), "Summary status span has text");
		assert.ok(resultStatus.text.includes("⏱"), "Result status span has text");
		assert.ok(summaryData, "Summary data is still present");
		assert.ok(resultData, "Result data is still present");
	}
);

// Update from existing running to results
updateCommentSuite(
	"Remove running status from existing comment when results come in",
	async () => {
		const commentBody = await readFixture("test-results-existing-running.html");
		const report = invokeBuildReport({
			inputs: { reportId: testReportId },
		});

		const bodyHtml = parse(invokeGetCommentBody({ report, commentBody }));

		assertUIState("Updated", bodyHtml, { isRunning: false, hasResults: true });
	}
);

// Update from existing results to new results
updateCommentSuite(
	"Update summary/results when new results for existing benchmark come in",
	async () => {
		const newResults = generateNewTestResults();

		const commentBody = await readFixture("test-results-existing-comment.html");
		const origBodyHtml = parse(commentBody);

		// Assert original body html is what we expect
		let resultTableCell = origBodyHtml
			.querySelectorAll(`tbody tr`)[2]
			.querySelectorAll("td")[3];
		assert.ok(
			resultTableCell.text.includes("unsure"),
			"Result table includes expected initial data"
		);

		const report = invokeBuildReport({
			inputs: { reportId: testReportId },
			results: newResults,
		});

		const newBodyHtml = parse(invokeGetCommentBody({ report, commentBody }));
		// console.log(formatHtml(bodyHtml.toString()));

		assertUIState("New results", newBodyHtml, {
			isRunning: false,
			hasResults: true,
		});

		resultTableCell = newBodyHtml
			.querySelectorAll(`tbody tr`)[2]
			.querySelectorAll("td")[3];

		assert.ok(
			resultTableCell.text.includes("faster"),
			"Result table is updated to show new results"
		);
	}
);

// Add new benchmark running to existing comment
updateCommentSuite(
	"Add new summary/results entry when new report with status comes in",
	async () => {
		const newId = "new-id";
		const commentBody = await readFixture("test-results-existing-comment.html");
		const report = invokeBuildReport({
			inputs: { reportId: newId },
			results: null,
			isRunning: true,
		});

		const bodyHtml = parse(invokeGetCommentBody({ report, commentBody }));

		assertUIState("Other job data", bodyHtml, {
			isRunning: false,
			hasResults: true,
		});

		assertUIState(
			"This job data",
			bodyHtml,
			{ isRunning: true, hasResults: false },
			{ reportId: newId }
		);
	}
);

// Add new benchmarks results to existing comment
updateCommentSuite(
	"Add new summary/results entry when new report with just results comes in",
	async () => {
		const newId = "new-id";
		const newResults = JSON.parse(
			await readFile(testRoot("results/other-results.json"), "utf8")
		);

		const commentBody = await readFixture("test-results-existing-comment.html");
		const report = invokeBuildReport({
			inputs: { reportId: newId },
			results: newResults,
		});

		const bodyHtml = parse(invokeGetCommentBody({ report, commentBody }));
		// console.log(formatHtml(bodyHtml.toString()));

		assertUIState("Other job data", bodyHtml, {
			isRunning: false,
			hasResults: true,
		});

		assertUIState(
			"This job data",
			bodyHtml,
			{ isRunning: false, hasResults: true },
			{ reportId: newId }
		);
	}
);

updateCommentSuite("Add new summary/results entry snapshot", async () => {
	const newResults = JSON.parse(
		await readFile(testRoot("results/other-results.json"), "utf8")
	);

	const commentBody = await readFixture("test-results-existing-comment.html");
	const report = invokeBuildReport({
		inputs: { reportId: otherReportId },
		results: newResults,
	});

	const html = formatHtml(invokeGetCommentBody({ report, commentBody }));

	const fixturePath = testRoot("fixtures/multiple-entries.html");
	const fixture = await readFile(fixturePath, "utf-8");

	// Uncomment to update fixture
	// await writeFile(fixturePath, html, "utf8");

	assertFixture(html, fixture, "Multiple results snapshot");
});

updateCommentSuite(
	"Insert a benchmark with a lower report title at the front",
	async () => {
		const newId = "another-new-id";
		const newResults = JSON.parse(
			await readFile(testRoot("results/other-results.json"), "utf8")
		);

		const commentBody = await readFixture("multiple-entries.html");
		const report = invokeBuildReport({
			inputs: { reportId: newId },
			results: newResults,
		});

		const bodyHtml = parse(invokeGetCommentBody({ report, commentBody }));

		const summaries = bodyHtml.querySelectorAll(
			`#${getSummaryListId()} li div`
		);
		const results = bodyHtml.querySelectorAll(
			`#${getResultsContainerId()} div`
		);

		// console.log(formatHtml(bodyHtml.toString()));

		assert.equal(
			summaries[0].getAttribute("id"),
			getSummaryId({ reportId: newId }),
			"First summary should be new report"
		);
		assert.equal(
			summaries[1].getAttribute("id"),
			getSummaryId({ reportId: testReportId }),
			"Second summary should be test results"
		);
		assert.equal(
			summaries[2].getAttribute("id"),
			getSummaryId({ reportId: otherReportId }),
			"Third summary should be other test results"
		);

		assert.equal(
			results[0].getAttribute("id"),
			getBenchmarkSectionId(newId),
			"First result entry should be new report"
		);
		assert.equal(
			results[1].getAttribute("id"),
			getBenchmarkSectionId(testReportId),
			"Second result entry should be test results"
		);
		assert.equal(
			results[2].getAttribute("id"),
			getBenchmarkSectionId(otherReportId),
			"Third result entry should be other test results"
		);
	}
);

updateCommentSuite(
	"Insert a benchmark with the higher report title at the end of the benchmarks",
	async () => {
		const newId = "zz-another-new-id";
		const newResults = JSON.parse(
			await readFile(testRoot("results/other-results.json"), "utf8")
		);

		const commentBody = await readFixture("multiple-entries.html");
		const report = invokeBuildReport({
			inputs: { reportId: newId },
			results: newResults,
		});

		const bodyHtml = parse(invokeGetCommentBody({ report, commentBody }));

		const summaries = bodyHtml.querySelectorAll(
			`#${getSummaryListId()} li div`
		);
		const results = bodyHtml.querySelectorAll(
			`#${getResultsContainerId()} div`
		);

		// console.log(formatHtml(bodyHtml.toString()));

		assert.equal(
			summaries[0].getAttribute("id"),
			getSummaryId({ reportId: testReportId }),
			"First summary should be test results"
		);
		assert.equal(
			summaries[1].getAttribute("id"),
			getSummaryId({ reportId: otherReportId }),
			"Second summary should be other test results"
		);
		assert.equal(
			summaries[2].getAttribute("id"),
			getSummaryId({ reportId: newId }),
			"Third summary should be new results"
		);

		assert.equal(
			results[0].getAttribute("id"),
			getBenchmarkSectionId(testReportId),
			"First result entry should be test results"
		);
		assert.equal(
			results[1].getAttribute("id"),
			getBenchmarkSectionId(otherReportId),
			"Third result entry should be other test results"
		);
		assert.equal(
			results[2].getAttribute("id"),
			getBenchmarkSectionId(newId),
			"Third result entry should be new results"
		);
	}
);

updateCommentSuite(
	"Updates benchmark results if run number is higher than the run number in HTML",
	async () => {
		const newResults = generateNewTestResults();

		const commentBody = await readFixture("test-results-existing-comment.html");
		const report = invokeBuildReport({
			inputs: { reportId: testReportId },
			results: newResults,
			actionInfo: {
				...defaultActionInfo,
				run: {
					...defaultActionInfo.run,
					number: defaultActionInfo.run.number + 1,
				},
			},
		});

		const bodyHtml = parse(invokeGetCommentBody({ report, commentBody }));
		const resultTableCell = bodyHtml
			.querySelectorAll(`tbody tr`)[2]
			.querySelectorAll("td")[3];

		assert.ok(
			resultTableCell.text.includes("faster"),
			"Result table is updated to show new results"
		);
	}
);

updateCommentSuite(
	"Updates benchmark results if run number is the same as the run number in HTML",
	async () => {
		const newResults = generateNewTestResults();

		const commentBody = await readFixture("test-results-existing-comment.html");
		const report = invokeBuildReport({
			inputs: { reportId: testReportId },
			results: newResults,
			actionInfo: {
				...defaultActionInfo,
				run: {
					...defaultActionInfo.run,
					number: defaultActionInfo.run.number,
				},
			},
		});

		const bodyHtml = parse(invokeGetCommentBody({ report, commentBody }));
		const resultTableCell = bodyHtml
			.querySelectorAll(`tbody tr`)[2]
			.querySelectorAll("td")[3];

		assert.ok(
			resultTableCell.text.includes("faster"),
			"Result table is updated to show new results"
		);
	}
);

updateCommentSuite(
	"Does not update benchmark results if run number is the lower than the run number in HTML",
	async () => {
		const newResults = generateNewTestResults();

		const commentBody = await readFixture("test-results-existing-comment.html");
		const report = invokeBuildReport({
			inputs: { reportId: testReportId },
			results: newResults,
			actionInfo: {
				...defaultActionInfo,
				run: {
					...defaultActionInfo.run,
					number: defaultActionInfo.run.number - 1,
				},
			},
		});

		const bodyHtml = parse(invokeGetCommentBody({ report, commentBody }));
		const resultTableCell = bodyHtml
			.querySelectorAll(`tbody tr`)[2]
			.querySelectorAll("td")[3];

		assert.ok(
			resultTableCell.text.includes("unsure"),
			"Result table is updated to show new results"
		);
	}
);

updateCommentSuite(
	"Renders unmodified comment body report is null",
	async () => {
		const commentBody = await readFixture("test-results-existing-comment.html");

		const body = invokeGetCommentBody({
			commentBody,
			report: null,
		});
		const html = formatHtml(body.toString());

		assertFixture(html, commentBody, "Report body matches fixture");
	}
);

updateCommentSuite("Clears global status when results come in", async () => {
	const commentBody = await readFixture("new-comment-initialized.html");

	const body = invokeGetCommentBody({ commentBody });
	const html = formatHtml(body.toString());

	const fixture = await readFixture("test-results-new-comment.html");
	assertFixture(html, fixture, "Report body matches fixture");
});

// keep-old-results option
// updateCommentSuite(
// 	"Updates existing comment that contains matching ID with keep old option and no old content",
// 	() => {
// 		// Create old results <details> section and put existing table in it
// 	}
// );
// updateCommentSuite(
// 	"Updates existing comment that contains matching ID with keep old option and with old content",
// 	() => {
// 		// Move old table into existing old results <details> section
// 	}
// );

//#endregion

newCommentSuite.run();
updateCommentSuite.run();

// TODO: New test cases to consider
// - Update summary results with all measurements existing
// - Update summary results with some measurements existing and some new
// - Update summary results with all new measurements
//
// Particularly pay attention to summary changes in these scenarios
//
// Summary Tests:
// - multi-measure new comment with results
// - multi-measure add results to existing running comment
// - multi-measure add results to existing results comment
// - multi-measure add results to existing empty comment
// - multi-measure new comment running (no results)
// - multi-measure add running to existing running comment
// - multi-measure add running to existing results comment
// - multi-measure add running to existing empty comment
// - multi-measure update from new comment running to result (status is in
//   default section)
// - multi-measure update from results to running (no results)
// - multi-measure update from existing running to results (status is in
//   proper measurement section)
// - multi-measure update from existing results to new results
// - multi-measure doesn't change comment if report is null
