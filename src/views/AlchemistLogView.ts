// src/views/AlchemistLogView.ts

import { ItemView, WorkspaceLeaf, TFile, Notice } from 'obsidian';
import MythicMatrixPlugin from '../main';
import { ALCHEMIST_LOG_VIEW_TYPE } from '../constants';

export class AlchemistLogView extends ItemView {
    plugin: MythicMatrixPlugin;
    activeTab: string = "journal";
    private topicContentEl: HTMLElement | null = null;
    // Store our event handler so we can remove it later
    private onLogUpdated = () => this.renderView();

    constructor(leaf: WorkspaceLeaf, plugin: MythicMatrixPlugin) {
        super(leaf);
        this.plugin = plugin;
    }

    getViewType(): string { return ALCHEMIST_LOG_VIEW_TYPE; }
    getDisplayText(): string { return "Alchemist's Log"; }
    getIcon(): string { return "flask-potion"; }

    async onOpen() {
        this.containerEl.addClass("alchemist-log-container");
        this.plugin.eventBus.on('alchemist:log-updated', this.onLogUpdated);
        this.renderView();
    }

    async onClose() {
        this.plugin.eventBus.off('alchemist:log-updated', this.onLogUpdated);
        this.containerEl.empty();
    }

    renderView = () => {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "Alchemist's Log 🧪" });
        this.renderTabs(contentEl);
        this.renderTabContent(contentEl.createDiv());
    }

    renderTabs(container: HTMLElement) {
        const tabContainer = container.createDiv({ cls: 'alv-tab-container' });
        const tabs = ["journal", "dashboard", "explorer", "patterns", "pending"];
        const pendingCount = this.plugin.settings.alchemistPending.length;

        tabs.forEach(tabId => {
            let label = tabId.charAt(0).toUpperCase() + tabId.slice(1);
            if (tabId === 'pending' && pendingCount > 0) label += ` (${pendingCount})`;
            
            const btn = tabContainer.createEl('button', { text: label });
            if (this.activeTab === tabId) btn.addClass('is-active');
            
            btn.onclick = () => {
                this.activeTab = tabId;
                this.renderView();
            };
        });
    }

    async renderTabContent(container: HTMLElement) {
        const logFolder = this.plugin.settings.alchemistLogFolder;
        const logFiles = this.app.vault.getMarkdownFiles().filter(f => f.path.startsWith(logFolder + "/"));

        switch (this.activeTab) {
            case "journal":
                await this.renderJournalView(container, logFiles);
                break;
            case "dashboard":
                await this.renderDashboardView(container, logFiles);
                break;
            case "explorer":
                await this.renderExplorerView(container, logFiles);
                break;
            case "patterns":
                await this.renderPatternsView(container, logFiles);
                break;
            case "pending":
                this.renderPendingView(container);
                break;
        }
    }

    // --- Tab-Specific Renderers ---

    async renderJournalView(container: HTMLElement, files: TFile[]) {
        if (files.length === 0) {
            container.createEl("p", { text: "No reflections yet." });
            return;
        }
        files.sort((a,b) => b.stat.mtime - a.stat.mtime).forEach(file => {
            const card = container.createEl('div', { cls: 'alv-card', text: file.basename });
            card.onclick = () => this.app.workspace.openLinkText(file.path, '');
        });
    }

    async renderDashboardView(container: HTMLElement, files: TFile[]) {
        if (files.length === 0) {
            container.createEl("p", { text: "No data for dashboard yet." });
            return;
        }
        container.createEl('h3', { text: 'Recent Insights' });
        const insightsContainer = container.createDiv();
        for (const file of files.slice(0, 5)) {
             const cache = this.app.metadataCache.getFileCache(file);
             if(cache?.frontmatter?.insight) {
                 insightsContainer.createEl('p', { text: `"${cache.frontmatter.insight}" - from ${file.basename}`});
             }
        }
    }
    
    renderPendingView(container: HTMLElement) {
        const pending = this.plugin.settings.alchemistPending || [];
        if (pending.length === 0) {
            container.createEl("p", { text: "No pending reflections. Good job!" });
            return;
        }

        const grid = container.createDiv({ cls: 'alv-pending-grid' });
        pending.forEach(entry => {
            const card = grid.createDiv({ cls: 'alv-card' });
            const topic = entry.topic || "General";
            card.createEl("strong", { text: topic });

            if (entry.taskText) {
                const preview = entry.taskText.substring(0, 80) + (entry.taskText.length > 80 ? "..." : "");
                card.createEl("div", { text: `Task: ${preview}`, cls: 'alv-card-meta' });
            }

            const btns = card.createDiv({ cls: 'alv-card-buttons' });
            btns.createEl("button", { text: "Edit & Save" }).onclick = () => {
                this.plugin.openAlchemistLogModal(entry);
            };
            btns.createEl("button", { text: "Skip" }).onclick = async () => {
                this.plugin.settings.alchemistPending = this.plugin.settings.alchemistPending.filter(
                    e => e.timestamp !== entry.timestamp
                );
                await this.plugin.saveSettings();
                new Notice(`Skipped reflection for "${topic}"`);
                this.renderView(); 
            };
        });
    }

    async renderExplorerView(container: HTMLElement, logFiles: TFile[]) {
        if (logFiles.length === 0) {
            container.createEl("p", { text: "No logs to explore." });
            return;
        }
        
        const topics = [...new Set(logFiles.map(f => 
            f.basename.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2} - /, "")
        ))].sort();

        const explorerContainer = container.createDiv({ cls: 'alv-explorer-container' });
        const sidebar = explorerContainer.createDiv({ cls: 'alv-explorer-sidebar' });
        this.topicContentEl = explorerContainer.createDiv({ cls: 'alv-explorer-content' });

        for (const topic of topics) {
            const btn = sidebar.createEl("button", { text: topic });
            btn.onclick = async () => {
                // Highlight the active button
                sidebar.querySelectorAll('button').forEach(b => b.removeClass('is-active'));
                btn.addClass('is-active');
                const topicFiles = logFiles.filter(f => f.basename.includes(` - ${topic}.md`));
                this.renderTopicRevisions(topic, topicFiles);
            };
        }

        if (topics.length > 0) {
            sidebar.children[0]?.addClass('is-active');
            const firstTopicFiles = logFiles.filter(f => f.basename.includes(` - ${topics[0]}.md`));
            this.renderTopicRevisions(topics[0], firstTopicFiles);
        }
    }

    async renderPatternsView(container: HTMLElement, logFiles: TFile[]) {
        if (logFiles.length < 3) { // Need some data to find a pattern
            container.createEl("p", { text: "Not enough data to find patterns." });
            return;
        }

        const causeCount: Record<string, number> = {};
        for (const file of logFiles) {
            const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
            if (fm.difficultyCauses && Array.isArray(fm.difficultyCauses)) {
                fm.difficultyCauses.forEach(cause => {
                    causeCount[cause] = (causeCount[cause] || 0) + 1;
                });
            }
        }
        const sortedCauses = Object.entries(causeCount).sort((a, b) => b[1] - a[1]);
        if (sortedCauses.length > 0) {
            container.createEl("h3", { text: "Top Difficulty Causes" });
            const list = container.createEl("ul");
            sortedCauses.slice(0, 5).forEach(([cause, count]) => {
                list.createEl("li", { text: `${cause}: ${count} logs` });
            });
        }

        const confusionTopics: Record<string, number> = {};
        for (const file of logFiles) {
            const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
            if (fm.tags && (Array.isArray(fm.tags) && fm.tags.includes("log/confusion"))) {
                const topic = file.basename.replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2} - /, "");
                confusionTopics[topic] = (confusionTopics[topic] || 0) + 1;
            }
        }
        const sortedTopics = Object.entries(confusionTopics).sort((a, b) => b[1] - a[1]);
        if (sortedTopics.length > 0) {
            container.createEl("h3", { text: "Confusion Heatmap" });
            const list = container.createEl("ul");
            sortedTopics.slice(0, 5).forEach(([topic, count]) => {
                list.createEl("li", { text: `${topic}: ${count} confusing logs` });
            });
        }
    }

    // --- Helper Methods ---

    async renderTopicRevisions(topic: string, files: TFile[]) {
        if (!this.topicContentEl) return;
        this.topicContentEl.empty();
        this.topicContentEl.createEl("h3", { text: topic });
        
        files.sort((a, b) => b.stat.mtime - a.stat.mtime);
        for (const file of files) {
            const content = await this.app.vault.read(file);
            const revisions = this.extractRevisions(content);
            for (const rev of revisions) {
                const revDiv = this.topicContentEl.createDiv({ cls: 'alv-card' });
                revDiv.createEl("strong", { text: rev.header });
                if (rev.understanding) revDiv.createEl("div", { text: `Understanding: ${rev.understanding}` });
                if (rev.insight) revDiv.createEl("div", { text: `💡 ${rev.insight}` });
            }
        }
    }

    private extractRevisions(content: string): { header: string; understanding: string; difficulty: string; insight: string }[] {
        const lines = content.split('\n');
        const revisions = [];
        let currentHeader: string | null = null;
        let currentBlock = { header: "", understanding: "", difficulty: "", insight: "" };
        
        for (const line of lines) {
            const revMatch = line.match(/^## 🔁 Revision (\d+) • (\d{4}-\d{2}-\d{2})/);
            if (revMatch) {
                if (currentHeader) revisions.push({ ...currentBlock });
                currentHeader = `Revision ${revMatch[1]} • ${revMatch[2]}`;
                currentBlock = { header: currentHeader, understanding: "", difficulty: "", insight: "" };
            } else if (currentHeader) {
                const uMatch = line.match(/\*\*Understanding\*\*:\s*(.+)/);
                if (uMatch) currentBlock.understanding = uMatch[1];
                const dMatch = line.match(/\*\*Difficulty\*\*:\s*(.+)/);
                if (dMatch) currentBlock.difficulty = dMatch[1];
                const iMatch = line.match(/\*\*Insight\*\*:\s*(.+)/);
                if (iMatch) currentBlock.insight = iMatch[1];
            }
        }
        if (currentHeader) revisions.push(currentBlock);
        
        if (revisions.length === 0 && content.trim().length > 0) {
             const fmCache = this.app.metadataCache.getCache(this.app.workspace.getActiveFile()?.path || '')?.frontmatter;
             const insight = fmCache?.insight || 'Click to view full log.';
             revisions.push({ header: "Initial Log", understanding: fmCache?.understanding || '', difficulty: '', insight });
        }
        return revisions;
    }
}