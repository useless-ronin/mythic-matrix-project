// src/modals/PreTestWarmupModal.ts

import { App, Modal } from "obsidian";
import { LossLogService } from "../services/LossLogService";

export class PreTestWarmupModal extends Modal {
    private lossLogService: LossLogService;

    constructor(app: App, lossLogService: LossLogService) {
        super(app);
        this.lossLogService = lossLogService;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.addClass("pre-test-warmup-modal");

        // 1. Header
        contentEl.createEl("h2", { text: "🛡️ Pre-Test Warmup" });
        contentEl.createEl("p", { text: "Equip your armor before entering the arena.", cls: "modal-subtitle" });

        // 2. The Minotaur (Know your enemy)
        const minotaur = this.lossLogService.getCurrentMinotaur() || "Unknown";
        const minotaurSection = contentEl.createDiv({ cls: "warmup-section minotaur-warning" });
        minotaurSection.createEl("h3", { text: "⚠️ Beware Your Minotaur" });
        minotaurSection.createEl("p", { text: `Your primary weakness recently has been: **${minotaur}**.` });
        minotaurSection.createEl("p", { text: "Stay vigilant against this specific failure mode." });

        // 3. Ariadne's Threads (Your weapons)
        // We need to fetch a few recent threads. 
        // NOTE: efficient way is to use the service if it had a getter, or just scan here.
        // For MVP, let's grab from the files directly.
        this.renderRecentThreads(contentEl);

        // 4. Ritual Button
        const btnContainer = contentEl.createDiv({ cls: "modal-button-container" });
        const startBtn = btnContainer.createEl("button", { text: "I am Ready", cls: "mod-cta" });
        startBtn.onclick = () => {
            this.close();
        };
    }

    async renderRecentThreads(container: HTMLElement) {
        const threadsSection = container.createDiv({ cls: "warmup-section threads-list" });
        threadsSection.createEl("h3", { text: "🧵 Ariadne's Threads (Review)" });
        
        const folder = this.lossLogService.getLossLogFolder();
        const files = this.app.vault.getMarkdownFiles()
            .filter(f => f.path.startsWith(folder))
            .sort((a, b) => b.stat.ctime - a.stat.ctime) // Newest first
            .slice(0, 3); // Top 3

        if (files.length === 0) {
            threadsSection.createEl("p", { text: "No threads found yet." });
            return;
        }

        const ul = threadsSection.createEl("ul");
        for (const file of files) {
            const cache = this.app.metadataCache.getFileCache(file);
            const thread = cache?.frontmatter?.ariadnesThread;
            if (thread) {
                ul.createEl("li", { text: thread });
            }
        }
    }

    onClose() {
        this.contentEl.empty();
    }
}