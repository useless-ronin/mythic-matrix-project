// src/modals/AlchemistLogModal.ts

import { App, Modal, Setting, Notice } from 'obsidian';
import { AlchemistService, AlchemistLogData } from '../services/AlchemistService';

export class AlchemistLogModal extends Modal {
    alchemistService: AlchemistService;
    context: Partial<AlchemistLogData>;
    activeTab: string = "core";
    onSaveCallback?: () => void | Promise<void>; // ← NEW: explicit callback

    // --- State properties for modal inputs ---
    topic: string;
    log: string;
    understanding: string;
    confidenceBefore: string;
    confidenceAfter: string;
    difficultyCauses: string[];
    fixPrinciple: string;
    serendipitySpark: string;
    insight: string;

    constructor(
        app: App,
        alchemistService: AlchemistService,
        context: Partial<AlchemistLogData>,
        onSaveCallback?: () => void | Promise<void>  // ← NEW parameter
    ) {
        super(app);
        this.alchemistService = alchemistService;
        this.context = context;
        this.onSaveCallback = onSaveCallback; // ← assign it

        // Initialize state from the provided context or set defaults
        this.topic = context.topic || 'General';
        this.log = context.log || '';
        this.understanding = context.understanding || '⏹️';
        this.confidenceBefore = context.confidenceBefore || '⏹️';
        this.confidenceAfter = context.confidenceAfter || '⏹️';
        this.difficultyCauses = context.difficultyCauses || [];
        this.fixPrinciple = context.fixPrinciple || '';
        this.serendipitySpark = context.serendipitySpark || '';
        this.insight = context.insight || '';
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "Alchemist's Log 🧪" });

        // --- Tab Navigation ---
        const tabContainer = contentEl.createDiv({ cls: 'alchemist-modal-tabs' });
        ["core", "root", "growth"].forEach(tab => {
            const btn = tabContainer.createEl("button", { text: this.getTabName(tab) });
            if (this.activeTab === tab) btn.addClass('is-active');
            btn.onclick = () => {
                this.activeTab = tab;
                this.onOpen(); // Re-render the modal content
            };
        });

        // --- Topic Input ---
        if (this.context?.taskText) {
            new Setting(contentEl).setName("Topic").addText(text => text.setValue(this.topic).setDisabled(true));
        } else {
            new Setting(contentEl).setName("Topic").addText(text => text.setPlaceholder("e.g., Federalism").setValue(this.topic).onChange(v => this.topic = v));
        }

        // --- Render Active Tab ---
        this.renderTab(contentEl);

        // --- Action Buttons ---
        const btnContainer = contentEl.createDiv({ cls: 'alchemist-modal-buttons' });
        const saveBtn = btnContainer.createEl("button", { text: "Save Reflection", cls: "mod-cta" });

        // ---> THIS IS THE CORRECTED ONCLICK HANDLER <---
        saveBtn.onclick = async () => {
    const logData = this.buildEntry();
    await this.alchemistService.saveLog(logData);

    // ✅ Use the explicit callback
    if (this.onSaveCallback) {
        await this.onSaveCallback();
    } else {
        new Notice(`Reflection saved: ${this.topic}`);
    }

    this.close();
};
    }

    getTabName(tab: string): string {
        const names: Record<string, string> = { core: "Reflection Core", root: "Root Cause", growth: "Growth" };
        return names[tab] || tab;
    }

    renderTab(contentEl: HTMLElement) {
        switch (this.activeTab) {
            case "core": this.renderCoreTab(contentEl); break;
            case "root": this.renderRootTab(contentEl); break;
            case "growth": this.renderGrowthTab(contentEl); break;
        }
    }

    renderCoreTab(contentEl: HTMLElement) {
        contentEl.createEl("p", { text: "What surprised you? What felt shaky? What clicked?", cls: 'setting-item-description' });
        
        new Setting(contentEl).setName("Reflection").addTextArea(text => {
            text.setPlaceholder("...").setValue(this.log).onChange(v => this.log = v);
            text.inputEl.rows = 4;
        });
        
        new Setting(contentEl).setName("Understanding").addDropdown(d => {
            d.addOption("🔽", "Low").addOption("⏹️", "Medium").addOption("🔼", "High");
            d.setValue(this.understanding).onChange(v => this.understanding = v);
        });

        new Setting(contentEl).setName("Confidence Before → After").addDropdown(d => {
            d.addOption("🔽", "Low").addOption("⏹️", "Medium").addOption("🔼", "High");
            d.setValue(this.confidenceBefore).onChange(v => this.confidenceBefore = v);
        }).addDropdown(d => {
            d.addOption("🔽", "Low").addOption("⏹️", "Medium").addOption("🔼", "High");
            d.setValue(this.confidenceAfter).onChange(v => this.confidenceAfter = v);
        });
    }

    renderRootTab(contentEl: HTMLElement) {
        const causes = ["Flawed Foundation", "Faded Ink", "Tangled Threads", "Broken Crucible", "Poisoned Well"];
        contentEl.createEl('p', { text: 'Select difficulty causes that apply:' });
        const causeContainer = contentEl.createDiv({cls: 'alchemist-checkbox-group'});

        causes.forEach(cause => {
            const label = causeContainer.createEl('label');
            const checkbox = label.createEl('input', {type: 'checkbox'});
            checkbox.checked = this.difficultyCauses.includes(cause);
            checkbox.onchange = (e) => {
                if ((e.currentTarget as HTMLInputElement).checked) {
                    this.difficultyCauses.push(cause);
                } else {
                    this.difficultyCauses = this.difficultyCauses.filter(c => c !== cause);
                }
            };
            label.append(cause);
        });
    }

    renderGrowthTab(contentEl: HTMLElement) {
        new Setting(contentEl).setName("Fix Principle").setDesc("What mental model will you apply next time?").addText(text => text.setPlaceholder("e.g., View federalism as contractual partnership").setValue(this.fixPrinciple).onChange(v => this.fixPrinciple = v));
        new Setting(contentEl).setName("Serendipity Spark").setDesc("Link to another topic ([[...]])").addText(text => text.setPlaceholder("[[Other Topic]]").setValue(this.serendipitySpark).onChange(v => this.serendipitySpark = v));
        new Setting(contentEl).setName("Distilled Insight").setDesc("A reusable one-liner or mnemonic.").addTextArea(text => {
            text.setPlaceholder("e.g., Art 32 = SC's Sword, Art 226 = HC's Shield").setValue(this.insight).onChange(v => this.insight = v);
            text.inputEl.rows = 2;
        });
    }

    // Helper to gather all state into the final data object
    buildEntry(): AlchemistLogData {
    return {
        // Required fields – provide fallbacks if needed
        taskText: this.context.taskText || '', // or throw if truly required
        topic: this.topic.trim() || 'General',
        log: this.log.trim(),
        understanding: this.understanding,
        confidenceBefore: this.confidenceBefore,
        confidenceAfter: this.confidenceAfter,
        difficultyCauses: this.difficultyCauses,
        fixPrinciple: this.fixPrinciple.trim(),
        serendipitySpark: this.serendipitySpark.trim(),
        insight: this.insight.trim(),
        originalTaskId: this.context.originalTaskId,
        timestamp: this.context.timestamp || Date.now()
    };
    }

    onClose() {
        this.contentEl.empty();
    }
}