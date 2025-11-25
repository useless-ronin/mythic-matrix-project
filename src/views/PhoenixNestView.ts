// src/views/PhoenixNestView.ts

import { ItemView, WorkspaceLeaf, Notice, TFile } from 'obsidian';
import MythicMatrixPlugin from '../main';
import { PHOENIX_VIEW_TYPE } from '../constants';
import { AlchemistLogModal } from '../modals/AlchemistLogModal';
import { LightweightRevisionModal, RevisionLogResult } from '../modals/LightweightRevisionModal';

interface RevisionItem {
    file: TFile;
    nextRevision: string;
    revisionLevel?: number;
}

export class PhoenixNestView extends ItemView {
    plugin: MythicMatrixPlugin;

    constructor(leaf: WorkspaceLeaf, plugin: MythicMatrixPlugin) {
        super(leaf);
        this.plugin = plugin;
        // Bind the render function to 'this' context to ensure it works as an event listener
        this.renderNest = this.renderNest.bind(this);
    }

    getViewType() { return PHOENIX_VIEW_TYPE; }
    getDisplayText() { return "Phoenix Nest"; }
    getIcon() { return "refresh-ccw"; }

    async onOpen() {
        this.plugin.eventBus.on('alchemist:log-updated', this.renderNest);
        await this.renderNest();
    }

    // --- FIX: Changed signature to 'async' to match base class ---
    async onClose() {
        this.plugin.eventBus.off('alchemist:log-updated', this.renderNest);
    }

    async renderNest() {
        this.containerEl.empty();
        const title = this.containerEl.createEl("h2", { text: "The Phoenix Nest 🕊️" });
        title.style.textAlign = "center";
        title.style.marginBottom = "20px";

        const notes = this.plugin.app.vault.getMarkdownFiles();
        const today = new Date().toISOString().split('T')[0];
        
        const dueNotes: RevisionItem[] = [], overdueNotes: RevisionItem[] = [], futureNotes: RevisionItem[] = [];

        for (const file of notes) {
            const cache = this.plugin.app.metadataCache.getFileCache(file);
            const fm = cache?.frontmatter;
            if (fm?.nextRevision) {
                // --- FIX: Explicitly create object to satisfy TypeScript ---
                const item: RevisionItem = { 
                    file, 
                    nextRevision: fm.nextRevision, 
                    revisionLevel: fm.revisionLevel 
                };

                if (fm.nextRevision < today) overdueNotes.push(item);
                else if (fm.nextRevision === today) dueNotes.push(item);
                else futureNotes.push(item);
            }
        }
        
        const sortByDueDate = (a: RevisionItem, b: RevisionItem) => a.nextRevision.localeCompare(b.nextRevision);
        overdueNotes.sort(sortByDueDate);
        dueNotes.sort(sortByDueDate);
        futureNotes.sort(sortByDueDate);

        this.renderSection("🔥 Overdue Revisions", overdueNotes);
        this.renderSection("🕊️ Due Today", dueNotes);
        this.renderSection("🥚 Upcoming", futureNotes.slice(0, 15));
    }

    renderSection(title: string, items: RevisionItem[]) {
        if (items.length === 0) return;

        // --- ALL INLINE STYLES REPLACED WITH CSS CLASSES ---
        const section = this.containerEl.createEl("div", { cls: 'phoenix-nest-section' });
        section.createEl("h3", { text: `${title} (${items.length})` });

        for (const item of items) {
            const card = section.createEl("div", { cls: 'phoenix-nest-card' });

            card.createEl("strong", { text: item.file.basename });
            const meta = card.createEl("div", { text: `Revision #${item.revisionLevel || 1} • Due: ${item.nextRevision}` });
            meta.style.fontSize = "0.9em"; // Keeping minor style adjustments is fine
            meta.style.color = "var(--text-muted)";

            const btns = card.createEl("div", { cls: 'phoenix-nest-card-buttons' });

            btns.createEl("button", { text: "✅ Complete" }).onclick = () => this.handleCompleteRevision(item);
            btns.createEl("button", { text: "Snooze +3d" }).onclick = () => this.handleSnooze(item);
            btns.createEl("button", { text: "🏆 Master" }).onclick = () => this.handleMaster(item);
            btns.createEl("button", { text: "⚠️ Trouble" }).onclick = () => this.handleTrouble(item);
        }
    }

    async handleCompleteRevision(item: RevisionItem) {
        const currentLevel = item.revisionLevel || 1;

        if (currentLevel === 1) {
            new AlchemistLogModal(this.app, this.plugin.alchemistService, {
                topic: item.file.basename,
                onSave: async () => {
                    await this.plugin.revisionScheduler.scheduleNextRevision(item.file.path, currentLevel);
                    new Notice(`Revision #${currentLevel} logged for ${item.file.basename}`);
                    this.renderNest();
                }
            }).open();
        } else {
            const modal = new LightweightRevisionModal(this.app, item);
            
            modal.onClose = async () => {
                if (modal.result) { 
                    await this.appendRevisionLog(item.file, currentLevel, modal.result);
                    await this.plugin.revisionScheduler.scheduleNextRevision(item.file.path, currentLevel);
                    new Notice(`Revision #${currentLevel} logged for ${item.file.basename}`);
                    this.renderNest();
                }
            };
            modal.open();
        }
    }
    
    async appendRevisionLog(file: TFile, level: number, logData: RevisionLogResult) {
        const { vault } = this.app;
        const logFolder = this.plugin.settings.alchemistLogFolder;
        
        const logFiles = vault.getMarkdownFiles().filter(f => f.path.startsWith(logFolder));
        const masterLogFile = logFiles.find(f => f.basename.contains(file.basename));

        if (!masterLogFile) {
            new Notice(`Could not find Alchemist's Log for ${file.basename}. Please create one first.`, 5000);
            return;
        }

        const today = new Date().toISOString().split('T')[0];
        let revisionContent = `\n\n---\n## 🔁 Revision ${level} • ${today}\n`;
        revisionContent += `**Understanding**: ${logData.understanding}\n`;
        if (logData.log) revisionContent += `**Insight/Gap**: ${logData.log}\n`;
        if (logData.nextFocus) revisionContent += `**Focus for Next Time**: ${logData.nextFocus}\n`;

        await vault.append(masterLogFile, revisionContent);
    }

    async handleSnooze(item: RevisionItem) {
        const newDate = this.plugin.revisionScheduler.addDays(new Date(), 3);
        await this.plugin.revisionScheduler.rescheduleRevision(item.file.path, newDate);
        new Notice(`Snoozed ${item.file.basename} to ${newDate}`);
        this.renderNest();
    }

    async handleMaster(item: RevisionItem) {
        await this.plugin.revisionScheduler.markAsMastered(item.file);
        new Notice(`${item.file.basename} marked as mastered!`);
        this.renderNest();
    }

    async handleTrouble(item: RevisionItem) {
        await this.plugin.revisionScheduler.scheduleFirstRevision(item.file.path);
        
        await this.app.fileManager.processFrontMatter(item.file, fm => {
            const tags = new Set(fm.tags || []);
            tags.add("needs-work");
            fm.tags = [...tags] as any;
        });
        
        new Notice(`${item.file.basename} marked as 'Trouble'. Revision cycle reset.`);
        this.renderNest();
    }
}