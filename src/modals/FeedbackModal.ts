// src/modals/FeedbackModal.ts

import { App, Modal, Notice } from 'obsidian';
import MythicMatrixPlugin from '../main';
import { AlchemistLogData } from '../services/AlchemistService';
import { QuickLossLogModal } from './QuickLossLogModal';

interface Task {
    id: string;
    text: string;
}

export class FeedbackModal extends Modal {
    plugin: MythicMatrixPlugin;
    task: Task;
    
    public result: 'log_now' | 'log_later' | null = null;

    constructor(app: App, plugin: MythicMatrixPlugin, task: Task) {
        super(app);
        this.plugin = plugin;
        this.task = task;
    }

    onOpen() {
        const { contentEl } = this;
        contentEl.empty();
        contentEl.createEl("h2", { text: "Alchemist's Log 🧪" });
        contentEl.createEl("p", { text: `Task: ${this.task.text}` }).style.opacity = "0.7";

        const btnContainer = contentEl.createDiv();
        btnContainer.style.display = "flex";
        btnContainer.style.gap = "10px";
        btnContainer.style.justifyContent = "flex-end";
        btnContainer.style.marginTop = "20px";

        const laterBtn = btnContainer.createEl("button", { text: "Log Later" });
        laterBtn.onclick = async () => {
            this.result = 'log_later';

            // --- NEW: L32 Generic Deferral Check + L85 Loom Override ---
            const taskId = this.task.id;
            const isLoom = this.task.text.includes("(Loom Type:");

            // Increment and get the NEW count
            const currentDeferralCount = this.plugin.lossLogService.incrementTaskDeferralCount(taskId);

            // Use configurable thresholds
            const genericThreshold = this.plugin.settings.generalDeferralThreshold || 3;
            const loomThreshold = this.plugin.settings.loomDeferralThreshold || 2;
            const thresholdToUse = isLoom ? loomThreshold : genericThreshold;

            // Logic for L85 Prompt
            const shouldPromptForLabyrinthL85 = isLoom && currentDeferralCount >= thresholdToUse;

            if (currentDeferralCount >= thresholdToUse) {
                const typeLabel = isLoom ? "Weaver's Loom task" : "task";
                const proceed = confirm(
                    `🛑 Deferral Loop Detected!\n\n` +
                    `You have deferred this ${typeLabel} ${currentDeferralCount} times.\n\n` +
                    `This indicates a Process Failure or Block. Do you want to log this obstacle to the Labyrinth to deconstruct it?`
                );

                if (proceed) {
                    this.close();
                    new QuickLossLogModal(
                        this.app,
                        this.plugin.lossLogService,
                        () => {},
                        {
                            sourceTask: this.task.text,
                            initialFailureType: "Process Failure",
                            initialArchetype: isLoom ? "overthinking" : "procrastination",
                            sourceTaskId: taskId
                        }
                    ).open();
                    return; // Stop further processing
                }
            }

            // --- EXISTING: Add to Alchemist Pending Queue ---
            const deferredEntry: Partial<AlchemistLogData> = {
                taskText: this.task.text,
                timestamp: Date.now(),
                topic: this.getTopicFromTask(this.task.text),
                originalTaskId: this.task.id,
                log: "",
                understanding: "⏹️",
                confidenceBefore: "⏹️",
                confidenceAfter: "⏹️",
                difficultyCauses: [],
                fixPrinciple: "",
                serendipitySpark: "",
                insight: "",
            };

            this.plugin.settings.alchemistPending.push(deferredEntry);
            await this.plugin.saveSettings();

            // --- NEW: Handle L85 Prompt (Based on incremented count) ---
            // Note: This block is theoretically redundant if the unified check above catches it,
            // but keeping it separate if you want distinct behavior for L85 specifically after the generic check.
            // However, in the unified flow above, `proceed` handles both.
            // If you specifically need the L85 logic to run *even if* the user dismissed the generic prompt (unlikely),
            // or if the logic is slightly different, here it is fixed:

            if (shouldPromptForLabyrinthL85) {
                // We already asked in the unified block above.
                // If you want to force a second specific check for Looms here:
                /*
                const shouldLogToLabyrinthL85 = confirm(`This Weaver's Loom task has now been deferred ${currentDeferralCount} times. Log the obstacle in the Labyrinth?`);
                if (shouldLogToLabyrinthL85) {
                    this.close();
                    // ... quick log logic ...
                    return;
                }
                */
                // Since the unified block handles it, we can skip duplicating the prompt here.
            }

            // --- EXISTING: Check for #blocked tag on Deferral (L24) ---
            if (this.task.text.includes("#blocked")) {
                 const shouldLogBlockToLabyrinth = confirm("This task is marked as blocked. Log the obstacle in the Labyrinth?");
                 if (shouldLogBlockToLabyrinth) {
                     this.close(); 

                     const initialContext = {
                         sourceTask: this.task.text,
                         initialFailureType: "Process Failure" as const,
                         initialArchetypes: ["process-failure"],
                         sourceTaskId: this.extractSourceNotePath(this.task.text),
                     };

                     new QuickLossLogModal(
                     this.app,
                     this.plugin.lossLogService, 
                     (submittedData) => {
                         console.log("Labyrinth quick log (L24) submitted via FeedbackModal blocked task prompt:", submittedData);
                         new Notice("Labyrinth: Block obstacle logged.");
                     },
                     initialContext
                     ).open();
                     return; 
                 }
            }

            await this.plugin.saveSettings();
            new Notice("Reflection deferred to Alchemist's Log");
            this.close();
        };

        const nowBtn = btnContainer.createEl("button", { text: "Log Now", cls: "mod-cta" });
        nowBtn.onclick = () => {
            this.result = 'log_now';

            // --- NEW: Reset Loom Deferral Count on Completion (L85) ---
            if (this.task.text.includes("(Loom Type:")) {
                console.log(`[FeedbackModal] Loom task ${this.task.id} is being completed (Log Now clicked). Resetting deferral count (L85).`);
                this.plugin.lossLogService.resetLoomDeferralCount(this.task.id);
                this.plugin.saveSettings().catch((e) =>
                    console.error("[FeedbackModal] Error saving settings after resetting loom deferral count:", e)
                );
            }

            this.plugin.openAlchemistLogModal({
                taskText: this.task.text,
                topic: this.getTopicFromTask(this.task.text),
                timestamp: Date.now()
            });
            this.close();
        };
    }

    private openLabyrinthQuickLog(failureType: string, archetypes: string[]) {
        this.close(); 

        const initialContext = {
            sourceTask: this.task.text,
            initialFailureType: failureType as any,
            initialArchetypes: archetypes,
            sourceTaskId: this.extractSourceNotePath(this.task.text) || this.task.id,
        };

        new QuickLossLogModal(
            this.app,
            this.plugin.lossLogService,
            (submittedData) => {
                console.log("Labyrinth quick log submitted via FeedbackModal prompt:", submittedData);
                new Notice("Labyrinth: Obstacle logged.");
            },
            initialContext
        ).open();
    }

    private getTopicFromTask(taskText: string): string {
        const match = taskText.match(/\[\[(.*?)\]\]/);
        return match ? match[1] : "General";
    }

    private extractSourceNotePath(taskText: string): string | undefined {
        const match = taskText.match(/\[\[([^\]]+)\]\]/);
        if (match) {
            const noteBasename = match[1];
            const noteFile = this.app.vault.getFiles().find(f => f.basename === noteBasename);
            return noteFile ? noteFile.path : undefined;
        }
        return undefined;
    }

    onClose() {
        const { contentEl } = this;
        contentEl.empty();
    }
}