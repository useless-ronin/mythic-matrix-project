// src/modals/LabyrinthSearchModal.ts

import { App, FuzzySuggestModal, TFile, FuzzyMatch } from "obsidian";
import { LossLogService } from "../services/LossLogService";

export class LabyrinthSearchModal extends FuzzySuggestModal<TFile> {
    private lossLogService: LossLogService;

    constructor(app: App, lossLogService: LossLogService) {
        super(app);
        this.lossLogService = lossLogService;
        this.setPlaceholder("Search the Labyrinth... (Type to filter by Task, Cause, or Thread)");
    }

    getItems(): TFile[] {
        const folder = this.lossLogService.getLossLogFolder();
        return this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(folder));
    }

    getItemText(file: TFile): string {
        const cache = this.app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter;
        
        // We search against: Task Name, Archetypes, Thread, and Root Cause
        const task = fm?.sourceTask || file.basename;
        const thread = fm?.ariadnesThread || "";
        const archetypes = (fm?.failureArchetypes || []).join(" ");
        const causes = (fm?.rootCauseChain || []).join(" ");

        return `${task} ${thread} ${archetypes} ${causes}`;
    }

    // --- FIX: Updated signature to accept FuzzyMatch<TFile> ---
    renderSuggestion(match: FuzzyMatch<TFile>, el: HTMLElement) {
        const file = match.item; // Extract the file from the match object
        const cache = this.app.metadataCache.getFileCache(file);
        const fm = cache?.frontmatter;
        
        el.createEl("div", { text: fm?.sourceTask || file.basename, cls: "labyrinth-search-task" });
        
        const metaDiv = el.createEl("div", { cls: "labyrinth-search-meta" });
        if (fm?.failureArchetypes && fm.failureArchetypes.length > 0) {
            metaDiv.createSpan({ text: fm.failureArchetypes[0], cls: "labyrinth-search-tag" });
        }
        if (fm?.ariadnesThread) {
            metaDiv.createSpan({ text: `🧵 ${fm.ariadnesThread.substring(0, 60)}...`, cls: "labyrinth-search-thread" });
        }
        
        // Simple CSS for the modal items
        metaDiv.style.fontSize = "0.8em";
        metaDiv.style.color = "var(--text-muted)";
        metaDiv.style.display = "flex";
        metaDiv.style.gap = "10px";
    }

    onChooseItem(file: TFile, evt: MouseEvent | KeyboardEvent) {
        this.app.workspace.openLinkText(file.path, "", true);
    }
}