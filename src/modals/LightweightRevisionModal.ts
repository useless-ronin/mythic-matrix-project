// src/modals/LightweightRevisionModal.ts

import { App, Modal, Setting } from 'obsidian';

/**
 * The data structure for the result when the modal is saved.
 */
export interface RevisionLogResult {
    log: string;
    understanding: string;
    nextFocus: string;
}

/**
 * The revision item data passed to the modal from the Phoenix Nest view.
 */
export interface RevisionItem {
    file: {
        basename: string;
        path: string;
    };
    revisionLevel?: number;
}

export class LightweightRevisionModal extends Modal {
    item: RevisionItem;

    // --- State properties for the modal inputs ---
    log: string = "";
    understanding: string = "⏹️"; // Default to Medium
    nextFocus: string = "";

    /**
     * This public property holds the result. It is null if the user cancels
     * and populated with RevisionLogResult if the user saves.
     */
    public result: RevisionLogResult | null = null;

    constructor(app: App, item: RevisionItem) {
        super(app);
        this.item = item;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.createEl("h2", { text: "Revision Reflection 🕊️" });
        contentEl.createEl("p", { text: `Note: ${this.item.file.basename}` }).style.opacity = "0.7";

        new Setting(contentEl)
            .setName("Understanding")
            .addDropdown(d => {
                d.addOption("🔽", "Low")
                 .addOption("⏹️", "Medium")
                 .addOption("🔼", "High")
                 .setValue(this.understanding)
                 .onChange(v => this.understanding = v);
            });

        new Setting(contentEl)
            .setName("Insight / Gap")
            .setDesc("What clicked or what’s still unclear?")
            .addTextArea(text => text
                .setPlaceholder("e.g., Art 226 covers Tribunals")
                .setValue(this.log)
                .onChange(v => this.log = v));

        new Setting(contentEl)
            .setName("Next Focus")
            .setDesc("What to prioritize in the next revision?")
            .addTextArea(text => text
                .setPlaceholder("e.g., Revise Art 226 scope with examples")
                .setValue(this.nextFocus)
                .onChange(v => this.nextFocus = v));

        const btnContainer = contentEl.createDiv();
        btnContainer.style.display = "flex";
        btnContainer.style.gap = "10px";
        btnContainer.style.justifyContent = "flex-end";
        btnContainer.style.marginTop = "15px";

        btnContainer.createEl("button", { text: "Cancel" }).onclick = () => {
            this.result = null; // Ensure result is null on cancel
            this.close();
        };

        const saveBtn = btnContainer.createEl("button", { text: "Save", cls: "mod-cta" });
        saveBtn.onclick = () => {
            this.result = {
                log: this.log.trim(),
                understanding: this.understanding,
                nextFocus: this.nextFocus.trim()
            };
            this.close();
        };
    }

    onClose() {
        this.contentEl.empty();
    }
}