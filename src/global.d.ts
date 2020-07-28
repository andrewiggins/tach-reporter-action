declare global {
	namespace JSX {
		type CustomHTMLElement = import("node-html-parser").HTMLElement;

		interface Element extends CustomHTMLElement {}
		interface ElementChildrenAttribute {
			children: any;
		}
	}
}

type GitHubActionClient = ReturnType<
	typeof import("@actions/github").getOctokit
>;

// Sample context: https://github.com/andrewiggins/tachometer-reporter-action/runs/860022655?check_suite_focus=true
type GitHubActionContext = typeof import("@actions/github").context;
type CommentData = import("@octokit/types").IssuesGetCommentResponseData;

type OctokitResponse<T> = import("@octokit/types").OctokitResponse<T>;
type Workflow = import("@octokit/types").ActionsGetWorkflowResponseData;
type WorkflowRun = import("@octokit/types").ActionsGetWorkflowRunResponseData;
type WorkflowRunJob = import("@octokit/types").ActionsGetJobForWorkflowRunResponseData;

type WorkflowRunJobsAsyncIterator = AsyncIterableIterator<
	OctokitResponse<WorkflowRunJob[]>
>;

type Commit = import("@octokit/types").GitGetCommitResponseData;

interface CommitInfo extends Commit {
	html_url: string;
}

interface CommentContext {
	owner: string;
	repo: string;
	issueNumber: number;
	commentId: number | null;
	lockId: string;
	footer: string;
	footerRe: RegExp;
	matches(comment: CommentData): boolean;
	createDelayFactor: number;
}

interface ActionInfo {
	workflow: {
		id: Workflow["id"];
		name: Workflow["name"];
		srcHtmlUrl: string;
		runsHtmlUrl: string;
	};
	run: {
		id: WorkflowRun["id"];
		number: WorkflowRun["run_number"];
		name: string;
	};
	job: {
		id: WorkflowRunJob["id"];
		name: WorkflowRunJob["name"];
		htmlUrl: WorkflowRunJob["html_url"];
		index: number;
	};
}

interface Inputs {
	path: string;
	prBenchName?: string;
	baseBenchName: ?string;
	reportId?: string;
	keepOldResults?: boolean;
	defaultOpen?: boolean;
}

type TachResults = JsonOutputFile;
type BenchmarkResult = TachResults["benchmarks"][0];

interface Report {
	id: string;
	title: string;
	prBenchName: string | null;
	baseBenchName: string | null;
	actionInfo: ActionInfo | null;
	isRunning: boolean;
	// results: BenchmarkResult[];
	status: JSX.Element | null;
	summary: JSX.Element | null;
	body: JSX.Element;
}

interface SerializedReport extends Report {
	status: string;
	summary: string;
	body: string;
}

interface Logger {
	warn(msg: string): void;
	info(msg: string): void;
	debug(getMsg: () => string): void;
	startGroup(name: string): void;
	endGroup(): void;
}

interface LockConfig {
	/**
	 * Trying to find a comment in a list and creating comments takes a bit longer
	 * than just reading comments when you have the ID. So creating gets its own
	 * delay config to accommodate this.
	 */
	createDelayMs: number;

	/**
	 * Minimum amount of time lock must be consistently held before safely
	 * assuming it was successfully acquired. Default: 2500ms
	 */
	minHoldTimeMs: number; // milliseconds

	/**
	 * Time to sleep between checks to see if the lock is still held by writer
	 * before actually updating comment. Defaults to 500ms or minHoldTimeMs/2 if
	 * minHoldTimeMs < 500
	 */
	checkDelayMs: number; // milliseconds

	/**
	 * Minimum amount of time to wait before trying to acquire the lock again
	 * after seeing it is held by another writer. Default: 1000ms
	 */
	minWaitTimeMs: number; // milliseconds

	/**
	 * Maximum amount of time to wait before trying to acquire the lock again
	 * after seeing it is held by another writer. Default: 3000ms
	 */
	maxWaitTimeMs: number; // milliseconds

	/**
	 * How long to consecutively wait until giving up and failing to acquire lock
	 */
	waitTimeoutMs: number; // milliseconds
}

/**
 * An abstraction for the various dimensions of data we display.
 */
interface Dimension {
	label: string;
	format: (r: BenchmarkResult) => string;
	tableConfig?: { alignment?: "left" | "center" | "right" };
}

// Temporary until next version of Tachometer is released
export interface BrowserConfig {
	/** Name of the browser. */
	name: BrowserName;
	/** Whether to run in headless mode. */
	headless: boolean;
	/** A remote WebDriver server to launch the browser from. */
	remoteUrl?: string;
	/** Launch the browser window with these dimensions. */
	windowSize: WindowSize;
	/** Path to custom browser binary. */
	binary?: string;
	/** Additional binary arguments. */
	addArguments?: string[];
	/** WebDriver default binary arguments to omit. */
	removeArguments?: string[];
	/** CPU Throttling rate. (1 is no throttle, 2 is 2x slowdown, etc). */
	cpuThrottlingRate?: number;
	/** Advanced preferences usually set from the about:config page. */
	preferences?: { [name: string]: string | number | boolean };
}

interface JsonOutputFile {
	benchmarks: Benchmark[];
}

interface BrowserConfigResult extends BrowserConfig {
	userAgent?: string;
}

interface Benchmark {
	name: string;
	bytesSent: number;
	version?: string;
	browser?: BrowserConfigResult;
	mean: ConfidenceInterval;
	differences: Array<Difference | null>;
	samples: number[];
}

interface Difference {
	absolute: ConfidenceInterval;
	percentChange: ConfidenceInterval;
}

interface ConfidenceInterval {
	low: number;
	high: number;
}
