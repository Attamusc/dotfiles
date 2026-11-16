/**
 * This extension stores todo items as files under <todo-dir> (defaults to
 * ~/.pi/history/<project>/todos, or the path in PI_TODO_PATH).  Each todo is a
 * standalone markdown file named <id>.md and an optional <id>.lock file is used
 * while a session is editing it.
 *
 * File format:
 * - The file starts with a JSON object (not YAML) containing the front matter:
 *   { id, title, tags, status, created_at, assigned_to_session }
 * - After the JSON block comes optional markdown body text separated by a blank line.
 * - Example:
 *   {
 *     "id": "deadbeef",
 *     "title": "Add tests",
 *     "tags": ["qa"],
 *     "status": "open",
 *     "created_at": "2026-01-25T17:00:00.000Z",
 *     "assigned_to_session": "session.json"
 *   }
 *
 *   Notes about the work go here.
 *
 * Todo storage settings are kept in <todo-dir>/settings.json.
 * Defaults:
 * {
 *   "gc": true,   // delete closed todos older than gcDays on startup
 *   "gcDays": 7   // age threshold for GC (days since created_at)
 * }
 *
 * Use `/todos` to bring up the visual todo manager or just let the LLM use them
 * naturally.
 */
import { DynamicBorder, copyToClipboard, getMarkdownTheme, keyHint, type ExtensionAPI, type ExtensionContext, type Theme } from "@mariozechner/pi-coding-agent";
import path from "node:path";
import os from "node:os";
import { migrateLegacyTodos, projectScopeSlug, resolveTaskStore } from "./scope.ts";
import { loadTaskPackage } from "./package.mjs";
import { runPiTask } from "./client.mjs";
import {
	Container,
	type Focusable,
	Input,
	Key,
	Markdown,
	SelectList,
	Spacer,
	type SelectItem,
	Text,
	TUI,
	fuzzyMatch,
	getEditorKeybindings,
	matchesKey,
	truncateToWidth,
	visibleWidth,
} from "@mariozechner/pi-tui";

const TODO_PATH_ENV = "PI_TODO_PATH";
const GLOBAL_PI_DIR = path.join(os.homedir(), ".pi", "history");
const TODO_ID_PREFIX = "TODO-";
type TodoFrontMatter = import("./types.ts").TodoFrontMatter;
type TodoRecord = import("./types.ts").TodoRecord;
type TodoAction = import("./types.ts").TodoAction;

type TodoOverlayAction = "back" | "work";

type TodoMenuAction =
	| "work"
	| "refine"
	| "close"
	| "reopen"
	| "release"
	| "delete"
	| "copyPath"
	| "copyText"
	| "view";

type TodoToolDetails =
	| { action: "list" | "list-all"; todos: TodoFrontMatter[]; currentSessionId?: string; error?: string }
	| {
			action: "get" | "create" | "update" | "append" | "delete" | "claim" | "release";
			todo: TodoRecord;
			error?: string;
		};

function formatTodoId(id: string): string {
	return `${TODO_ID_PREFIX}${id}`;
}

function normalizeTodoId(id: string): string {
	let trimmed = id.trim();
	if (trimmed.startsWith("#")) {
		trimmed = trimmed.slice(1);
	}
	if (trimmed.toUpperCase().startsWith(TODO_ID_PREFIX)) {
		trimmed = trimmed.slice(TODO_ID_PREFIX.length);
	}
	return trimmed;
}

function isTodoClosed(status: string): boolean {
	return ["closed", "done"].includes(status.toLowerCase());
}

function buildTodoSearchText(todo: TodoFrontMatter): string {
	const tags = todo.tags.join(" ");
	const assignment = todo.assigned_to_session ? `assigned:${todo.assigned_to_session}` : "";
	return `${formatTodoId(todo.id)} ${todo.id} ${todo.title} ${tags} ${todo.status} ${assignment}`.trim();
}

function filterTodos(todos: TodoFrontMatter[], query: string): TodoFrontMatter[] {
	const trimmed = query.trim();
	if (!trimmed) return todos;

	const tokens = trimmed
		.split(/\s+/)
		.map((token) => token.trim())
		.filter(Boolean);

	if (tokens.length === 0) return todos;

	const matches: Array<{ todo: TodoFrontMatter; score: number }> = [];
	for (const todo of todos) {
		const text = buildTodoSearchText(todo);
		let totalScore = 0;
		let matched = true;
		for (const token of tokens) {
			const result = fuzzyMatch(token, text);
			if (!result.matches) {
				matched = false;
				break;
			}
			totalScore += result.score;
		}
		if (matched) {
			matches.push({ todo, score: totalScore });
		}
	}

	return matches
		.sort((a, b) => {
			const aClosed = isTodoClosed(a.todo.status);
			const bClosed = isTodoClosed(b.todo.status);
			if (aClosed !== bClosed) return aClosed ? 1 : -1;
			const aAssigned = !aClosed && Boolean(a.todo.assigned_to_session);
			const bAssigned = !bClosed && Boolean(b.todo.assigned_to_session);
			if (aAssigned !== bAssigned) return aAssigned ? -1 : 1;
			return a.score - b.score;
		})
		.map((match) => match.todo);
}

class TodoSelectorComponent extends Container implements Focusable {
	private searchInput: Input;
	private listContainer: Container;
	private allTodos: TodoFrontMatter[];
	private filteredTodos: TodoFrontMatter[];
	private selectedIndex = 0;
	private onSelectCallback: (todo: TodoFrontMatter) => void;
	private onCancelCallback: () => void;
	private tui: TUI;
	private theme: Theme;
	private headerText: Text;
	private hintText: Text;
	private currentSessionId?: string;

	private _focused = false;
	get focused(): boolean {
		return this._focused;
	}
	set focused(value: boolean) {
		this._focused = value;
		this.searchInput.focused = value;
	}

	constructor(
		tui: TUI,
		theme: Theme,
		todos: TodoFrontMatter[],
		onSelect: (todo: TodoFrontMatter) => void,
		onCancel: () => void,
		initialSearchInput?: string,
		currentSessionId?: string,
		private onQuickAction?: (todo: TodoFrontMatter, action: "work" | "refine") => void,
	) {
		super();
		this.tui = tui;
		this.theme = theme;
		this.currentSessionId = currentSessionId;
		this.allTodos = todos;
		this.filteredTodos = todos;
		this.onSelectCallback = onSelect;
		this.onCancelCallback = onCancel;

		this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		this.addChild(new Spacer(1));

		this.headerText = new Text("", 1, 0);
		this.addChild(this.headerText);
		this.addChild(new Spacer(1));

		this.searchInput = new Input();
		if (initialSearchInput) {
			this.searchInput.setValue(initialSearchInput);
		}
		this.searchInput.onSubmit = () => {
			const selected = this.filteredTodos[this.selectedIndex];
			if (selected) this.onSelectCallback(selected);
		};
		this.addChild(this.searchInput);

		this.addChild(new Spacer(1));
		this.listContainer = new Container();
		this.addChild(this.listContainer);

		this.addChild(new Spacer(1));
		this.hintText = new Text("", 1, 0);
		this.addChild(this.hintText);
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));

		this.updateHeader();
		this.updateHints();
		this.applyFilter(this.searchInput.getValue());
	}

	setTodos(todos: TodoFrontMatter[]): void {
		this.allTodos = todos;
		this.updateHeader();
		this.applyFilter(this.searchInput.getValue());
		this.tui.requestRender();
	}

	getSearchValue(): string {
		return this.searchInput.getValue();
	}

	private updateHeader(): void {
		const openCount = this.allTodos.filter((todo) => !isTodoClosed(todo.status)).length;
		const closedCount = this.allTodos.length - openCount;
		const title = `Todos (${openCount} open, ${closedCount} closed)`;
		this.headerText.setText(this.theme.fg("accent", this.theme.bold(title)));
	}

	private updateHints(): void {
		this.hintText.setText(
			this.theme.fg(
				"dim",
				"Type to search • ↑↓ select • Enter actions • Ctrl+Shift+W work • Ctrl+Shift+R refine • Esc close",
			),
		);
	}

	private applyFilter(query: string): void {
		this.filteredTodos = filterTodos(this.allTodos, query);
		this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, this.filteredTodos.length - 1));
		this.updateList();
	}

	private updateList(): void {
		this.listContainer.clear();

		if (this.filteredTodos.length === 0) {
			this.listContainer.addChild(new Text(this.theme.fg("muted", "  No matching todos"), 0, 0));
			return;
		}

		const maxVisible = 10;
		const startIndex = Math.max(
			0,
			Math.min(this.selectedIndex - Math.floor(maxVisible / 2), this.filteredTodos.length - maxVisible),
		);
		const endIndex = Math.min(startIndex + maxVisible, this.filteredTodos.length);

		for (let i = startIndex; i < endIndex; i += 1) {
			const todo = this.filteredTodos[i];
			if (!todo) continue;
			const isSelected = i === this.selectedIndex;
			const closed = isTodoClosed(todo.status);
			const prefix = isSelected ? this.theme.fg("accent", "→ ") : "  ";
			const titleColor = isSelected ? "accent" : closed ? "dim" : "text";
			const statusColor = closed ? "dim" : "success";
			const tagText = todo.tags.length ? ` [${todo.tags.join(", ")}]` : "";
			const assignmentText = renderAssignmentSuffix(this.theme, todo, this.currentSessionId);
			const line =
				prefix +
				this.theme.fg("accent", formatTodoId(todo.id)) +
				" " +
				this.theme.fg(titleColor, todo.title || "(untitled)") +
				this.theme.fg("muted", tagText) +
				assignmentText +
				" " +
				this.theme.fg(statusColor, `(${todo.status || "open"})`);
			this.listContainer.addChild(new Text(line, 0, 0));
		}

		if (startIndex > 0 || endIndex < this.filteredTodos.length) {
			const scrollInfo = this.theme.fg(
				"dim",
				`  (${this.selectedIndex + 1}/${this.filteredTodos.length})`,
			);
			this.listContainer.addChild(new Text(scrollInfo, 0, 0));
		}
	}

	handleInput(keyData: string): void {
		const kb = getEditorKeybindings();
		if (kb.matches(keyData, "selectUp")) {
			if (this.filteredTodos.length === 0) return;
			this.selectedIndex = this.selectedIndex === 0 ? this.filteredTodos.length - 1 : this.selectedIndex - 1;
			this.updateList();
			return;
		}
		if (kb.matches(keyData, "selectDown")) {
			if (this.filteredTodos.length === 0) return;
			this.selectedIndex = this.selectedIndex === this.filteredTodos.length - 1 ? 0 : this.selectedIndex + 1;
			this.updateList();
			return;
		}
		if (kb.matches(keyData, "selectConfirm")) {
			const selected = this.filteredTodos[this.selectedIndex];
			if (selected) this.onSelectCallback(selected);
			return;
		}
		if (kb.matches(keyData, "selectCancel")) {
			this.onCancelCallback();
			return;
		}
		if (matchesKey(keyData, Key.ctrlShift("r"))) {
			const selected = this.filteredTodos[this.selectedIndex];
			if (selected && this.onQuickAction) this.onQuickAction(selected, "refine");
			return;
		}
		if (matchesKey(keyData, Key.ctrlShift("w"))) {
			const selected = this.filteredTodos[this.selectedIndex];
			if (selected && this.onQuickAction) this.onQuickAction(selected, "work");
			return;
		}
		this.searchInput.handleInput(keyData);
		this.applyFilter(this.searchInput.getValue());
	}

	override invalidate(): void {
		super.invalidate();
		this.updateHeader();
		this.updateHints();
		this.updateList();
	}
}

class TodoActionMenuComponent extends Container {
	private selectList: SelectList;
	private onSelectCallback: (action: TodoMenuAction) => void;
	private onCancelCallback: () => void;

	constructor(
		theme: Theme,
		todo: TodoRecord,
		onSelect: (action: TodoMenuAction) => void,
		onCancel: () => void,
	) {
		super();
		this.onSelectCallback = onSelect;
		this.onCancelCallback = onCancel;

		const closed = isTodoClosed(todo.status);
		const title = todo.title || "(untitled)";
		const options: SelectItem[] = [
			{ value: "view", label: "view", description: "View todo" },
			{ value: "work", label: "work", description: "Work on todo" },
			{ value: "refine", label: "refine", description: "Refine task" },
			...(closed
				? [{ value: "reopen", label: "reopen", description: "Reopen todo" }]
				: [{ value: "close", label: "close", description: "Close todo" }]),
			...(todo.assigned_to_session
				? [{ value: "release", label: "release", description: "Release assignment" }]
				: []),
			{ value: "copyPath", label: "copy path", description: "Copy absolute path to clipboard" },
			{ value: "copyText", label: "copy text", description: "Copy title and body to clipboard" },
			{ value: "delete", label: "delete", description: "Delete todo" },
		];

		this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		this.addChild(
			new Text(
				theme.fg(
					"accent",
					theme.bold(`Actions for ${formatTodoId(todo.id)} "${title}"`),
				),
			),
		);

		this.selectList = new SelectList(options, options.length, {
			selectedPrefix: (text) => theme.fg("accent", text),
			selectedText: (text) => theme.fg("accent", text),
			description: (text) => theme.fg("muted", text),
			scrollInfo: (text) => theme.fg("dim", text),
			noMatch: (text) => theme.fg("warning", text),
		});

		this.selectList.onSelect = (item) => this.onSelectCallback(item.value as TodoMenuAction);
		this.selectList.onCancel = () => this.onCancelCallback();

		this.addChild(this.selectList);
		this.addChild(new Text(theme.fg("dim", "Enter to confirm • Esc back")));
		this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
	}

	handleInput(keyData: string): void {
		this.selectList.handleInput(keyData);
	}

	override invalidate(): void {
		super.invalidate();
	}
}

class TodoDeleteConfirmComponent extends Container {
	private selectList: SelectList;
	private onConfirm: (confirmed: boolean) => void;

	constructor(theme: Theme, message: string, onConfirm: (confirmed: boolean) => void) {
		super();
		this.onConfirm = onConfirm;

		const options: SelectItem[] = [
			{ value: "yes", label: "Yes" },
			{ value: "no", label: "No" },
		];

		this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
		this.addChild(new Text(theme.fg("accent", message)));

		this.selectList = new SelectList(options, options.length, {
			selectedPrefix: (text) => theme.fg("accent", text),
			selectedText: (text) => theme.fg("accent", text),
			description: (text) => theme.fg("muted", text),
			scrollInfo: (text) => theme.fg("dim", text),
			noMatch: (text) => theme.fg("warning", text),
		});

		this.selectList.onSelect = (item) => this.onConfirm(item.value === "yes");
		this.selectList.onCancel = () => this.onConfirm(false);

		this.addChild(this.selectList);
		this.addChild(new Text(theme.fg("dim", "Enter to confirm • Esc back")));
		this.addChild(new DynamicBorder((s: string) => theme.fg("accent", s)));
	}

	handleInput(keyData: string): void {
		this.selectList.handleInput(keyData);
	}

	override invalidate(): void {
		super.invalidate();
	}
}

class TodoDetailOverlayComponent {
	private todo: TodoRecord;
	private theme: Theme;
	private tui: TUI;
	private markdown: Markdown;
	private scrollOffset = 0;
	private viewHeight = 0;
	private totalLines = 0;
	private onAction: (action: TodoOverlayAction) => void;

	constructor(tui: TUI, theme: Theme, todo: TodoRecord, onAction: (action: TodoOverlayAction) => void) {
		this.tui = tui;
		this.theme = theme;
		this.todo = todo;
		this.onAction = onAction;
		this.markdown = new Markdown(this.getMarkdownText(), 1, 0, getMarkdownTheme());
	}

	private getMarkdownText(): string {
		const body = this.todo.body?.trim();
		return body ? body : "_No details yet._";
	}

	handleInput(keyData: string): void {
		const kb = getEditorKeybindings();
		if (kb.matches(keyData, "selectCancel")) {
			this.onAction("back");
			return;
		}
		if (kb.matches(keyData, "selectConfirm")) {
			this.onAction("work");
			return;
		}
		if (kb.matches(keyData, "selectUp")) {
			this.scrollBy(-1);
			return;
		}
		if (kb.matches(keyData, "selectDown")) {
			this.scrollBy(1);
			return;
		}
		if (kb.matches(keyData, "selectPageUp")) {
			this.scrollBy(-this.viewHeight || -1);
			return;
		}
		if (kb.matches(keyData, "selectPageDown")) {
			this.scrollBy(this.viewHeight || 1);
			return;
		}
	}

	render(width: number): string[] {
		const maxHeight = this.getMaxHeight();
		const headerLines = 3;
		const footerLines = 3;
		const borderLines = 2;
		const innerWidth = Math.max(10, width - 2);
		const contentHeight = Math.max(1, maxHeight - headerLines - footerLines - borderLines);

		const markdownLines = this.markdown.render(innerWidth);
		this.totalLines = markdownLines.length;
		this.viewHeight = contentHeight;
		const maxScroll = Math.max(0, this.totalLines - contentHeight);
		this.scrollOffset = Math.max(0, Math.min(this.scrollOffset, maxScroll));

		const visibleLines = markdownLines.slice(this.scrollOffset, this.scrollOffset + contentHeight);
		const lines: string[] = [];

		lines.push(this.buildTitleLine(innerWidth));
		lines.push(this.buildMetaLine(innerWidth));
		lines.push("");

		for (const line of visibleLines) {
			lines.push(truncateToWidth(line, innerWidth));
		}
		while (lines.length < headerLines + contentHeight) {
			lines.push("");
		}

		lines.push("");
		lines.push(this.buildActionLine(innerWidth));

		const borderColor = (text: string) => this.theme.fg("borderMuted", text);
		const top = borderColor(`┌${"─".repeat(innerWidth)}┐`);
		const bottom = borderColor(`└${"─".repeat(innerWidth)}┘`);
		const framedLines = lines.map((line) => {
			const truncated = truncateToWidth(line, innerWidth);
			const padding = Math.max(0, innerWidth - visibleWidth(truncated));
			return borderColor("│") + truncated + " ".repeat(padding) + borderColor("│");
		});

		return [top, ...framedLines, bottom].map((line) => truncateToWidth(line, width));
	}

	invalidate(): void {
		this.markdown = new Markdown(this.getMarkdownText(), 1, 0, getMarkdownTheme());
	}

	private getMaxHeight(): number {
		const rows = this.tui.terminal.rows || 24;
		return Math.max(10, Math.floor(rows * 0.8));
	}

	private buildTitleLine(width: number): string {
		const titleText = this.todo.title
			? ` ${this.todo.title} `
			: ` Todo ${formatTodoId(this.todo.id)} `;
		const titleWidth = visibleWidth(titleText);
		if (titleWidth >= width) {
			return truncateToWidth(this.theme.fg("accent", titleText.trim()), width);
		}
		const leftWidth = Math.max(0, Math.floor((width - titleWidth) / 2));
		const rightWidth = Math.max(0, width - titleWidth - leftWidth);
		return (
			this.theme.fg("borderMuted", "─".repeat(leftWidth)) +
			this.theme.fg("accent", titleText) +
			this.theme.fg("borderMuted", "─".repeat(rightWidth))
		);
	}

	private buildMetaLine(width: number): string {
		const status = this.todo.status || "open";
		const statusColor = isTodoClosed(status) ? "dim" : "success";
		const tagText = this.todo.tags.length ? this.todo.tags.join(", ") : "no tags";
		const line =
			this.theme.fg("accent", formatTodoId(this.todo.id)) +
			this.theme.fg("muted", " • ") +
			this.theme.fg(statusColor, status) +
			this.theme.fg("muted", " • ") +
			this.theme.fg("muted", tagText);
		return truncateToWidth(line, width);
	}

	private buildActionLine(width: number): string {
		const work = this.theme.fg("accent", "enter") + this.theme.fg("muted", " work on todo");
		const back = this.theme.fg("dim", "esc back");
		const pieces = [work, back];

		let line = pieces.join(this.theme.fg("muted", " • "));
		if (this.totalLines > this.viewHeight) {
			const start = Math.min(this.totalLines, this.scrollOffset + 1);
			const end = Math.min(this.totalLines, this.scrollOffset + this.viewHeight);
			const scrollInfo = this.theme.fg("dim", ` ${start}-${end}/${this.totalLines}`);
			line += scrollInfo;
		}

		return truncateToWidth(line, width);
	}

	private scrollBy(delta: number): void {
		const maxScroll = Math.max(0, this.totalLines - this.viewHeight);
		this.scrollOffset = Math.max(0, Math.min(this.scrollOffset + delta, maxScroll));
	}
}

function getTodosDir(cwd: string): string {
	return resolveTaskStore(cwd, process.env[TODO_PATH_ENV] ?? "", GLOBAL_PI_DIR);
}

function getTodosDirLabel(cwd: string): string {
	if (process.env[TODO_PATH_ENV]?.trim()) return getTodosDir(cwd);
	return path.join("~/.pi/history", projectScopeSlug(cwd), "todos");
}

function getTodoPath(todosDir: string, id: string): string {
	return path.join(todosDir, `${id}.md`);
}

async function listTodos(todosDir: string): Promise<TodoFrontMatter[]> {
	const core = await loadTaskPackage("core");
	const result = await core.executeTask({ action: "list-all" }, {
		storeRoot: todosDir, actorId: "pi-ui-list", allowForce: false, allowedActions: ["list-all"],
	});
	return result.todos;
}

async function runTodo(input, todosDir: string, ctx: ExtensionContext) {
	return runPiTask(await loadTaskPackage("core"), input, todosDir, ctx);
}

function getTodoTitle(todo: TodoFrontMatter): string {
	return todo.title || "(untitled)";
}

function getTodoStatus(todo: TodoFrontMatter): string {
	return todo.status || "open";
}

function formatAssignmentSuffix(todo: TodoFrontMatter): string {
	return todo.assigned_to_session ? ` (assigned: ${todo.assigned_to_session})` : "";
}

function renderAssignmentSuffix(
	theme: Theme,
	todo: TodoFrontMatter,
	currentSessionId?: string,
): string {
	if (!todo.assigned_to_session) return "";
	const isCurrent = todo.assigned_to_session === currentSessionId;
	const color = isCurrent ? "success" : "dim";
	const suffix = isCurrent ? ", current" : "";
	return theme.fg(color, ` (assigned: ${todo.assigned_to_session}${suffix})`);
}

function formatTodoHeading(todo: TodoFrontMatter): string {
	const tagText = todo.tags.length ? ` [${todo.tags.join(", ")}]` : "";
	return `${formatTodoId(todo.id)} ${getTodoTitle(todo)}${tagText}${formatAssignmentSuffix(todo)}`;
}

function buildRefinePrompt(todoId: string, title: string): string {
	return (
		`let's refine task ${formatTodoId(todoId)} "${title}": ` +
		"Ask me for the missing details needed to refine the todo together. Do not rewrite the todo yet and do not make assumptions. " +
		"Ask clear, concrete questions and wait for my answers before drafting any structured description.\n\n"
	);
}

function splitTodosByAssignment(todos: TodoFrontMatter[]): {
	assignedTodos: TodoFrontMatter[];
	openTodos: TodoFrontMatter[];
	closedTodos: TodoFrontMatter[];
} {
	const assignedTodos: TodoFrontMatter[] = [];
	const openTodos: TodoFrontMatter[] = [];
	const closedTodos: TodoFrontMatter[] = [];
	for (const todo of todos) {
		if (isTodoClosed(getTodoStatus(todo))) {
			closedTodos.push(todo);
			continue;
		}
		if (todo.assigned_to_session) {
			assignedTodos.push(todo);
		} else {
			openTodos.push(todo);
		}
	}
	return { assignedTodos, openTodos, closedTodos };
}

function formatTodoList(todos: TodoFrontMatter[]): string {
	if (!todos.length) return "No todos.";

	const { assignedTodos, openTodos, closedTodos } = splitTodosByAssignment(todos);
	const lines: string[] = [];
	const pushSection = (label: string, sectionTodos: TodoFrontMatter[]) => {
		lines.push(`${label} (${sectionTodos.length}):`);
		if (!sectionTodos.length) {
			lines.push("  none");
			return;
		}
		for (const todo of sectionTodos) {
			lines.push(`  ${formatTodoHeading(todo)}`);
		}
	};

	pushSection("Assigned todos", assignedTodos);
	pushSection("Open todos", openTodos);
	pushSection("Closed todos", closedTodos);
	return lines.join("\n");
}

function serializeTodoForAgent(todo: TodoRecord): string {
	const payload = { ...todo, id: formatTodoId(todo.id) };
	return JSON.stringify(payload, null, 2);
}

function serializeTodoListForAgent(todos: TodoFrontMatter[]): string {
	const { assignedTodos, openTodos, closedTodos } = splitTodosByAssignment(todos);
	const mapTodo = (todo: TodoFrontMatter) => ({ ...todo, id: formatTodoId(todo.id) });
	return JSON.stringify(
		{
			assigned: assignedTodos.map(mapTodo),
			open: openTodos.map(mapTodo),
			closed: closedTodos.map(mapTodo),
		},
		null,
		2,
	);
}

function renderTodoHeading(theme: Theme, todo: TodoFrontMatter, currentSessionId?: string): string {
	const closed = isTodoClosed(getTodoStatus(todo));
	const titleColor = closed ? "dim" : "text";
	const tagText = todo.tags.length ? theme.fg("dim", ` [${todo.tags.join(", ")}]`) : "";
	const assignmentText = renderAssignmentSuffix(theme, todo, currentSessionId);
	return (
		theme.fg("accent", formatTodoId(todo.id)) +
		" " +
		theme.fg(titleColor, getTodoTitle(todo)) +
		tagText +
		assignmentText
	);
}

function renderTodoList(
	theme: Theme,
	todos: TodoFrontMatter[],
	expanded: boolean,
	currentSessionId?: string,
): string {
	if (!todos.length) return theme.fg("dim", "No todos");

	const { assignedTodos, openTodos, closedTodos } = splitTodosByAssignment(todos);
	const lines: string[] = [];
	const pushSection = (label: string, sectionTodos: TodoFrontMatter[]) => {
		lines.push(theme.fg("muted", `${label} (${sectionTodos.length})`));
		if (!sectionTodos.length) {
			lines.push(theme.fg("dim", "  none"));
			return;
		}
		const maxItems = expanded ? sectionTodos.length : Math.min(sectionTodos.length, 3);
		for (let i = 0; i < maxItems; i++) {
			lines.push(`  ${renderTodoHeading(theme, sectionTodos[i], currentSessionId)}`);
		}
		if (!expanded && sectionTodos.length > maxItems) {
			lines.push(theme.fg("dim", `  ... ${sectionTodos.length - maxItems} more`));
		}
	};

	const sections: Array<{ label: string; todos: TodoFrontMatter[] }> = [
		{ label: "Assigned todos", todos: assignedTodos },
		{ label: "Open todos", todos: openTodos },
		{ label: "Closed todos", todos: closedTodos },
	];

	sections.forEach((section, index) => {
		if (index > 0) lines.push("");
		pushSection(section.label, section.todos);
	});

	return lines.join("\n");
}

function renderTodoDetail(theme: Theme, todo: TodoRecord, expanded: boolean): string {
	const summary = renderTodoHeading(theme, todo);
	if (!expanded) return summary;

	const tags = todo.tags.length ? todo.tags.join(", ") : "none";
	const createdAt = todo.created_at || "unknown";
	const bodyText = todo.body?.trim() ? todo.body.trim() : "No details yet.";
	const bodyLines = bodyText.split("\n");

	const lines = [
		summary,
		theme.fg("muted", `Status: ${getTodoStatus(todo)}`),
		theme.fg("muted", `Tags: ${tags}`),
		theme.fg("muted", `Created: ${createdAt}`),
		"",
		theme.fg("muted", "Body:"),
		...bodyLines.map((line) => theme.fg("text", `  ${line}`)),
	];

	return lines.join("\n");
}

function appendExpandHint(theme: Theme, text: string): string {
	return `${text}\n${theme.fg("dim", `(${keyHint("expandTools", "to expand")})`)}`;
}

async function updateTodoStatus(todosDir: string, id: string, status: string, ctx: ExtensionContext) {
	const result = await runTodo({ action: "update", id, status }, todosDir, ctx);
	return "error" in result ? result : result.todo;
}

async function releaseTodoAssignment(todosDir: string, id: string, ctx: ExtensionContext, force = false) {
	const result = await runTodo({ action: "release", id, force }, todosDir, ctx);
	return "error" in result ? result : result.todo;
}

async function deleteTodo(todosDir: string, id: string, ctx: ExtensionContext) {
	const result = await runTodo({ action: "delete", id }, todosDir, ctx);
	return "error" in result ? result : result.todo;
}

export default async function todosExtension(pi: ExtensionAPI) {
	const core = await loadTaskPackage("core");
	pi.on("session_start", async (_event, ctx) => {
		if (!process.env[TODO_PATH_ENV]?.trim()) {
			await migrateLegacyTodos(ctx.cwd, GLOBAL_PI_DIR);
		}
		const todosDir = getTodosDir(ctx.cwd);
		await core.initializeStore(todosDir);
		const settings = await core.readTodoSettings(todosDir);
		await core.garbageCollectTodos(todosDir, settings);
	});

	const todosDirLabel = getTodosDirLabel(process.cwd());

	pi.registerTool({
		name: "todo",
		label: "Todo",
		description:
			`Manage file-based todos in ${todosDirLabel} (list, list-all, get, create, update, append, delete, claim, release). ` +
			"Title is the short summary; body is long-form markdown notes (update replaces, append adds). " +
			"Todo ids are shown as TODO-<hex>; id parameters accept TODO-<hex> or the raw hex filename. " +
			"Claim tasks before working on them to avoid conflicts, and close them when complete.",
		promptSnippet:
			`Manage file-based todos in ${todosDirLabel} (list, list-all, get, create, update, append, delete, claim, release). ` +
			"Title is the short summary; body is long-form markdown notes (update replaces, append adds). " +
			"Todo ids are shown as TODO-<hex>; id parameters accept TODO-<hex> or the raw hex filename. " +
			"Claim tasks before working on them to avoid conflicts, and close them when complete.",
		promptGuidelines: [
			"Use todo to retrieve TODO-<hex> references; never search for or edit the todo storage backend directly.",
		],
		parameters: core.taskInputJsonSchema,

		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const action: TodoAction = params.action;
			const result = await runTodo(params, getTodosDir(ctx.cwd), ctx);
			if ("error" in result) {
				const required = result.error === "id required" || result.error === "title required";
				const missing = result.code === "missing" && ["get", "update", "append"].includes(action);
				return {
					content: [{ type: "text", text: required ? `Error: ${result.error}` : result.error }],
					details: { action, error: missing ? "not found" : result.error },
				};
			}
			if ("todos" in result) {
				return {
					content: [{ type: "text", text: serializeTodoListForAgent(result.todos) }],
					details: { action, todos: result.todos, currentSessionId: ctx.sessionManager.getSessionId() },
				};
			}
			return {
				content: [{ type: "text", text: serializeTodoForAgent(result.todo) }],
				details: { action, todo: result.todo },
			};
		},

		renderCall(args, theme) {
			const action = typeof args.action === "string" ? args.action : "";
			const id = typeof args.id === "string" ? args.id : "";
			const normalizedId = id ? normalizeTodoId(id) : "";
			const title = typeof args.title === "string" ? args.title : "";
			let text = theme.fg("toolTitle", theme.bold("todo ")) + theme.fg("muted", action);
			if (normalizedId) {
				text += " " + theme.fg("accent", formatTodoId(normalizedId));
			}
			if (title) {
				text += " " + theme.fg("dim", `"${title}"`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme) {
			const details = result.details as TodoToolDetails | undefined;
			if (isPartial) {
				return new Text(theme.fg("warning", "Processing..."), 0, 0);
			}
			if (!details) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			if (details.error) {
				return new Text(theme.fg("error", `Error: ${details.error}`), 0, 0);
			}

			if (details.action === "list" || details.action === "list-all") {
				let text = renderTodoList(theme, details.todos, expanded, details.currentSessionId);
				if (!expanded) {
					const { closedTodos } = splitTodosByAssignment(details.todos);
					if (closedTodos.length) {
						text = appendExpandHint(theme, text);
					}
				}
				return new Text(text, 0, 0);
			}

			if (!details.todo) {
				const text = result.content[0];
				return new Text(text?.type === "text" ? text.text : "", 0, 0);
			}

			let text = renderTodoDetail(theme, details.todo, expanded);
			const actionLabel =
				details.action === "create"
					? "Created"
					: details.action === "update"
						? "Updated"
						: details.action === "append"
							? "Appended to"
							: details.action === "delete"
								? "Deleted"
								: details.action === "claim"
									? "Claimed"
									: details.action === "release"
										? "Released"
										: null;
			if (actionLabel) {
				const lines = text.split("\n");
				lines[0] = theme.fg("success", "✓ ") + theme.fg("muted", `${actionLabel} `) + lines[0];
				text = lines.join("\n");
			}
			if (!expanded) {
				text = appendExpandHint(theme, text);
			}
			return new Text(text, 0, 0);
		},
	});

	pi.registerCommand("todos", {
		description: "List todos from ~/.pi/history/<project>/todos",
		getArgumentCompletions: async (argumentPrefix: string) => {
			const todos = await listTodos(getTodosDir(process.cwd()));
			if (!todos.length) return null;
			const matches = filterTodos(todos, argumentPrefix);
			if (!matches.length) return null;
			return matches.map((todo) => {
				const title = todo.title || "(untitled)";
				const tags = todo.tags.length ? ` • ${todo.tags.join(", ")}` : "";
				return {
					value: title,
					label: `${formatTodoId(todo.id)} ${title}`,
					description: `${todo.status || "open"}${tags}`,
				};
			});
		},
		handler: async (args, ctx) => {
			const todosDir = getTodosDir(ctx.cwd);
			const todos = await listTodos(todosDir);
			const currentSessionId = ctx.sessionManager.getSessionId();
			const searchTerm = (args ?? "").trim();

			if (!ctx.hasUI) {
				const text = formatTodoList(todos);
				console.log(text);
				return;
			}

			let nextPrompt: string | null = null;
			let rootTui: TUI | null = null;
			await ctx.ui.custom<void>((tui, theme, _kb, done) => {
				rootTui = tui;
				let selector: TodoSelectorComponent | null = null;
				let actionMenu: TodoActionMenuComponent | null = null;
				let deleteConfirm: TodoDeleteConfirmComponent | null = null;
				let activeComponent:
					| {
							render: (width: number) => string[];
							invalidate: () => void;
							handleInput?: (data: string) => void;
							focused?: boolean;
						}
					| null = null;
				let wrapperFocused = false;

				const setActiveComponent = (
					component:
						| {
								render: (width: number) => string[];
								invalidate: () => void;
								handleInput?: (data: string) => void;
								focused?: boolean;
							}
						| null,
				) => {
					if (activeComponent && "focused" in activeComponent) {
						activeComponent.focused = false;
					}
					activeComponent = component;
					if (activeComponent && "focused" in activeComponent) {
						activeComponent.focused = wrapperFocused;
					}
					tui.requestRender();
				};

				const copyTodoPathToClipboard = (todoId: string) => {
					const filePath = getTodoPath(todosDir, todoId);
					const absolutePath = path.resolve(filePath);
					try {
						copyToClipboard(absolutePath);
						ctx.ui.notify(`Copied ${absolutePath} to clipboard`, "info");
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						ctx.ui.notify(message, "error");
					}
				};

				const copyTodoTextToClipboard = (record: TodoRecord) => {
					const title = record.title || "(untitled)";
					const body = record.body?.trim() || "";
					const text = body ? `# ${title}\n\n${body}` : `# ${title}`;
					try {
						copyToClipboard(text);
						ctx.ui.notify("Copied todo text to clipboard", "info");
					} catch (error) {
						const message = error instanceof Error ? error.message : String(error);
						ctx.ui.notify(message, "error");
					}
				};

				const resolveTodoRecord = async (todo: TodoFrontMatter): Promise<TodoRecord | null> => {
					const result = await runTodo({ action: "get", id: todo.id }, todosDir, ctx);
					if ("error" in result) {
						ctx.ui.notify(`Todo ${formatTodoId(todo.id)} not found`, "error");
						return null;
					}
					return result.todo;
				};

				const openTodoOverlay = async (record: TodoRecord): Promise<TodoOverlayAction> => {
					const action = await ctx.ui.custom<TodoOverlayAction>(
						(overlayTui, overlayTheme, _overlayKb, overlayDone) =>
							new TodoDetailOverlayComponent(overlayTui, overlayTheme, record, overlayDone),
						{
							overlay: true,
							overlayOptions: { width: "80%", maxHeight: "80%", anchor: "center" },
						},
					);

					return action ?? "back";
				};

				const applyTodoAction = async (
					record: TodoRecord,
					action: TodoMenuAction,
				): Promise<"stay" | "exit"> => {
					if (action === "refine") {
						const title = record.title || "(untitled)";
						nextPrompt = buildRefinePrompt(record.id, title);
						done();
						return "exit";
					}
					if (action === "work") {
						const title = record.title || "(untitled)";
						nextPrompt = `work on todo ${formatTodoId(record.id)} "${title}"`;
						done();
						return "exit";
					}
					if (action === "view") {
						return "stay";
					}
					if (action === "copyPath") {
						copyTodoPathToClipboard(record.id);
						return "stay";
					}
					if (action === "copyText") {
						copyTodoTextToClipboard(record);
						return "stay";
					}

					if (action === "release") {
						const result = await releaseTodoAssignment(todosDir, record.id, ctx, true);
						if ("error" in result) {
							ctx.ui.notify(result.error, "error");
							return "stay";
						}
						const updatedTodos = await listTodos(todosDir);
						selector?.setTodos(updatedTodos);
						ctx.ui.notify(`Released todo ${formatTodoId(record.id)}`, "info");
						return "stay";
					}

					if (action === "delete") {
						const result = await deleteTodo(todosDir, record.id, ctx);
						if ("error" in result) {
							ctx.ui.notify(result.error, "error");
							return "stay";
						}
						const updatedTodos = await listTodos(todosDir);
						selector?.setTodos(updatedTodos);
						ctx.ui.notify(`Deleted todo ${formatTodoId(record.id)}`, "info");
						return "stay";
					}

					const nextStatus = action === "close" ? "closed" : "open";
					const result = await updateTodoStatus(todosDir, record.id, nextStatus, ctx);
					if ("error" in result) {
						ctx.ui.notify(result.error, "error");
						return "stay";
					}

					const updatedTodos = await listTodos(todosDir);
					selector?.setTodos(updatedTodos);
					ctx.ui.notify(
						`${action === "close" ? "Closed" : "Reopened"} todo ${formatTodoId(record.id)}`,
						"info",
					);
					return "stay";
				};

				const handleActionSelection = async (record: TodoRecord, action: TodoMenuAction) => {
					if (action === "view") {
						const overlayAction = await openTodoOverlay(record);
						if (overlayAction === "work") {
							await applyTodoAction(record, "work");
							return;
						}
						if (actionMenu) {
							setActiveComponent(actionMenu);
						}
						return;
					}

					if (action === "delete") {
						const message = `Delete todo ${formatTodoId(record.id)}? This cannot be undone.`;
						deleteConfirm = new TodoDeleteConfirmComponent(theme, message, (confirmed) => {
							if (!confirmed) {
								setActiveComponent(actionMenu);
								return;
							}
							void (async () => {
								await applyTodoAction(record, "delete");
								setActiveComponent(selector);
							})();
						});
						setActiveComponent(deleteConfirm);
						return;
					}

					const result = await applyTodoAction(record, action);
					if (result === "stay") {
						setActiveComponent(selector);
					}
				};

				const showActionMenu = async (todo: TodoFrontMatter | TodoRecord) => {
					const record = "body" in todo ? todo : await resolveTodoRecord(todo);
					if (!record) return;
					actionMenu = new TodoActionMenuComponent(
						theme,
						record,
						(action) => {
							void handleActionSelection(record, action);
						},
						() => {
							setActiveComponent(selector);
						},
					);
					setActiveComponent(actionMenu);
				};

				const handleSelect = async (todo: TodoFrontMatter) => {
					await showActionMenu(todo);
				};

				selector = new TodoSelectorComponent(
					tui,
					theme,
					todos,
					(todo) => {
						void handleSelect(todo);
					},
					() => done(),
					searchTerm || undefined,
					currentSessionId,
					(todo, action) => {
						const title = todo.title || "(untitled)";
						nextPrompt =
							action === "refine"
								? buildRefinePrompt(todo.id, title)
								: `work on todo ${formatTodoId(todo.id)} "${title}"`;
						done();
					},
				);

				setActiveComponent(selector);

				const rootComponent = {
					get focused() {
						return wrapperFocused;
					},
					set focused(value: boolean) {
						wrapperFocused = value;
						if (activeComponent && "focused" in activeComponent) {
							activeComponent.focused = value;
						}
					},
					render(width: number) {
						return activeComponent ? activeComponent.render(width) : [];
					},
					invalidate() {
						activeComponent?.invalidate();
					},
					handleInput(data: string) {
						activeComponent?.handleInput?.(data);
					},
				};

				return rootComponent;
			});

			if (nextPrompt) {
				ctx.ui.setEditorText(nextPrompt);
				rootTui?.requestRender();
			}
		},
	});

}
